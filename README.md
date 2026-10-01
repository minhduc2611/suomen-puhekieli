# Puhu suomee — spoken Finnish conversation course

Spoken Finnish (*puhekieli*), the way people actually talk: `mä`, `sä`, `onks`, `mennään`.
Not academic Finnish. A **static, installable PWA** — React + Vite, no server and no database:
content is JSON generated from `content/*.json`, and every Finnish line is spoken by the device's
own Finnish voice. Install it on a phone and it works with no network.

Explanations are **bilingual — English and Tiếng Việt** — switched with the EN/VI toggle in the
header. Finnish itself never changes; only the language it is explained in does.

## Run it

```bash
npm install
npm run dev          # compile content, then start the web app
```

Open the address Vite prints. Speech comes from the device — nothing to generate and nothing to
download. Optionally, `npm run audio` builds a pack of MP3s in a consistent voice for local use;
see [Audio](#audio).

| Command | What it does |
|---|---|
| `npm run content` | `content/*.json` → `client/public/content/`, with validation and translation coverage |
| `npm run audio` | Optional: generate an MP3 pack into `client/public/audio/` |
| `npm run icons` | Redraw the PWA icons |
| `npm run dev` | Compile content, then Vite on :5173 |
| `npm run build` | Compile content, then build `dist/` |
| `npm run preview` | Serve the built `dist/` — the only way to exercise the service worker |
| `npm run verify` | Check every spoken line has an audio id and a file, and that prev/next is intact |
| `npm run deploy` | Build without the MP3 pack and upload `dist/` to Netlify |
| `npm run deploy:with-audio` | Same, but ships the generated pack (~290 MB) |

`dist/` is plain static files: copy it to any static host (Netlify, GitHub Pages, a folder behind
nginx). Nothing server-side runs.

### Deploying

`npm run build` produces a **2.4 MB** `dist/` — app, icons and the whole course text. No audio is
involved, so any static host works and a git-driven build needs nothing special; `netlify.toml`
builds with `npm run content && npm run build`.

```bash
npm run deploy             # build without the MP3 pack, then netlify deploy --prod
npm run deploy:with-audio  # ~290 MB: ships the pack, so every device sounds the same
```

`deploy:with-audio` is the answer if the device voice disappoints — a phone with no Finnish voice
installed can't speak Finnish at all, and the pack sidesteps that without putting 280 MB in git.

If you ever *do* want to serve the pre-generated pack, build with it present (`npm run audio` first,
then `npm run build`) and upload the result — it's ~290 MB — or host the clips separately and point
the app at them:

```bash
VITE_AUDIO_BASE=https://audio.example.com/ npm run build
```

Either way the app is told at build time whether a pack exists; when it doesn't, the file-playing
code is tree-shaken out and no audio request is ever made.

### Installing it on a phone

Serve `dist/` over **https** (a service worker will not register otherwise, `localhost` excepted),
open it, and use *Add to Home Screen* (iOS Safari) or *Install app* (Android Chrome). The app shell
and **all 97 lessons of text** are precached on first load, so the whole course reads offline
immediately, and speech comes from the device, so that works offline too — check you have a Finnish
voice installed (see [Audio](#audio)). When a build serves the optional MP3 pack, clips are cached
as you play them and the **Save audio offline** button fetches a whole lesson at once.

If you host under a subpath, set `base` in `vite.config.js` — every content and audio URL is built
from `import.meta.env.BASE_URL`, so that one setting is enough.

## How content works

`content/*.json` is the **source of truth**. One file per module. `npm run content` validates it and
regenerates everything derived, so editing a JSON file and re-running is always safe:

```
client/public/content/index.json          the module list
client/public/content/lessons/<slug>.json one lesson, fetched on demand (~24 kB at most)
data/audio-index.json                     every distinct Finnish string + its audio id
```

Validation is fail-loud: a duplicate lesson slug, a missing title or a spoken line with no Finnish
text aborts the build and writes nothing. Each generated file is small enough that the service
worker can precache the entire course text (~2 MB).

A module file looks like this:

```jsonc
{
  "slug": "small-talk", "number": "01", "emoji": "👋",
  "title": "…", "subtitle": "…", "description": "…", "level": "A1–A2",
  "lessons": [{
    "slug": "hi-and-names", "number": "1.1", "title": "…", "subtitle": "…",
    "warmup_situation": "…", "warmup_question": "…",
    "rescue_fi": "…", "rescue_en": "…", "rescue_note": "…",
    "vocab":    [{ "fi": "mä", "fi_book": "minä", "en": "I", "literal": "…", "pos": "pronoun", "note": "…" }],
    "phrases":  [{ "fi": "…", "fi_book": "…", "en": "…", "literal": "…", "when_to_use": "…", "register": "casual" }],
    "dialogues":[{ "title": "…", "setting": "…", "speed": "slow", "note": "…",
                   "lines": [{ "speaker": "Anni", "fi": "…", "en": "…", "note": "…" }] }],
    "roleplays":[{ "title": "…", "scenario": "…", "your_role": "…", "partner_role": "…",
                   "turns": [{ "speaker": "You", "is_your_turn": true, "fi": "…", "en": "…", "hint": "…" }] }]
  }]
}
```

Only `slug`, `number`, `title` and the `fi`/`en` pairs are required — every other field is optional
and simply won't render if absent.

**`fi` is always the spoken form**; `fi_book` is the kirjakieli equivalent, shown underneath when it
differs. Each lesson has two dialogues: one `"speed": "slow"` and one `"speed": "natural"`. The slow
one plays at Google's 0.7× rate automatically.

`is_your_turn: true` marks a role-play line the learner should produce — the Finnish is hidden
behind a "Show the Finnish" button and only the `hint` shows first.

## Bilingual content

Every explanatory field has a `_vi` twin, and `en` is twinned by `vi`:

| English field | Vietnamese field |
|---|---|
| `en` | `vi` |
| `rescue_en` | `rescue_vi` |
| `note`, `literal`, `when_to_use`, `hint`, `title`, `subtitle`, `setting`, `scenario`, `description`, `warmup_situation`, `warmup_question`, `rescue_note`, `your_role`, `partner_role` | same name + `_vi` |

Finnish is never duplicated — `fi` and `fi_book` are the language being learned, not an explanation
of it. A missing `_vi` value **falls back to English** in the UI, so translation can lag new content
without breaking anything. `npm run content` prints coverage and lists which lessons still need work:

```
Vietnamese: 11279/11279 strings (100%)
```

Interface chrome (section headings, buttons) lives in `client/src/lib/lang.jsx`, not the database.

### Translating a module

You can add `_vi` fields by hand, or write only the Vietnamese as a patch and merge it:

```bash
node tools/merge-vi.mjs content/02-restaurant.json tools/translations/02.vi.json
```

A patch mirrors the module's shape but carries only translations. Arrays are **positional** and must
match the English length exactly — a mismatch aborts the merge and writes nothing, rather than
silently shifting translations onto the wrong rows. An array entry may be a bare string as shorthand
for `{ "vi": "…" }`:

```jsonc
{
  "lessons": {
    "hi-and-names": {
      "lesson":  { "title_vi": "Chào hỏi và tên", "rescue_vi": "…" },
      "vocab":   [ "chào", { "vi": "tên", "note_vi": "…" } ],
      "dialogues": [ { "title_vi": "…", "lines": [ { "vi": "…" } ] } ]
    }
  }
}
```

Patches live in `tools/translations/` and are kept after merging, as a record of what was translated.

## Audio

**By default the app speaks with the device's own Finnish voice** (`speechSynthesis`, `fi-FI`).
Nothing is shipped, nothing is fetched, and it works offline. Google's TTS can't be used directly —
browsers can't call that endpoint (no CORS headers) — so runtime speech means the device's engine.

The catch is that the voice has to be installed, and quality varies by platform. If it isn't there,
the lesson header says so and explains where to get it:

- **iOS** — Settings → Accessibility → Spoken Content → Voices → Finnish
- **Android** — Settings → System → Languages → Text-to-speech output → install Finnish
- **macOS** — System Settings → Accessibility → Spoken Content → System Voice → Manage Voices

Without a Finnish voice the text is read by some other language's voice and comes out wrong, which
is worse than useless for learning, hence the warning rather than silent degradation.

### The optional MP3 pack

For one consistent, good-quality voice, `npm run audio` pre-generates every line through Google
Translate's Finnish TTS:

```bash
npm run audio                        # everything, both speeds (~12,000 files, ~280 MB)
npm run audio -- --module=12         # one module
npm run audio -- --lesson=job-interview
npm run audio -- --speed=normal      # skip the slow variants
npm run audio -- --limit=50          # try a handful first
```

`npm run content` gives every distinct Finnish string an **audio id** — the first 16 hex of its
SHA-1 — and stamps it into the lesson JSON as `aid`. The pack is `<aid>.mp3` and `<aid>-s.mp3` (the
0.7× slow variant), so the app plays a URL it can compute, with no lookup table to keep in sync.
Existing files are skipped on a rerun, and responses are cached under `data/tts-cache/` keyed by
SHA-1 of speed + text, so regenerating after a content edit costs nothing for unchanged lines. Text
over ~190 characters is split on punctuation and the MP3 frames concatenated, since the upstream
endpoint rejects long strings.

A build that can see `client/public/audio/manifest.json` uses the pack and shows a **Save audio
offline** button per lesson; a build without it uses the device voice. The pack is **gitignored** —
regenerate it rather than committing it, and if a single clip is missing at runtime, that one line
falls back to the device voice.

## Layout

```
content/       one JSON file per module — edit these
tools/
  build-content.mjs  content/*.json → client/public/content/, validation + VI coverage
  build-audio.mjs    audio index → client/public/audio/*.mp3
  audio-id.mjs       the one definition of an audio id, shared by both builds
  tts.mjs            Google TTS: chunking, retries, disk cache
  make-icons.mjs     draws the PWA icons (no image library)
  merge-vi.mjs       merges a Vietnamese patch into a content file
  add-lessons.mjs    appends lessons to a module across several passes
  translations/      the Vietnamese patches
client/
  index.html
  public/        generated content/ and audio/ (gitignored), committed icons/
  src/lib/content.js  the only place that knows where content and audio live
  src/lib/audio.js    device speech + optional MP3 pack; play, stop, playSequence
  src/lib/offline.js  "save this lesson for offline"
  src/lib/lang.jsx    EN/VI context, field picker, interface strings
  src/components/     ModuleList, Lesson, Dialogue, Roleplay, Play, AudioSource, AppStatus
data/          generated — tts-cache/ and audio-index.json (gitignored)
```

There is no runtime dependency at all: `package.json` has an empty `dependencies` block, and React,
Vite and the PWA plugin are dev dependencies that disappear into `dist/`.

## Curriculum

See [CURRICULUM.md](CURRICULUM.md) — 14 modules, 97 lessons, A1 to B1.

The course currently holds 2,710 vocabulary items, 1,162 key phrases, 194 dialogues (2,134 lines)
and 97 role-plays (972 turns), fully bilingual English/Vietnamese — 6,023 distinct Finnish strings
to speak, 7,075 playable lines in all.
