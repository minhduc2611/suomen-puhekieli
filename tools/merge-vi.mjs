// Merges a Vietnamese translation patch into a content module file, in place.
//
//   node db/merge-vi.mjs content/00-start-here.json db/translations/00.vi.json
//
// A patch mirrors the module's shape but carries only `_vi` fields. Arrays are
// positional and must match the English length exactly — a mismatch aborts the
// whole merge rather than silently shifting translations onto the wrong rows.
// An array entry may be a bare string, which is shorthand for { "vi": "…" }.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , contentPath, patchPath] = process.argv;
if (!contentPath || !patchPath) {
  console.error('Usage: node db/merge-vi.mjs <content file> <patch file>');
  process.exit(1);
}

const content = JSON.parse(readFileSync(contentPath, 'utf8'));
const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
const errors = [];
let applied = 0;

/** Copy every key of `src` onto `dst`, skipping empties. */
function assign(dst, src, where) {
  if (!src) return;
  const fields = typeof src === 'string' ? { vi: src } : src;
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '' || k === 'lines' || k === 'turns') continue;
    if (!k.endsWith('_vi') && k !== 'vi') {
      errors.push(`${where}: "${k}" is not a translation field`);
      continue;
    }
    dst[k] = v;
    applied++;
  }
}

/** Walk two positional arrays in lockstep, refusing to proceed on a length mismatch. */
function zip(list, patchList, where, fn) {
  if (!patchList) return;
  if (!Array.isArray(list) || list.length !== patchList.length) {
    errors.push(`${where}: ${patchList.length} translations for ${list?.length ?? 0} items`);
    return;
  }
  patchList.forEach((p, i) => fn(list[i], p, `${where}[${i}]`));
}

assign(content, patch.module, 'module');

for (const [slug, lp] of Object.entries(patch.lessons ?? {})) {
  const lesson = content.lessons?.find((l) => l.slug === slug);
  if (!lesson) { errors.push(`lesson "${slug}" not found in ${contentPath}`); continue; }

  assign(lesson, lp.lesson, `${slug}.lesson`);
  zip(lesson.vocab, lp.vocab, `${slug}.vocab`, (item, p, w) => assign(item, p, w));
  zip(lesson.phrases, lp.phrases, `${slug}.phrases`, (item, p, w) => assign(item, p, w));

  zip(lesson.dialogues, lp.dialogues, `${slug}.dialogues`, (d, p, w) => {
    assign(d, p, w);
    zip(d.lines, p.lines, `${w}.lines`, (line, lpatch, lw) => assign(line, lpatch, lw));
  });

  zip(lesson.roleplays, lp.roleplays, `${slug}.roleplays`, (r, p, w) => {
    assign(r, p, w);
    zip(r.turns, p.turns, `${w}.turns`, (turn, tp, tw) => assign(turn, tp, tw));
  });
}

if (errors.length) {
  console.error(`Merge aborted — ${errors.length} problem(s), nothing written:`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
  if (errors.length > 20) console.error(`  …and ${errors.length - 20} more`);
  process.exit(1);
}

writeFileSync(contentPath, JSON.stringify(content, null, 2) + '\n');
console.log(`Merged ${applied} Vietnamese strings into ${contentPath}`);
