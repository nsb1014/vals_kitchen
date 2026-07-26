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
  chair_side: 'chair_side.png',
  decor_plant: 'decor_plant.png',
};

const CHARACTER_SPRITES = {
  // Green-shirt urban walk cycle (cols: left, down, up, right × 3 frames)
  player_left_0: 'Tiles/tile_0023.png',
  player_down_0: 'Tiles/tile_0024.png',
  player_up_0: 'Tiles/tile_0025.png',
  player_right_0: 'Tiles/tile_0026.png',
  player_left_1: 'Tiles/tile_0050.png',
  player_down_1: 'Tiles/tile_0051.png',
  player_up_1: 'Tiles/tile_0052.png',
  player_right_1: 'Tiles/tile_0053.png',
  player_left_2: 'Tiles/tile_0077.png',
  player_down_2: 'Tiles/tile_0078.png',
  player_up_2: 'Tiles/tile_0079.png',
  player_right_2: 'Tiles/tile_0080.png',
  // Guest A = green sheet (same cook-adjacent outfit, distinct from red guests)
  guest_a_left_0: 'Tiles/tile_0023.png',
  guest_a_down_0: 'Tiles/tile_0024.png',
  guest_a_up_0: 'Tiles/tile_0025.png',
  guest_a_right_0: 'Tiles/tile_0026.png',
  guest_a_left_1: 'Tiles/tile_0050.png',
  guest_a_down_1: 'Tiles/tile_0051.png',
  guest_a_up_1: 'Tiles/tile_0052.png',
  guest_a_right_1: 'Tiles/tile_0053.png',
  guest_a_left_2: 'Tiles/tile_0077.png',
  guest_a_down_2: 'Tiles/tile_0078.png',
  guest_a_up_2: 'Tiles/tile_0079.png',
  guest_a_right_2: 'Tiles/tile_0080.png',
  // Guest B = red-shirt walk cycle
  guest_b_left_0: 'Tiles/tile_0104.png',
  guest_b_down_0: 'Tiles/tile_0105.png',
  guest_b_up_0: 'Tiles/tile_0106.png',
  guest_b_right_0: 'Tiles/tile_0107.png',
  guest_b_left_1: 'Tiles/tile_0131.png',
  guest_b_down_1: 'Tiles/tile_0132.png',
  guest_b_up_1: 'Tiles/tile_0133.png',
  guest_b_right_1: 'Tiles/tile_0134.png',
  guest_b_left_2: 'Tiles/tile_0158.png',
  guest_b_down_2: 'Tiles/tile_0159.png',
  guest_b_up_2: 'Tiles/tile_0160.png',
  guest_b_right_2: 'Tiles/tile_0161.png',
  // Legacy names kept for CustomerLayer / older callers
  customer: 'Tiles/tile_0024.png',
  customer_b: 'Tiles/tile_0105.png',
  player: 'Tiles/tile_0024.png',
  player_walk: 'Tiles/tile_0051.png',
} as const;

const GENERATED_SHEETS = path.join(ROOT, 'vendor', 'generated', 'ingredient-sheets');
const GENERATED_ICONS = path.join(ROOT, 'scripts', '.asset-build', 'ingredient-icons');

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
    ...Object.values(CHARACTER_SPRITES).map((rel) =>
      vendorPath(`rpg-urban-pack/${rel}`),
    ),
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

function runRestaurantTileBuilder(): void {
  execFileSync('python3', [path.join(__dirname, 'build-restaurant-tiles.py')], {
    stdio: 'inherit',
  });
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
      pack: 'Project-generated restaurant tiles (CC0)',
      author: "Val's Kitchen project",
      sourceUrl: 'vendor/generated/restaurant-tiles/',
      license: 'CC0',
      usedIn: ['canvas:GridLayer floor / wall tiles'],
      sourceFile: file,
      approximationNote:
        'Generated 32×32 cozy diner floor/wall/door art for this project; dedicated to CC0.',
    });
  }

  for (const [itemKey, file] of Object.entries(FURNITURE_SPRITES)) {
    add({
      path: `atlases/furniture.json#${itemKey}`,
      pack: 'Project-generated restaurant tiles (CC0)',
      author: "Val's Kitchen project",
      sourceUrl: 'vendor/generated/restaurant-tiles/',
      license: 'CC0',
      usedIn: [`canvas:FurnitureLayer (${itemKey})`],
      sourceFile: file,
      approximationNote:
        'Generated 32×48 cozy diner furniture/station art for this project; dedicated to CC0.',
    });
  }

  const characterUsedIn: Record<string, string[]> = {
    player_down_0: ['canvas:ActorLayer (player)'],
    player_walk: ['canvas:ActorLayer (player walk)'],
    guest_a_down_0: ['canvas:ActorLayer (guest A)'],
    guest_b_down_0: ['canvas:ActorLayer (guest B)'],
    customer: ['canvas:CustomerLayer', 'canvas:ActorLayer'],
    customer_b: ['canvas:ActorLayer'],
    player: ['canvas:ActorLayer'],
  };
  for (const [name, rel] of Object.entries(CHARACTER_SPRITES)) {
    add({
      path: `atlases/characters.json#${name}`,
      pack: PACKS.rpgUrban.pack,
      author: PACKS.rpgUrban.author,
      sourceUrl: PACKS.rpgUrban.sourceUrl,
      license: 'CC0',
      usedIn: characterUsedIn[name] ?? ['canvas:ActorLayer'],
      sourceFile: rel,
      approximationNote: 'RPG Urban Pack character walk frames, nearest-neighbor 2× to 32×32 for readable floor actors.',
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
    else if (file.startsWith('atlases/characters')) meta = PACKS.tinyDungeon;
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
      'Kenney CC0 sources in vendor/kenney/sources/; ingredient icons generated in vendor/generated/ingredient-sheets/.',
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
  runRestaurantTileBuilder();

  const tmp = path.join(ROOT, 'scripts', '.asset-build');
  mkdirSync(tmp, { recursive: true });
  mkdirSync(path.join(OUT, 'atlases'), { recursive: true });

  const tileManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(TILE_SPRITES)) {
    tileManifest[name] = path.join(GENERATED_RESTAURANT, file);
  }
  const tileManifestPath = path.join(tmp, 'tiles.manifest.json');
  writeManifest(tileManifest, tileManifestPath);
  runPacker(
    tileManifestPath,
    path.join(OUT, 'atlases', 'tiles.png'),
    path.join(OUT, 'atlases', 'tiles.json'),
    32,
    1,
  );

  const furnitureManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(FURNITURE_SPRITES)) {
    furnitureManifest[name] = path.join(GENERATED_RESTAURANT, file);
  }
  const furnitureManifestPath = path.join(tmp, 'furniture.manifest.json');
  writeManifest(furnitureManifest, furnitureManifestPath);
  runPacker(
    furnitureManifestPath,
    path.join(OUT, 'atlases', 'furniture.png'),
    path.join(OUT, 'atlases', 'furniture.json'),
    48,
  );

  const charManifest: Record<string, string> = {};
  for (const [name, rel] of Object.entries(CHARACTER_SPRITES)) {
    charManifest[name] = vendorPath(`rpg-urban-pack/${rel}`);
  }
  const charManifestPath = path.join(tmp, 'characters.manifest.json');
  writeManifest(charManifest, charManifestPath);
  runPacker(
    charManifestPath,
    path.join(OUT, 'atlases', 'characters.png'),
    path.join(OUT, 'atlases', 'characters.json'),
    32,
    2,
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
