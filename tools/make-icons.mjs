// Generates the PWA icons: a Nordic cross, drawn in code so there is no binary
// asset to maintain and no image library to install.
//
//   node tools/make-icons.mjs
//
// Writes client/public/icons/. These are small and deterministic, so unlike the
// audio they are committed.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'icons');

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode raw RGB pixels as a PNG. */
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const WHITE = [0xff, 0xff, 0xff];
const BLUE = [0x00, 0x2f, 0x6c];

/**
 * A Nordic cross on white. `inset` keeps the design inside the safe area for
 * maskable icons, where the platform may crop up to ~10% off every edge.
 */
function crossIcon(size, inset = 0) {
  const rgb = Buffer.alloc(size * size * 3);
  const span = size * (1 - inset * 2);
  const thickness = Math.round(span * 0.2);
  const barStart = Math.round(size / 2 - thickness / 2);
  const barEnd = barStart + thickness;
  const edge = Math.round(size * inset);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inVertical = x >= barStart && x < barEnd && y >= edge && y < size - edge;
      const inHorizontal = y >= barStart && y < barEnd && x >= edge && x < size - edge;
      const [r, g, b] = inVertical || inHorizontal ? BLUE : WHITE;
      const at = (y * size + x) * 3;
      rgb[at] = r; rgb[at + 1] = g; rgb[at + 2] = b;
    }
  }
  return png(size, size, rgb);
}

mkdirSync(outDir, { recursive: true });
const files = [
  ['icon-192.png', crossIcon(192)],
  ['icon-512.png', crossIcon(512)],
  ['icon-maskable-512.png', crossIcon(512, 0.12)],
  ['apple-touch-icon.png', crossIcon(180)],
];
for (const [name, buf] of files) {
  writeFileSync(join(outDir, name), buf);
  console.log(`  ${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} kB`);
}
console.log(`Wrote ${files.length} icon(s) to client/public/icons`);
