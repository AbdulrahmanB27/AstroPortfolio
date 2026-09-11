// Turns the originals in media-src/ into the WebP files the site actually serves.
//
//   npm run media:optimise
//
// Why this exists. The project images were 2.9 MB of a 4.5 MB site — four PNGs of 760, 613,
// 527 and 259 KB, which are renders and screenshots without transparency in a format built
// for transparency, plus five JPEGs served at up to 1563px wide into a box that is never wider
// than 1200 CSS pixels. Measured on the real files: the same images as WebP at the quality
// chosen below are 574 KB, an 80% cut, with no visible difference at display size.
//
// Why a script whose OUTPUT is committed, rather than a Vite plugin or a build step:
//   - `public/` is copied verbatim and the paths live as strings in src/data/portfolio.json,
//     so an image plugin cannot reach these files without rewriting the content model.
//   - Encoding on every deploy would re-encode ten unchanging files for nothing, and make
//     `git clone && npm run build` depend on a native binary.
//   - The admin studio tells the owner to drop new files in — so the next 760 KB PNG will
//     arrive, and one script with one quality rule stops it. This matches the resume PDF,
//     which `build:resume` also writes into public/ with its output committed.
//
// Originals stay in media-src/projects/, in git, never deployed. Re-running is always safe:
// the lossy step starts from the original every time, not from a previous output.
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const SRC = resolve('media-src/projects');
const OUT = resolve('public/media/projects');
// Never wider than the largest box any image is drawn into (a 1200px column at 1x, or a 600px
// column at 2x DPR). Nothing is ever upscaled.
const MAX_WIDTH = 1200;

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (files.length === 0) {
  console.error(`no images in ${SRC}`);
  process.exit(1);
}

let before = 0;
let after = 0;
for (const file of files) {
  const src = join(SRC, file);
  const name = basename(file, extname(file));
  const dest = join(OUT, `${name}.webp`);
  const meta = await sharp(src).metadata();
  // A render with real transparency (the MyKitchen logo on a clear ground) keeps its alpha and
  // gets a little more quality, because edges against transparency show artefacts first.
  // Everything else — screenshots, photographs, opaque renders — is a photo as far as the
  // encoder is concerned.
  const hasAlpha = Boolean(meta.hasAlpha) && (await sharp(src).stats()).channels[3]?.min !== 255;
  const quality = hasAlpha || /^vex-/.test(name) ? 86 : 80;
  const info = await sharp(src)
    .rotate() // honour EXIF orientation, then drop the EXIF
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality, effort: 6, alphaQuality: 90 })
    .toFile(dest);
  const was = statSync(src).size;
  before += was;
  after += info.size;
  console.log(
    `${name.padEnd(24)} ${String(meta.width).padStart(5)}x${String(meta.height).padEnd(5)} → ${String(info.width).padStart(5)}x${String(info.height).padEnd(5)}` +
      `  ${(was / 1024).toFixed(0).padStart(5)} KB → ${(info.size / 1024).toFixed(0).padStart(4)} KB  q${quality}${hasAlpha ? ' +alpha' : ''}`,
  );
}
console.log(`\n${files.length} files: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (${(100 * (1 - after / before)).toFixed(0)}% smaller)`);
