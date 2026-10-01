// Pre-generates the Finnish audio the app plays, so the shipped app needs no server.
//
//   node tools/build-audio.mjs                     every clip, both speeds
//   node tools/build-audio.mjs --module=12          one module
//   node tools/build-audio.mjs --lesson=job-interview
//   node tools/build-audio.mjs --speed=normal       skip the slow variants
//   node tools/build-audio.mjs --limit=50           try a handful first
//
// Files land in client/public/audio/<aid>.mp3 (normal) and <aid>-s.mp3 (slow),
// which is gitignored — regenerate rather than commit. Already-generated files are
// skipped, and data/tts-cache means a rerun after `npm run content` costs nothing.
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTts } from './tts.mjs';
import { audioId } from './audio-id.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentOut = join(root, 'client', 'public', 'content');
const audioDir = join(root, 'client', 'public', 'audio');
const indexFile = join(root, 'data', 'audio-index.json');

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  return [k, v];
}));

if (!existsSync(indexFile)) {
  console.error('No data/audio-index.json — run `npm run content` first.');
  process.exit(1);
}

const speeds = args.get('speed') === 'normal' ? ['normal']
  : args.get('speed') === 'slow' ? ['slow']
  : ['normal', 'slow'];
const force = args.has('force');
const concurrency = Number(args.get('concurrency') ?? 4);

/** The clips to generate: everything, or just one module's or lesson's. */
function selectClips() {
  const all = JSON.parse(readFileSync(indexFile, 'utf8'));
  const lessonSlug = args.get('lesson');
  const moduleKey = args.get('module');
  if (!lessonSlug && !moduleKey) return all;

  const index = JSON.parse(readFileSync(join(contentOut, 'index.json'), 'utf8'));
  let slugs;
  if (lessonSlug) {
    slugs = [lessonSlug];
  } else {
    const mod = index.find((m) => m.number === moduleKey || m.slug === moduleKey || m.number === moduleKey.padStart(2, '0'));
    if (!mod) {
      console.error(`No module "${moduleKey}". Known: ${index.map((m) => `${m.number} (${m.slug})`).join(', ')}`);
      process.exit(1);
    }
    slugs = mod.lessons.map((l) => l.slug);
  }

  const wanted = new Set();
  for (const slug of slugs) {
    const file = join(contentOut, 'lessons', `${slug}.json`);
    if (!existsSync(file)) {
      console.error(`No lesson "${slug}" — run \`npm run content\` or check the slug.`);
      process.exit(1);
    }
    const lesson = JSON.parse(readFileSync(file, 'utf8'));
    const texts = [
      ...(lesson.rescue_fi ? [lesson.rescue_fi] : []),
      ...lesson.vocab.map((v) => v.fi),
      ...lesson.phrases.map((p) => p.fi),
      ...lesson.dialogues.flatMap((d) => d.lines.map((l) => l.fi)),
      ...lesson.roleplays.flatMap((r) => r.turns.map((t) => t.fi)),
    ];
    for (const text of texts) wanted.add(audioId(text));
  }
  return all.filter((c) => wanted.has(c.aid));
}

let clips = selectClips();
if (args.has('limit')) clips = clips.slice(0, Number(args.get('limit')));

const fileFor = (aid, speed) => join(audioDir, speed === 'slow' ? `${aid}-s.mp3` : `${aid}.mp3`);

const jobs = [];
for (const clip of clips) {
  for (const speed of speeds) {
    const file = fileFor(clip.aid, speed);
    if (force || !existsSync(file)) jobs.push({ ...clip, speed, file });
  }
}

mkdirSync(audioDir, { recursive: true });
const tts = createTts(join(root, 'data', 'tts-cache'));

const existing = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => f.endsWith('.mp3')).length : 0;
console.log(`${clips.length} clip(s) selected · speeds: ${speeds.join(', ')} · ${existing} file(s) already generated`);
if (jobs.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}
console.log(`Generating ${jobs.length} file(s)…`);

let done = 0, failed = 0, bytes = 0;
const started = Date.now();

async function run(job) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { buffer } = await tts.synth(job.text, job.speed);
      writeFileSync(job.file, buffer);
      bytes += buffer.length;
      return;
    } catch (err) {
      if (attempt === 3) {
        failed++;
        console.error(`  failed: ${job.text.slice(0, 48)} (${job.speed}) — ${err.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
    }
  }
}

// A few at a time: enough to be quick, gentle enough not to get rate-limited.
const queue = jobs.slice();
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
  while (queue.length) {
    await run(queue.shift());
    if (++done % 100 === 0 || done === jobs.length) {
      const pct = Math.round((done / jobs.length) * 100);
      process.stdout.write(`  ${done}/${jobs.length} (${pct}%)\r`);
    }
  }
}));

const total = readdirSync(audioDir).filter((f) => f.endsWith('.mp3'));
const size = total.reduce((n, f) => n + statSync(join(audioDir, f)).size, 0);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`\nWrote ${jobs.length - failed} file(s), ${mb(bytes)}, in ${Math.round((Date.now() - started) / 1000)}s`);
if (failed) console.log(`${failed} failed — rerun to retry just those.`);
console.log(`client/public/audio now holds ${total.length} file(s), ${mb(size)}`);

// A tiny manifest lets the app tell "audio generated" from "audio missing" without
// probing. It lives beside the clips, so `npm run content` doesn't wipe it.
writeFileSync(join(audioDir, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString(), files: total.length, speeds }));
