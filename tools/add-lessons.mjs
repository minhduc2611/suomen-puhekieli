// Appends lessons from a JSON array file onto a module's `lessons`, in place.
// Lets a long module be authored across several passes without rewriting the file.
//   node db/add-lessons.mjs content/02-restaurant.json /tmp/more-lessons.json
import { readFileSync, writeFileSync } from 'node:fs';

const [, , modulePath, lessonsPath] = process.argv;
const mod = JSON.parse(readFileSync(modulePath, 'utf8'));
const incoming = JSON.parse(readFileSync(lessonsPath, 'utf8'));

if (!Array.isArray(incoming)) throw new Error('Lessons file must be a JSON array');

const existing = new Set((mod.lessons ?? []).map((l) => l.slug));
const dupes = incoming.filter((l) => existing.has(l.slug));
if (dupes.length) {
  console.error(`Refusing to append — these slugs already exist: ${dupes.map((d) => d.slug).join(', ')}`);
  process.exit(1);
}

mod.lessons = [...(mod.lessons ?? []), ...incoming];
writeFileSync(modulePath, JSON.stringify(mod, null, 2) + '\n');
console.log(`Appended ${incoming.length} lesson(s) → ${mod.lessons.length} total in ${modulePath}`);
