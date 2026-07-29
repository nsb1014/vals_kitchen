/**
 * Build runtime atlases + audio from vendored Kenney CC0 sources under vendor/kenney/sources/.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets');
const VENDOR = path.join(ROOT, 'vendor', 'kenney', 'sources');

interface PackMeta {
  pack: string;
  author: string;
  sourceUrl: string;
  license: 'CC0';
  note?: string;
}

interface CreditEntry {
  path: string;
  pack: string;
  author: string;
  sourceUrl: string;
  license: 'CC0';
  usedIn: string[];
  sourceFile?: string;
  approximationNote?: string;
}

const PACKS: Record<string, PackMeta> = {
  rpgUrban: {
    pack: 'Kenney RPG Urban Pack',
    author: 'Kenney Vleugels',
    sourceUrl: 'https://kenney.nl/assets/rpg-urban-pack',
    license: 'CC0',
  },
  generatedFood: {
    pack: 'Restaurant Simulator Ingredient Icons',
    author: 'Restaurant Simulator project',
    sourceUrl: 'vendor/generated/ingredient-sheets/',
    license: 'CC0',
    note: 'Purpose-made 32×32 pixel-art icons generated for this project; dedicated to CC0.',
  },
  generatedSit: {
    pack: 'Project-generated character sit poses (CC0)',
    author: "Val's Kitchen project",
    sourceUrl: 'vendor/generated/character-sit/',
    license: 'CC0',
    note: 'Sit frames derived from Kenney RPG Urban Pack idle sprites (CC0) by folding legs into a seated pose; dedicated to CC0 by this project.',
  },
  generatedBadges: {
    pack: "Val's Kitchen Achievement Badges",
    author: "Val's Kitchen project",
    sourceUrl: 'vendor/generated/achievement-badges/',
    license: 'CC0',
    note: 'Purpose-made 48×48 diner-themed pixel badges generated for this project; dedicated to CC0.',
  },
  chibiUi: {
    pack: "Val's Kitchen Chibi UI Art",
    author: "Val's Kitchen project",
    sourceUrl: 'vendor/generated/chibi-ui/',
    license: 'CC0',
    note: 'Original chef, guest, restaurant-surface, and furniture art generated for this project and dedicated to CC0.',
  },
  tinyDungeon: {
    pack: 'Kenney Tiny Dungeon',
    author: 'Kenney Vleugels',
    sourceUrl: 'https://kenney.nl/assets/tiny-dungeon',
    license: 'CC0',
    note: '16×16 top-down rogue idle sprite for customer NPC.',
  },
  rpgAudio: {
    pack: 'Kenney RPG Audio',
    author: 'Kenney Vleugels',
    sourceUrl: 'https://kenney.nl/assets/rpg-audio',
    license: 'CC0',
  },
  interfaceSounds: {
    pack: 'Kenney Interface Sounds',
    author: 'Kenney Vleugels',
    sourceUrl: 'https://kenney.nl/assets/interface-sounds',
    license: 'CC0',
  },
  musicJingles: {
    pack: 'Kenney Music Jingles',
    author: 'Kenney Vleugels',
    sourceUrl: 'https://kenney.nl/assets/music-jingles',
    license: 'CC0',
  },
};

const GENERATED_RESTAURANT = path.join(ROOT, 'vendor', 'generated', 'restaurant-tiles');
const GENERATED_BADGES = path.join(ROOT, 'vendor', 'generated', 'achievement-badges');

const ACHIEVEMENT_BADGE_IDS = [
  'recipe-unlocks-1',
  'recipe-unlocks-5',
  'recipe-unlocks-10',
  'recipe-unlocks-25',
  'recipe-unlocks-50',
  'recipe-unlocks-100',
  'recipe-mastery-5-1',
  'recipe-mastery-5-5',
  'recipe-mastery-5-10',
  'recipe-mastery-10-1',
  'recipe-mastery-10-3',
  'recipe-mastery-10-5',
  'decor-1',
  'decor-3',
  'decor-6',
  'tables-3',
  'tables-5',
  'tables-8',
  'days-1',
  'days-7',
  'days-14',
  'days-30',
  'prestiges-1',
  'prestiges-3',
  'prestiges-5',
] as const;

const TILE_SPRITES: Record<string, string> = {
  floor_a: 'floor_wood_a.png',
  floor_b: 'floor_wood_b.png',
  floor_kitchen_a: 'floor_kitchen_a.png',
  floor_kitchen_b: 'floor_kitchen_b.png',
  wall: 'wall.png',
  wall_n: 'wall_n.png',
  wall_e: 'wall_e.png',
  wall_s: 'wall_s.png',
  wall_w: 'wall_w.png',
  door: 'door.png',
  door_open: 'door_open.png',
};

const FURNITURE_SPRITES: Record<string, string> = {
  prep_station: 'prep_station.png',
  grill: 'grill.png',
  oven: 'oven.png',
  fryer: 'fryer.png',
  stockpot: 'stockpot.png',
  cold_station: 'cold_station.png',
  pastry_bench: 'pastry_bench.png',
  smoker: 'smoker.png',
  wok: 'wok.png',
  fermentation_crock: 'fermentation_crock.png',
  barista_station: 'barista_station.png',
  spice_rack: 'spice_rack.png',
  table_2seat: 'table_2seat.png',
  table_2seat_unset: 'table_2seat_unset.png',
  table_2seat_dirty: 'table_2seat_dirty.png',
  chair: 'chair.png',
  chair_back: 'chair_back.png',
  chair_side: 'chair_side.png',
  decor_plant: 'decor_plant.png',
  decor_flowers: 'decor_flowers.png',
  decor_rug: 'decor_rug.png',
  decor_lamp: 'decor_lamp.png',
  decor_sign: 'decor_sign.png',
};

/** Exact supplied chef frames plus the project-generated chibi guest cast. */
const CHARACTER_SPRITES: Record<string, string> = {
  player: 'player.png',
  player_walk: 'player_walk.png',
};
for (const facing of ['left', 'down', 'up', 'right']) {
  for (const frame of [0, 1, 2]) {
    const name = `player_${facing}_${frame}`;
    CHARACTER_SPRITES[name] = `${name}.png`;
  }
  CHARACTER_SPRITES[`player_carry_${facing}`] = `player_carry_${facing}.png`;
}
for (const variant of ['a', 'b', 'c', 'd', 'e']) {
  for (const facing of ['left', 'down', 'up', 'right']) {
    for (const frame of [0, 1, 2]) {
      const name = `guest_${variant}_${facing}_${frame}`;
      CHARACTER_SPRITES[name] = `${name}.png`;
    }
    const sitName = `guest_${variant}_sit_${facing}`;
    CHARACTER_SPRITES[sitName] = `${sitName}.png`;
  }
}
CHARACTER_SPRITES.customer = 'customer.png';
CHARACTER_SPRITES.customer_b = 'customer_b.png';

