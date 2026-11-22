// Solmar Heat: Neon Run — hand-in program for the make.fun gta6-01 entry.
//
// The game itself is the static folder game/ beside this file. This
// program does one unglamorous job and does it deterministically:
// copy game/ and screenshots/ into the output directory, then write
// dossier.json with the kit's own buildDossier, so what the scorer
// rebuilds is byte for byte what is handed in. It refuses to run on
// an incomplete entry rather than let a broken hand-in score zero.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own numbers, straight from the kit: the dossier text
// budget, at most four screenshots of at most 256 KiB, a game folder
// of at most 993 entries and 48 MiB, no path longer than 1,000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  }
  return n;
}

function treeBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? treeBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size;
  }
  return n;
}

// The dossier builder refuses a game tree past the file-count or
// byte caps, but its error names the cap, not the tree — by the
// time it throws, the hand-in has already been copied and the
// failure reads like a scorer problem. Measure the staged tree
// here, where the numbers can be printed next to the caps they
// broke, so an oversized entry fails as an authoring problem.
function verifyGameCaps(dir) {
  const files = countFiles(dir);
  if (files > CAPS.game_max_files) {
    throw new Error(`neon-run hand-in: game tree holds ${files} files, over the ${CAPS.game_max_files} cap`);
  }
  const bytes = treeBytes(dir);
  if (bytes > CAPS.game_max_bytes) {
    throw new Error(`neon-run hand-in: game tree is ${bytes} bytes, over the ${CAPS.game_max_bytes} cap`);
  }
  return files;
}

// Neon Run stages four scenes (cover, street, mission, city) and the
// scorer replays them from shots.json; without the list, the entry
// would read as a game with no evidence it ever ran. Check for it,
// the page, the vendored engine and all four frames up front.
function requireComplete() {
  const want = [
    'game/index.html',
    'game/vendor/three.min.js',
    'shots.json',
    'screenshots/1-cover.jpg',
    'screenshots/2-street.jpg',
    'screenshots/3-mission.jpg',
    'screenshots/4-city.jpg',
  ];
  const missing = want.filter((rel) => !existsSync(join(root, rel)));
  if (missing.length) throw new Error(`neon-run hand-in incomplete, missing: ${missing.join(', ')}`);
  verifyScreenshotCaps(want);
}

// A frame over the 256 KiB cap fails the gate outright, and the
// failure only surfaces after grading starts — catch it here,
// where the fix is still just another capture round.
function verifyScreenshotCaps(want) {
  for (const rel of want.filter((w) => w.startsWith('screenshots/'))) {
    const bytes = statSync(join(root, rel)).size;
    if (bytes > CAPS.screenshots.max_bytes) {
      throw new Error(`neon-run hand-in: ${rel} is ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
    }
  }
}
requireComplete();

// Copy first, dossier second: the dossier describes the output
// folder's bytes, never the working tree's, so the two cannot drift.
mkdirSync(out, { recursive: true });
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const gameFiles = verifyGameCaps(join(out, 'game'));
const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `solmar-heat neon-run: ${gameFiles} game files, ` +
  `${countFiles(join(out, 'screenshots'))} screenshots, dossier ${dossier.length} bytes`,
);
