// Compiles content/*.json into the static files the app fetches at runtime.
// The JSON files in content/ are the source of truth; everything here is derived
// and gitignored, so a fresh clone runs this once before `vite`.
//
//   client/public/content/index.json          — module list for the home screen
//   client/public/content/lessons/<slug>.json — one lesson, fetched on demand
//   data/audio-index.json                     — every distinct Finnish string + its
//                                               audio id, consumed by build-audio.mjs
//
// Also validates the content and reports Vietnamese coverage, which is what the
// old SQLite build did. A validation failure exits non-zero and writes nothing.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioId } from './audio-id.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content');
const outDir = join(root, 'client', 'public', 'content');
const dataDir = join(root, 'data');

// Field lists, declared once. Anything listed is copied through to the app;
// adding a field means adding it here and nowhere else.
const COLS = {
  module: ['slug', 'number', 'emoji', 'title', 'title_vi', 'subtitle', 'subtitle_vi',
           'description', 'description_vi', 'level'],
  lesson: ['slug', 'number', 'title', 'title_vi', 'subtitle', 'subtitle_vi',
           'warmup_situation', 'warmup_situation_vi', 'warmup_question', 'warmup_question_vi',
           'rescue_fi', 'rescue_en', 'rescue_vi', 'rescue_note', 'rescue_note_vi'],
  vocab: ['fi', 'fi_book', 'en', 'vi', 'literal', 'literal_vi', 'pos', 'note', 'note_vi'],
  phrase: ['fi', 'fi_book', 'en', 'vi', 'literal', 'literal_vi', 'when_to_use', 'when_to_use_vi', 'register'],
  dialogue: ['title', 'title_vi', 'setting', 'setting_vi', 'speed', 'note', 'note_vi'],
  dline: ['speaker', 'fi', 'en', 'vi', 'note', 'note_vi'],
  roleplay: ['title', 'title_vi', 'scenario', 'scenario_vi', 'your_role', 'your_role_vi',
             'partner_role', 'partner_role_vi'],
  rturn: ['speaker', 'is_your_turn', 'fi', 'en', 'vi', 'hint', 'hint_vi'],
};

// Every English column expected to have a `_vi` twin, for coverage reporting.
const TRANSLATABLE = {
  module: ['title', 'subtitle', 'description'],
  lesson: ['title', 'subtitle', 'warmup_situation', 'warmup_question', 'rescue_note'],
  vocab: ['literal', 'note'],
  phrase: ['literal', 'when_to_use'],
  dialogue: ['title', 'setting', 'note'],
  dline: ['note'],
  roleplay: ['title', 'scenario', 'your_role', 'partner_role'],
  rturn: ['hint'],
};

/** Copy the listed fields, dropping empties so the shipped JSON stays small. */
function pick(obj, cols, extra = {}) {
  const out = { ...extra };
  for (const c of cols) {
    const v = obj[c];
    if (v !== null && v !== undefined && v !== '') out[c] = v;
  }
  return out;
}

const errors = [];
const stats = { modules: 0, lessons: 0, vocab: 0, phrases: 0, dialogues: 0, lines: 0, roleplays: 0, turns: 0 };
const vi = { done: 0, missing: 0, missingBy: new Map() };
const audio = new Map(); // aid -> Finnish text

/** Count how much of this object's translatable text has a Vietnamese twin. */
function checkVi(kind, obj, where) {
  const fields = [...(obj.en !== undefined ? ['en'] : []), ...TRANSLATABLE[kind]];
  for (const f of fields) {
    if (obj[f] == null || obj[f] === '') continue;
    const twin = f === 'en' ? 'vi' : `${f}_vi`;
    if (obj[twin]) vi.done++;
    else {
      vi.missing++;
      vi.missingBy.set(where, (vi.missingBy.get(where) ?? 0) + 1);
    }
  }
}

/** Register a spoken string and return its audio id. */
function spoken(obj, where, what) {
  if (!obj.fi || !String(obj.fi).trim()) {
    errors.push(`${where}: ${what} has no Finnish text`);
    return null;
  }
  const aid = audioId(obj.fi);
  audio.set(aid, obj.fi.trim());
  return aid;
}

const files = readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('No content files found in content/ — nothing to build.');
  process.exit(1);
}

const index = [];
const lessons = [];     // { slug, json } in course order
const seenLesson = new Map();
const seenModule = new Set();