const GENERATED_SHEETS = path.join(ROOT, 'vendor', 'generated', 'ingredient-sheets');
const GENERATED_ICONS = path.join(ROOT, 'scripts', '.asset-build', 'ingredient-icons');
const GENERATED_CHIBI = path.join(ROOT, 'vendor', 'generated', 'chibi-ui');
const GENERATED_CHIBI_PLAYER = path.join(GENERATED_CHIBI, 'player-frames');
const GENERATED_CHIBI_GUESTS = path.join(GENERATED_CHIBI, 'guest-frames');
const GENERATED_CHIBI_TILES = path.join(GENERATED_CHIBI, 'restaurant-tiles');
const GENERATED_CHIBI_PROPS = path.join(GENERATED_CHIBI, 'restaurant-props');

const AUDIO_FILES: Record<string, { rel: string; pack: keyof typeof PACKS }> = {
  'sfx/serve.ogg': { rel: 'kenney_rpgaudio/Audio/knifeSlice.ogg', pack: 'rpgAudio' },
  'sfx/review.ogg': { rel: 'kenney_interfacesounds/Audio/confirmation_001.ogg', pack: 'interfaceSounds' },
  'sfx/purchase.ogg': { rel: 'kenney_rpgaudio/Audio/handleCoins.ogg', pack: 'rpgAudio' },
  'sfx/placement.ogg': { rel: 'kenney_rpgaudio/Audio/metalClick.ogg', pack: 'rpgAudio' },
  'sfx/day-open.ogg': { rel: 'kenney_rpgaudio/Audio/doorOpen_1.ogg', pack: 'rpgAudio' },
  'sfx/day-close.ogg': { rel: 'kenney_rpgaudio/Audio/doorClose_3.ogg', pack: 'rpgAudio' },
  'sfx/ui-click.ogg': { rel: 'kenney_interfacesounds/Audio/click_001.ogg', pack: 'interfaceSounds' },
  'music/restaurant-loop.ogg': {
    rel: 'kenney_musicjingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg',
    pack: 'musicJingles',
  },
};

