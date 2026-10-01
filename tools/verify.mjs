// Checks the generated output against the content: every spoken line has an audio
// id, every audio id has a file, and the course chain is intact.
//   node tools/verify.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentOut = join(root, 'client', 'public', 'content');
const audioDir = join(root, 'client', 'public', 'audio');

const index = JSON.parse(readFileSync(join(contentOut, 'index.json'), 'utf8'));
const problems = [];
let lessons = 0, clips = 0, missingNormal = 0, missingSlow = 0;
const slugs = [];

for (const mod of index) {
  for (const { slug } of mod.lessons) {
    const file = join(contentOut, 'lessons', `${slug}.json`);
    if (!existsSync(file)) { problems.push(`${slug}: no lesson file`); continue; }
    const lesson = JSON.parse(readFileSync(file, 'utf8'));
    lessons++;
    slugs.push({ slug, number: lesson.number, prev: lesson.prev?.slug ?? null, next: lesson.next?.slug ?? null });

    const spoken = [
      ...(lesson.rescue_fi ? [{ fi: lesson.rescue_fi, aid: lesson.rescue_aid, slow: true }] : []),
      ...lesson.vocab.map((v) => ({ ...v, slow: false })),
      ...lesson.phrases.map((p) => ({ ...p, slow: true })),
      ...lesson.dialogues.flatMap((d) => d.lines.map((l) => ({ ...l, slow: d.speed === 'slow' }))),
      ...lesson.roleplays.flatMap((r) => r.turns.map((t) => ({ ...t, slow: false }))),
    ];
    for (const item of spoken) {
      clips++;
      if (!item.fi) problems.push(`${slug}: spoken item with no Finnish`);
      if (!item.aid) { problems.push(`${slug}: "${String(item.fi).slice(0, 30)}" has no audio id`); continue; }
      if (!existsSync(join(audioDir, `${item.aid}.mp3`))) missingNormal++;
      if (item.slow && !existsSync(join(audioDir, `${item.aid}-s.mp3`))) missingSlow++;
    }
  }
}

for (let i = 0; i < slugs.length; i++) {
  const expectedPrev = i > 0 ? slugs[i - 1].slug : null;
  const expectedNext = i < slugs.length - 1 ? slugs[i + 1].slug : null;
  if (slugs[i].prev !== expectedPrev) problems.push(`${slugs[i].slug}: prev is ${slugs[i].prev}, expected ${expectedPrev}`);
  if (slugs[i].next !== expectedNext) problems.push(`${slugs[i].slug}: next is ${slugs[i].next}, expected ${expectedNext}`);
}

const files = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => f.endsWith('.mp3')) : [];
const bytes = files.reduce((n, f) => n + statSync(join(audioDir, f)).size, 0);

console.log(`${index.length} modules · ${lessons} lessons · ${clips} playable lines`);
console.log(`course chain: ${slugs[0].number}/${slugs[0].slug} → ${slugs.at(-1).number}/${slugs.at(-1).slug}`);
console.log(`audio: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(0)} MB`);
console.log(`missing audio: ${missingNormal} normal, ${missingSlow} slow`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : '\nNo problems.');
process.exit(problems.length ? 1 : 0);