for (const [fileIndex, file] of files.entries()) {
  const mod = JSON.parse(readFileSync(join(contentDir, file), 'utf8'));
  for (const required of ['slug', 'number', 'title']) {
    if (!mod[required]) errors.push(`${file}: module is missing "${required}"`);
  }
  if (seenModule.has(mod.slug)) errors.push(`${file}: duplicate module slug "${mod.slug}"`);
  seenModule.add(mod.slug);
  checkVi('module', mod, mod.slug);
  stats.modules++;

  const modRef = { slug: mod.slug, number: mod.number, emoji: mod.emoji ?? '', title: mod.title, title_vi: mod.title_vi ?? null };
  const listed = [];

  for (const [li, lesson] of (mod.lessons ?? []).entries()) {
    const where = `${mod.slug}/${lesson.slug}`;
    for (const required of ['slug', 'number', 'title']) {
      if (!lesson[required]) errors.push(`${where}: lesson is missing "${required}"`);
    }
    if (seenLesson.has(lesson.slug)) errors.push(`${where}: duplicate lesson slug, also in ${seenLesson.get(lesson.slug)}`);
    seenLesson.set(lesson.slug, where);
    checkVi('lesson', lesson, where);
    // rescue_en/rescue_vi is the one pair that doesn't follow the `en`/`vi` naming.
    if (lesson.rescue_en) {
      if (lesson.rescue_vi) vi.done++;
      else { vi.missing++; vi.missingBy.set(where, (vi.missingBy.get(where) ?? 0) + 1); }
    }
    stats.lessons++;

    const out = pick(lesson, COLS.lesson, { id: li + 1, module: modRef });
    if (lesson.rescue_fi) out.rescue_aid = audioId(lesson.rescue_fi), audio.set(out.rescue_aid, lesson.rescue_fi.trim());

    out.vocab = (lesson.vocab ?? []).map((v, i) => {
      checkVi('vocab', v, where);
      stats.vocab++;
      return pick(v, COLS.vocab, { id: i + 1, aid: spoken(v, where, `vocab[${i}]`) });
    });

    out.phrases = (lesson.phrases ?? []).map((p, i) => {
      checkVi('phrase', p, where);
      stats.phrases++;
      return pick(p, COLS.phrase, { id: i + 1, aid: spoken(p, where, `phrases[${i}]`) });
    });

    out.dialogues = (lesson.dialogues ?? []).map((d, i) => {
      checkVi('dialogue', d, where);
      stats.dialogues++;
      const dialogue = pick({ ...d, speed: d.speed ?? 'natural' }, COLS.dialogue, { id: i + 1 });
      dialogue.lines = (d.lines ?? []).map((l, j) => {
        checkVi('dline', l, where);
        stats.lines++;
        return pick(l, COLS.dline, { id: j + 1, aid: spoken(l, where, `dialogues[${i}].lines[${j}]`) });
      });
      return dialogue;
    });

    out.roleplays = (lesson.roleplays ?? []).map((r, i) => {
      checkVi('roleplay', r, where);
      stats.roleplays++;
      const roleplay = pick(r, COLS.roleplay, { id: i + 1 });
      roleplay.turns = (r.turns ?? []).map((t, j) => {
        checkVi('rturn', t, where);
        stats.turns++;
        return pick({ ...t, is_your_turn: t.is_your_turn ? 1 : 0 }, COLS.rturn,
          { id: j + 1, aid: spoken(t, where, `roleplays[${i}].turns[${j}]`) });
      });
      return roleplay;
    });

    if (out.vocab.length === 0) errors.push(`${where}: no vocab`);
    if (out.dialogues.length === 0) errors.push(`${where}: no dialogues`);

    lessons.push({ slug: lesson.slug, json: out });
    listed.push({ slug: lesson.slug, number: lesson.number, title: lesson.title, title_vi: lesson.title_vi ?? null,
                  subtitle: lesson.subtitle ?? null, subtitle_vi: lesson.subtitle_vi ?? null });
  }

  index.push({ ...pick(mod, COLS.module), sort_order: mod.sort_order ?? fileIndex, lesson_count: listed.length, lessons: listed });
}

if (errors.length) {
  console.error(`Content is invalid — ${errors.length} problem(s), nothing written:\n`);
  for (const e of errors.slice(0, 40)) console.error(`  ${e}`);
  if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
  process.exit(1);
}

// prev/next run across module boundaries, in course order.
lessons.forEach((entry, i) => {
  const ref = (n) => n && ({ slug: n.json.slug, number: n.json.number, title: n.json.title, title_vi: n.json.title_vi ?? null });
  entry.json.prev = ref(lessons[i - 1]) ?? null;
  entry.json.next = ref(lessons[i + 1]) ?? null;
});

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'lessons'), { recursive: true });
mkdirSync(dataDir, { recursive: true });

let bytes = 0;
const write = (path, data) => {
  const body = JSON.stringify(data);
  bytes += Buffer.byteLength(body);
  writeFileSync(path, body);
};

write(join(outDir, 'index.json'), index.sort((a, b) => a.sort_order - b.sort_order));
for (const { slug, json } of lessons) write(join(outDir, 'lessons', `${slug}.json`), json);

const clips = [...audio].map(([aid, text]) => ({ aid, text }));
writeFileSync(join(dataDir, 'audio-index.json'), JSON.stringify(clips, null, 1) + '\n');

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`Built client/public/content from ${files.length} content file(s)`);
console.log(Object.entries(stats).map(([k, v]) => `  ${v} ${k}`).join('\n'));
console.log(`  ${kb(bytes)} of JSON, largest lesson ${kb(Math.max(...lessons.map((l) => JSON.stringify(l.json).length)))}`);
console.log(`  ${clips.length} distinct Finnish strings → data/audio-index.json`);

const total = vi.done + vi.missing;
const pct = total ? Math.round((vi.done / total) * 100) : 100;
console.log(`\nVietnamese: ${vi.done}/${total} strings (${pct}%)`);
if (vi.missing) {
  console.log('  Untranslated, by lesson:');
  for (const [where, n] of [...vi.missingBy].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n.toString().padStart(4)}  ${where}`);
  }
}