function vendorPath(rel: string): string {
  return path.join(VENDOR, rel);
}

function assertVendor(): void {
  const required = [
    path.join(GENERATED_CHIBI, 'source', 'chef-sheet.png'),
    path.join(GENERATED_CHIBI, 'source', 'surfaces-sheet-keyed.png'),
    path.join(GENERATED_CHIBI, 'source', 'furniture-sheet-keyed.png'),
    path.join(GENERATED_CHIBI_GUESTS, 'guest_a_down_0.png'),
    vendorPath('audio/kenney_rpgaudio/Audio/knifeSlice.ogg'),
    path.join(GENERATED_SHEETS, 'manifest.json'),
    path.join(GENERATED_SHEETS, 'sheet-01-alliums-roots.png'),
  ];
  for (const file of required) {
    if (!existsSync(file)) {
      console.error(`Missing vendored source: ${file}`);
      console.error('Ensure vendor/kenney/sources/ and vendor/generated/ingredient-sheets/ exist.');
      process.exit(1);
    }
  }
}

function runChibiUiBuilder(): void {
  execFileSync('python3', [path.join(__dirname, 'build-chibi-ui-assets.py')], {
    stdio: 'inherit',
  });
}

function runAchievementBadgeBuilder(): void {
  execFileSync(
    'python3',
    [path.join(__dirname, 'build-achievement-badges.py'), GENERATED_BADGES],
    { stdio: 'inherit' },
  );
}

function copyAchievementBadges(): void {
  const destination = path.join(OUT, 'achievements');
  mkdirSync(destination, { recursive: true });
  for (const id of ACHIEVEMENT_BADGE_IDS) {
    const source = path.join(GENERATED_BADGES, `${id}.png`);
    if (!existsSync(source)) {
      throw new Error(`Missing generated achievement badge: ${source}`);
    }
    copyFileSync(source, path.join(destination, `${id}.png`));
  }
}

function writeManifest(entries: Record<string, string>, file: string): void {
  writeFileSync(file, JSON.stringify(entries, null, 2));
}

function runIngredientIconBuilder(): void {
  execFileSync('python3', [path.join(__dirname, 'build-ingredient-icons.py'), GENERATED_ICONS], {
    stdio: 'inherit',
  });
}

function runPacker(
  manifestFile: string,
  outPng: string,
  outJson: string,
  cell?: number,
  scale?: number,
): void {
  const args = [path.join(__dirname, 'pack-atlas.py'), manifestFile, outPng, outJson];
  if (cell !== undefined) args.push(String(cell));
  if (scale !== undefined) {
    if (cell === undefined) {
      throw new Error('runPacker: cell is required when scale is set');
    }
    args.push(String(scale));
  }
  execFileSync('python3', args, { stdio: 'inherit' });
}

function copyAudio(): void {
  for (const [dest, spec] of Object.entries(AUDIO_FILES)) {
    const src = vendorPath(path.join('audio', spec.rel));
    if (!existsSync(src)) {
      console.error(`Missing audio source: ${src}`);
      process.exit(1);
    }
    const outPath = path.join(OUT, dest);
    mkdirSync(path.dirname(outPath), { recursive: true });
    copyFileSync(src, outPath);
  }
}

function buildCredits(shippedFiles: string[]): void {
  const entries: CreditEntry[] = [];

  const add = (entry: CreditEntry) => {
    entries.push(entry);
  };

  for (const [sprite, file] of Object.entries(TILE_SPRITES)) {
    add({
      path: `atlases/tiles.json#${sprite}`,
      pack: PACKS.chibiUi.pack,
      author: PACKS.chibiUi.author,
      sourceUrl: PACKS.chibiUi.sourceUrl,
      license: 'CC0',
      usedIn: ['canvas:GridLayer floor / wall tiles'],
      sourceFile: file,
      approximationNote: PACKS.chibiUi.note,
    });
  }

  for (const [itemKey, file] of Object.entries(FURNITURE_SPRITES)) {
    const isChibi = existsSync(path.join(GENERATED_CHIBI_PROPS, file));
    add({
      path: `atlases/furniture.json#${itemKey}`,
      pack: isChibi ? PACKS.chibiUi.pack : 'Project-generated restaurant tiles (CC0)',
      author: "Val's Kitchen project",
      sourceUrl: isChibi ? PACKS.chibiUi.sourceUrl : 'vendor/generated/restaurant-tiles/',
      license: 'CC0',
      usedIn: [`canvas:FurnitureLayer (${itemKey})`],
      sourceFile: file,
      approximationNote: isChibi
        ? PACKS.chibiUi.note
        : 'Generated 32×48 cozy diner decor art retained where it fits the chibi room; dedicated to CC0.',
    });
  }

  for (const id of ACHIEVEMENT_BADGE_IDS) {
    add({
      path: `achievements/${id}.png`,
      pack: PACKS.generatedBadges.pack,
      author: PACKS.generatedBadges.author,
      sourceUrl: PACKS.generatedBadges.sourceUrl,
      license: 'CC0',
      usedIn: ['ui:recipe-book achievements', 'ui:achievement celebration'],
      sourceFile: `${id}.png`,
      approximationNote: PACKS.generatedBadges.note,
    });
  }

  const characterUsedIn: Record<string, string[]> = {
    player_down_0: ['canvas:ActorLayer (exact supplied main chef)'],
    player_walk: ['canvas:ActorLayer (player walk)'],
    guest_a_down_0: ['canvas:ActorLayer (chibi guest A)'],
    guest_b_down_0: ['canvas:ActorLayer (chibi guest B)'],
    guest_c_down_0: ['canvas:ActorLayer (chibi guest C)'],
    guest_d_down_0: ['canvas:ActorLayer (chibi guest D)'],
    guest_e_down_0: ['canvas:ActorLayer (chibi guest E)'],
    customer: ['canvas:CustomerLayer', 'canvas:ActorLayer'],
    customer_b: ['canvas:ActorLayer'],
    player: ['canvas:ActorLayer'],
  };
  for (const [name, rel] of Object.entries(CHARACTER_SPRITES)) {
    add({
      path: `atlases/characters.json#${name}`,
      pack: PACKS.chibiUi.pack,
      author: PACKS.chibiUi.author,
      sourceUrl: PACKS.chibiUi.sourceUrl,
      license: 'CC0',
      usedIn: characterUsedIn[name] ?? ['canvas:ActorLayer'],
      sourceFile: rel,
      approximationNote: PACKS.chibiUi.note,
    });
  }

  for (const [ingredientId] of Object.entries(
    JSON.parse(readFileSync(path.join(GENERATED_ICONS, 'manifest.json'), 'utf8')) as Record<
      string,
      string
    >,
  )) {
    const sprite = ingredientId.startsWith('icon_') ? ingredientId : `icon_${ingredientId}`;
    const id = sprite.replace(/^icon_/, '');
    add({
      path: `atlases/food.json#${sprite}`,
      pack: PACKS.generatedFood.pack,
      author: PACKS.generatedFood.author,
      sourceUrl: PACKS.generatedFood.sourceUrl,
      license: 'CC0',
      usedIn: ['ui:shop', 'ui:compose', 'ui:flavor-inspector', 'ui:recipe-book'],
      sourceFile: `${id}.png`,
    });
  }

  for (const [dest, spec] of Object.entries(AUDIO_FILES)) {
    const meta = PACKS[spec.pack];
    add({
      path: `${dest}`,
      pack: meta.pack,
      author: meta.author,
      sourceUrl: meta.sourceUrl,
      license: 'CC0',
      usedIn: ['app:AudioManager'],
      sourceFile: spec.rel,
    });
  }

  const covered = new Set<string>();
  for (const entry of entries) {
    const base = entry.path.split('#')[0]!;
    covered.add(base);
  }
  for (const file of shippedFiles) {
    if (covered.has(file)) continue;
    let meta = PACKS.rpgUrban;
    if (file.startsWith('atlases/food')) meta = PACKS.generatedFood;
    else if (file.startsWith('atlases/characters')) meta = PACKS.chibiUi;
    else if (file.startsWith('sfx/') || file.startsWith('music/')) meta = PACKS.rpgAudio;
    add({
      path: file,
      pack: meta.pack,
      author: meta.author,
      sourceUrl: meta.sourceUrl,
      license: 'CC0',
      usedIn: ['build:generated artifact from CC0 atlas/audio pipeline'],
    });
  }

  const manifest = {
    version: 1,
    generatedBy: 'scripts/build-assets.ts',
    generatedAt: new Date().toISOString(),
    policy: 'CC0-only',
    vendorNote:
      'Kenney CC0 audio sources in vendor/kenney/sources/; original chibi UI and ingredient icons are project-generated CC0 assets.',
    packs: Object.values(PACKS),
    entries,
    shippedFiles,
  };

  writeFileSync(path.join(OUT, 'CREDITS.json'), JSON.stringify(manifest, null, 2));
}

function listShippedFiles(dir: string, prefix = ''): string[] {
  const results: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      results.push(...listShippedFiles(full, rel));
    } else {
      results.push(rel);
    }
  }
  return results.sort();
}

function main(): void {
  assertVendor();
  runChibiUiBuilder();
  runAchievementBadgeBuilder();

  const tmp = path.join(ROOT, 'scripts', '.asset-build');
  mkdirSync(tmp, { recursive: true });
  mkdirSync(path.join(OUT, 'atlases'), { recursive: true });

  const tileManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(TILE_SPRITES)) {
    tileManifest[name] = path.join(GENERATED_CHIBI_TILES, file);
  }
  const tileManifestPath = path.join(tmp, 'tiles.manifest.json');
  writeManifest(tileManifest, tileManifestPath);
  runPacker(
    tileManifestPath,
    path.join(OUT, 'atlases', 'tiles.png'),
    path.join(OUT, 'atlases', 'tiles.json'),
    64,
    1,
  );

  const furnitureManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(FURNITURE_SPRITES)) {
    const chibiPath = path.join(GENERATED_CHIBI_PROPS, file);
    furnitureManifest[name] = existsSync(chibiPath)
      ? chibiPath
      : path.join(GENERATED_RESTAURANT, file);
  }
  const furnitureManifestPath = path.join(tmp, 'furniture.manifest.json');
  writeManifest(furnitureManifest, furnitureManifestPath);
  runPacker(
    furnitureManifestPath,
    path.join(OUT, 'atlases', 'furniture.png'),
    path.join(OUT, 'atlases', 'furniture.json'),
    96,
  );

  const charManifest: Record<string, string> = {};
  for (const [name, rel] of Object.entries(CHARACTER_SPRITES)) {
    const sourceDir = name.startsWith('player')
      ? GENERATED_CHIBI_PLAYER
      : GENERATED_CHIBI_GUESTS;
    const sourcePath = path.join(sourceDir, rel);
    if (!existsSync(sourcePath)) {
      console.error(`Missing generated chibi character frame: ${sourcePath}`);
      process.exit(1);
    }
    charManifest[name] = sourcePath;
  }
  const charManifestPath = path.join(tmp, 'characters.manifest.json');
  writeManifest(charManifest, charManifestPath);
  runPacker(
    charManifestPath,
    path.join(OUT, 'atlases', 'characters.png'),
    path.join(OUT, 'atlases', 'characters.json'),
    192,
    1,
  );

  runIngredientIconBuilder();

  const generatedManifest = JSON.parse(
    readFileSync(path.join(GENERATED_ICONS, 'manifest.json'), 'utf8'),
  ) as Record<string, string>;

  const ingredients = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'data', 'ingredients.json'), 'utf8'),
  ) as Array<{ id: string }>;

  const foodManifest: Record<string, string> = {};
  const missingIcons: string[] = [];
  for (const ing of ingredients) {
    const key = `icon_${ing.id}`;
    const src = generatedManifest[key];
    if (!src || !existsSync(src)) {
      missingIcons.push(ing.id);
      continue;
    }
    foodManifest[key] = src;
  }

  if (missingIcons.length > 0) {
    console.error('Missing generated food icons:', missingIcons);
    process.exit(1);
  }

  const foodManifestPath = path.join(tmp, 'food.manifest.json');
  writeManifest(foodManifest, foodManifestPath);
  runPacker(
    foodManifestPath,
    path.join(OUT, 'atlases', 'food.png'),
    path.join(OUT, 'atlases', 'food.json'),
    32,
  );

  copyAudio();
  copyAchievementBadges();

  const shippedFiles = listShippedFiles(OUT);
  buildCredits(shippedFiles);

  let atlasBytes = 0;
  let audioBytes = 0;
  for (const file of shippedFiles) {
    const size = statSync(path.join(OUT, file)).size;
    if (file.startsWith('sfx/') || file.startsWith('music/')) audioBytes += size;
    if (file.startsWith('atlases/') && file.endsWith('.png')) atlasBytes += size;
  }

  console.log('');
  console.log(`Asset build complete -> ${OUT}`);
  console.log(`  Atlas PNG payload: ${atlasBytes.toLocaleString('en-US')} bytes`);
  console.log(`  Audio payload: ${audioBytes.toLocaleString('en-US')} bytes`);
  console.log(`  CREDITS entries: ${JSON.parse(readFileSync(path.join(OUT, 'CREDITS.json'), 'utf8')).entries.length}`);
}

main();
