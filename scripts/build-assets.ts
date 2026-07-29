/** Build Storybook v2 runtime atlases and copy the vendored CC0 audio. */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "assets");
const VENDOR = path.join(ROOT, "vendor", "kenney", "sources");

interface PackMeta {
  pack: string;
  author: string;
  sourceUrl: string;
  license: "CC0";
  note?: string;
}

interface CreditEntry {
  path: string;
  pack: string;
  author: string;
  sourceUrl: string;
  license: "CC0";
  usedIn: string[];
  sourceFile?: string;
  approximationNote?: string;
}

const PACKS: Record<string, PackMeta> = {
  generatedFood: {
    pack: "Val's Kitchen Storybook v2 Ingredient Icons",
    author: "Val's Kitchen project",
    sourceUrl: "vendor/generated/storybook-v2/ingredient-sheets/",
    license: "CC0",
    note: "Original high-definition hand-painted storybook ingredient art generated for this project; dedicated to CC0.",
  },
  generatedBadges: {
    pack: "Val's Kitchen Storybook v2 Achievement Badges",
    author: "Val's Kitchen project",
    sourceUrl: "vendor/generated/storybook-v2/achievement-badges/",
    license: "CC0",
    note: "Original high-definition hand-painted storybook achievement badge art generated for this project; dedicated to CC0.",
  },
  generatedStorybook: {
    pack: "Val's Kitchen Storybook v2 Characters",
    author: "Val's Kitchen project",
    sourceUrl: "vendor/generated/storybook-v2/",
    license: "CC0",
    note: "Original high-definition hand-painted storybook character art generated for this project; dedicated to CC0.",
  },
  generatedStorybookProps: {
    pack: "Val's Kitchen Storybook v2 Restaurant Props",
    author: "Val's Kitchen project",
    sourceUrl: "vendor/generated/storybook-v2/restaurant-props/",
    license: "CC0",
    note: "Original high-definition hand-painted storybook restaurant prop art generated for this project; dedicated to CC0.",
  },
  generatedStorybookTiles: {
    pack: "Val's Kitchen Storybook v2 Restaurant Surfaces",
    author: "Val's Kitchen project",
    sourceUrl: "vendor/generated/storybook-v2/restaurant-tiles/",
    license: "CC0",
    note: "Original high-definition hand-painted storybook floor and directional wall materials generated for this project; dedicated to CC0.",
  },
  rpgAudio: {
    pack: "Kenney RPG Audio",
    author: "Kenney Vleugels",
    sourceUrl: "https://kenney.nl/assets/rpg-audio",
    license: "CC0",
  },
  interfaceSounds: {
    pack: "Kenney Interface Sounds",
    author: "Kenney Vleugels",
    sourceUrl: "https://kenney.nl/assets/interface-sounds",
    license: "CC0",
  },
  musicJingles: {
    pack: "Kenney Music Jingles",
    author: "Kenney Vleugels",
    sourceUrl: "https://kenney.nl/assets/music-jingles",
    license: "CC0",
  },
};

const GENERATED_STORYBOOK = path.join(
  ROOT,
  "vendor",
  "generated",
  "storybook-v2",
);
const GENERATED_BADGES = path.join(GENERATED_STORYBOOK, "achievement-badges");
const GENERATED_PLAYER_FRAMES = path.join(GENERATED_STORYBOOK, "player-frames");
const GENERATED_GUEST_FRAMES = path.join(GENERATED_STORYBOOK, "guest-frames");
const GENERATED_STORYBOOK_PROPS = path.join(
  GENERATED_STORYBOOK,
  "restaurant-props",
);
const GENERATED_STORYBOOK_TILES = path.join(
  GENERATED_STORYBOOK,
  "restaurant-tiles",
);

const ACHIEVEMENT_BADGE_IDS = [
  "recipe-unlocks-1",
  "recipe-unlocks-5",
  "recipe-unlocks-10",
  "recipe-unlocks-25",
  "recipe-unlocks-50",
  "recipe-unlocks-100",
  "recipe-mastery-5-1",
  "recipe-mastery-5-5",
  "recipe-mastery-5-10",
  "recipe-mastery-10-1",
  "recipe-mastery-10-3",
  "recipe-mastery-10-5",
  "decor-1",
  "decor-3",
  "decor-6",
  "tables-3",
  "tables-5",
  "tables-8",
  "days-1",
  "days-7",
  "days-14",
  "days-30",
  "prestiges-1",
  "prestiges-3",
  "prestiges-5",
] as const;

const TILE_SPRITES: Record<string, string> = {
  floor_a: "floor_wood_a.png",
  floor_b: "floor_wood_b.png",
  floor_kitchen_a: "floor_kitchen_a.png",
  floor_kitchen_b: "floor_kitchen_b.png",
  wall: "wall.png",
  wall_n: "wall_n.png",
  wall_e: "wall_e.png",
  wall_s: "wall_s.png",
  wall_w: "wall_w.png",
  door: "door.png",
  door_open: "door_open.png",
};

const FURNITURE_SPRITES: Record<string, string> = {
  prep_station: "prep_station.png",
  grill: "grill.png",
  oven: "oven.png",
  fryer: "fryer.png",
  stockpot: "stockpot.png",
  cold_station: "cold_station.png",
  pastry_bench: "pastry_bench.png",
  smoker: "smoker.png",
  wok: "wok.png",
  fermentation_crock: "fermentation_crock.png",
  barista_station: "barista_station.png",
  spice_rack: "spice_rack.png",
  table_2seat: "table_2seat.png",
  table_2seat_unset: "table_2seat_unset.png",
  table_2seat_dirty: "table_2seat_dirty.png",
  chair: "chair.png",
  chair_back: "chair_back.png",
  chair_side: "chair_side.png",
  decor_plant: "decor_plant.png",
  decor_flowers: "decor_flowers.png",
  decor_rug: "decor_rug.png",
  decor_lamp: "decor_lamp.png",
  decor_sign: "decor_sign.png",
};

/** Original high-definition player art derived from the generated Storybook v2 master. */
const STORYBOOK_PLAYER_SPRITES = {
  player_down_0: "player_down_0.png",
  player_down_1: "player_down_1.png",
  player_down_2: "player_down_2.png",
  player_down_3: "player_down_3.png",
  player_left_0: "player_left_0.png",
  player_left_1: "player_left_1.png",
  player_left_2: "player_left_2.png",
  player_left_3: "player_left_3.png",
  player_right_0: "player_right_0.png",
  player_right_1: "player_right_1.png",
  player_right_2: "player_right_2.png",
  player_right_3: "player_right_3.png",
  player_up_0: "player_up_0.png",
  player_up_1: "player_up_1.png",
  player_up_2: "player_up_2.png",
  player_up_3: "player_up_3.png",
  player_carry_down: "player_carry_down.png",
  player_carry_left: "player_carry_left.png",
  player_carry_right: "player_carry_right.png",
  player_carry_up: "player_carry_up.png",
  player: "player.png",
  player_walk: "player_walk.png",
} as const;

const STORYBOOK_GUEST_SPRITES: Record<string, string> = {
  customer: "customer.png",
  customer_b: "customer_b.png",
};
for (const variant of ["a", "b", "c", "d", "e"]) {
  for (const facing of ["left", "down", "up", "right"]) {
    for (const frame of [0, 1, 2]) {
      const name = `guest_${variant}_${facing}_${frame}`;
      STORYBOOK_GUEST_SPRITES[name] = `${name}.png`;
    }
    const sitName = `guest_${variant}_sit_${facing}`;
    STORYBOOK_GUEST_SPRITES[sitName] = `${sitName}.png`;
  }
}

const GENERATED_ICONS = path.join(GENERATED_STORYBOOK, "ingredient-icons");
const AUDIO_FILES: Record<string, { rel: string; pack: keyof typeof PACKS }> = {
  "sfx/serve.ogg": {
    rel: "kenney_rpgaudio/Audio/knifeSlice.ogg",
    pack: "rpgAudio",
  },
  "sfx/review.ogg": {
    rel: "kenney_interfacesounds/Audio/confirmation_001.ogg",
    pack: "interfaceSounds",
  },
  "sfx/purchase.ogg": {
    rel: "kenney_rpgaudio/Audio/handleCoins.ogg",
    pack: "rpgAudio",
  },
  "sfx/placement.ogg": {
    rel: "kenney_rpgaudio/Audio/metalClick.ogg",
    pack: "rpgAudio",
  },
  "sfx/day-open.ogg": {
    rel: "kenney_rpgaudio/Audio/doorOpen_1.ogg",
    pack: "rpgAudio",
  },
  "sfx/day-close.ogg": {
    rel: "kenney_rpgaudio/Audio/doorClose_3.ogg",
    pack: "rpgAudio",
  },
  "sfx/ui-click.ogg": {
    rel: "kenney_interfacesounds/Audio/click_001.ogg",
    pack: "interfaceSounds",
  },
  "music/restaurant-loop.ogg": {
    rel: "kenney_musicjingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg",
    pack: "musicJingles",
  },
};

function vendorPath(rel: string): string {
  return path.join(VENDOR, rel);
}

function assertVendor(): void {
  const required = [
    vendorPath("audio/kenney_rpgaudio/Audio/knifeSlice.ogg"),
    path.join(
      GENERATED_STORYBOOK,
      "ingredient-sheets",
      "sheet-01-alliums-roots-chroma.png",
    ),
    path.join(GENERATED_STORYBOOK, "player-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "guest-idle-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "guest-walk-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "guest-sit-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "furniture-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "materials-sheet-master.png"),
    path.join(GENERATED_STORYBOOK, "achievement-badges-sheet-chroma.png"),
  ];
  for (const file of required) {
    if (!existsSync(file)) {
      console.error(`Missing vendored source: ${file}`);
      console.error(
        "Ensure the vendored CC0 sources and vendor/generated/storybook-v2/ masters exist.",
      );
      process.exit(1);
    }
  }
}

function runAchievementBadgeBuilder(): void {
  execFileSync("python3", [path.join(__dirname, "build-storybook-badges.py")], {
    stdio: "inherit",
  });
}

function runStorybookCharacterBuilder(): void {
  execFileSync(
    "python3",
    [path.join(__dirname, "build-storybook-characters.py")],
    {
      stdio: "inherit",
    },
  );
}

function runStorybookGuestBuilder(): void {
  execFileSync("python3", [path.join(__dirname, "build-storybook-guests.py")], {
    stdio: "inherit",
  });
}

function runStorybookPropBuilder(): void {
  execFileSync("python3", [path.join(__dirname, "build-storybook-props.py")], {
    stdio: "inherit",
  });
}

function runStorybookTileBuilder(): void {
  execFileSync("python3", [path.join(__dirname, "build-storybook-tiles.py")], {
    stdio: "inherit",
  });
}

function copyAchievementBadges(): void {
  const destination = path.join(OUT, "achievements");
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
  execFileSync(
    "python3",
    [path.join(__dirname, "build-storybook-ingredients.py")],
    {
      stdio: "inherit",
    },
  );
}

function runPacker(
  manifestFile: string,
  outPng: string,
  outJson: string,
  cell?: number,
  scale?: number,
): void {
  const args = [
    path.join(__dirname, "pack-atlas.py"),
    manifestFile,
    outPng,
    outJson,
  ];
  if (cell !== undefined) args.push(String(cell));
  if (scale !== undefined) {
    if (cell === undefined) {
      throw new Error("runPacker: cell is required when scale is set");
    }
    args.push(String(scale));
  }
  execFileSync("python3", args, { stdio: "inherit" });
}

function copyAudio(): void {
  for (const [dest, spec] of Object.entries(AUDIO_FILES)) {
    const src = vendorPath(path.join("audio", spec.rel));
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
    const storybookProp = sprite === "door" || sprite === "door_open";
    const meta = storybookProp
      ? PACKS.generatedStorybookProps
      : PACKS.generatedStorybookTiles;
    add({
      path: `atlases/tiles.json#${sprite}`,
      pack: meta.pack,
      author: meta.author,
      sourceUrl: meta.sourceUrl,
      license: "CC0",
      usedIn: ["canvas:GridLayer floor / wall tiles"],
      sourceFile: file,
      approximationNote: meta.note,
    });
  }

  for (const [itemKey, file] of Object.entries(FURNITURE_SPRITES)) {
    add({
      path: `atlases/furniture.json#${itemKey}`,
      pack: PACKS.generatedStorybookProps.pack,
      author: PACKS.generatedStorybookProps.author,
      sourceUrl: PACKS.generatedStorybookProps.sourceUrl,
      license: "CC0",
      usedIn: [`canvas:FurnitureLayer (${itemKey})`],
      sourceFile: file,
      approximationNote: PACKS.generatedStorybookProps.note,
    });
  }

  for (const id of ACHIEVEMENT_BADGE_IDS) {
    add({
      path: `achievements/${id}.png`,
      pack: PACKS.generatedBadges.pack,
      author: PACKS.generatedBadges.author,
      sourceUrl: PACKS.generatedBadges.sourceUrl,
      license: "CC0",
      usedIn: ["ui:recipe-book achievements", "ui:achievement celebration"],
      sourceFile: `${id}.png`,
      approximationNote: PACKS.generatedBadges.note,
    });
  }

  const characterUsedIn: Record<string, string[]> = {
    player_down_0: ["canvas:ActorLayer (player / storybook cook)"],
    player_walk: ["canvas:ActorLayer (player walk)"],
    guest_a_down_0: ["canvas:ActorLayer (silver-haired older guest)"],
    guest_b_down_0: ["canvas:ActorLayer (mustached dark-skinned guest)"],
    guest_c_down_0: ["canvas:ActorLayer (black-bobbed young guest)"],
    guest_d_down_0: ["canvas:ActorLayer (gray-haired guest with glasses)"],
    guest_e_down_0: ["canvas:ActorLayer (tan guest with dark curls)"],
    customer: ["canvas:CustomerLayer", "canvas:ActorLayer"],
    customer_b: ["canvas:ActorLayer"],
    player: ["canvas:ActorLayer"],
  };
  for (const [name, file] of Object.entries(STORYBOOK_PLAYER_SPRITES)) {
    add({
      path: `atlases/characters.json#${name}`,
      pack: PACKS.generatedStorybook.pack,
      author: PACKS.generatedStorybook.author,
      sourceUrl: PACKS.generatedStorybook.sourceUrl,
      license: "CC0",
      usedIn: characterUsedIn[name] ?? ["canvas:ActorLayer (player)"],
      sourceFile: `player-frames/${file}`,
      approximationNote: PACKS.generatedStorybook.note,
    });
  }

  for (const [name, file] of Object.entries(STORYBOOK_GUEST_SPRITES)) {
    add({
      path: `atlases/characters.json#${name}`,
      pack: PACKS.generatedStorybook.pack,
      author: PACKS.generatedStorybook.author,
      sourceUrl: PACKS.generatedStorybook.sourceUrl,
      license: "CC0",
      usedIn: characterUsedIn[name] ?? ["canvas:ActorLayer (restaurant guest)"],
      sourceFile: `guest-frames/${file}`,
      approximationNote: PACKS.generatedStorybook.note,
    });
  }

  for (const [ingredientId] of Object.entries(
    JSON.parse(
      readFileSync(path.join(GENERATED_ICONS, "manifest.json"), "utf8"),
    ) as Record<string, string>,
  )) {
    const sprite = ingredientId.startsWith("icon_")
      ? ingredientId
      : `icon_${ingredientId}`;
    const id = sprite.replace(/^icon_/, "");
    add({
      path: `atlases/food.json#${sprite}`,
      pack: PACKS.generatedFood.pack,
      author: PACKS.generatedFood.author,
      sourceUrl: PACKS.generatedFood.sourceUrl,
      license: "CC0",
      usedIn: [
        "ui:shop",
        "ui:compose",
        "ui:flavor-inspector",
        "ui:recipe-book",
      ],
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
      license: "CC0",
      usedIn: ["app:AudioManager"],
      sourceFile: spec.rel,
    });
  }

  const covered = new Set<string>();
  for (const entry of entries) {
    const base = entry.path.split("#")[0]!;
    covered.add(base);
  }
  for (const file of shippedFiles) {
    if (covered.has(file)) continue;
    if (file === "CREDITS.json") continue;
    let meta = PACKS.generatedStorybook;
    if (file.startsWith("atlases/food")) meta = PACKS.generatedFood;
    else if (file.startsWith("atlases/furniture"))
      meta = PACKS.generatedStorybookProps;
    else if (file.startsWith("atlases/tiles"))
      meta = PACKS.generatedStorybookTiles;
    else if (file.startsWith("atlases/characters"))
      meta = PACKS.generatedStorybook;
    else if (file.startsWith("sfx/") || file.startsWith("music/"))
      meta = PACKS.rpgAudio;
    add({
      path: file,
      pack: meta.pack,
      author: meta.author,
      sourceUrl: meta.sourceUrl,
      license: "CC0",
      usedIn: ["build:generated artifact from CC0 atlas/audio pipeline"],
    });
  }

  const manifest = {
    version: 1,
    generatedBy: "scripts/build-assets.ts",
    generatedAt: new Date().toISOString(),
    policy: "CC0-only",
    vendorNote:
      "CC0 sources are retained under vendor/kenney/sources/ and vendor/generated/; Storybook v2 art is project-generated and dedicated to CC0.",
    packs: Object.values(PACKS),
    entries,
    shippedFiles,
  };

  writeFileSync(
    path.join(OUT, "CREDITS.json"),
    JSON.stringify(manifest, null, 2),
  );
}

function listShippedFiles(dir: string, prefix = ""): string[] {
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
  runAchievementBadgeBuilder();
  runStorybookCharacterBuilder();
  runStorybookGuestBuilder();
  runStorybookPropBuilder();
  runStorybookTileBuilder();

  const tmp = path.join(ROOT, "scripts", ".asset-build");
  mkdirSync(tmp, { recursive: true });
  mkdirSync(path.join(OUT, "atlases"), { recursive: true });

  const tileManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(TILE_SPRITES)) {
    tileManifest[name] = path.join(
      name === "door" || name === "door_open"
        ? GENERATED_STORYBOOK_PROPS
        : GENERATED_STORYBOOK_TILES,
      file,
    );
  }
  const tileManifestPath = path.join(tmp, "tiles.manifest.json");
  writeManifest(tileManifest, tileManifestPath);
  runPacker(
    tileManifestPath,
    path.join(OUT, "atlases", "tiles.png"),
    path.join(OUT, "atlases", "tiles.json"),
    192,
    1,
  );

  const furnitureManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(FURNITURE_SPRITES)) {
    furnitureManifest[name] = path.join(GENERATED_STORYBOOK_PROPS, file);
  }
  const furnitureManifestPath = path.join(tmp, "furniture.manifest.json");
  writeManifest(furnitureManifest, furnitureManifestPath);
  runPacker(
    furnitureManifestPath,
    path.join(OUT, "atlases", "furniture.png"),
    path.join(OUT, "atlases", "furniture.json"),
    192,
  );

  const charManifest: Record<string, string> = {};
  for (const [name, file] of Object.entries(STORYBOOK_PLAYER_SPRITES)) {
    const playerPath = path.join(GENERATED_PLAYER_FRAMES, file);
    if (!existsSync(playerPath)) {
      console.error(
        `Missing generated Storybook v2 player frame: ${playerPath}`,
      );
      process.exit(1);
    }
    charManifest[name] = playerPath;
  }
  for (const [name, file] of Object.entries(STORYBOOK_GUEST_SPRITES)) {
    const guestPath = path.join(GENERATED_GUEST_FRAMES, file);
    if (!existsSync(guestPath)) {
      console.error(`Missing generated Storybook v2 guest frame: ${guestPath}`);
      process.exit(1);
    }
    charManifest[name] = guestPath;
  }
  const charManifestPath = path.join(tmp, "characters.manifest.json");
  writeManifest(charManifest, charManifestPath);
  runPacker(
    charManifestPath,
    path.join(OUT, "atlases", "characters.png"),
    path.join(OUT, "atlases", "characters.json"),
    184,
    1,
  );

  runIngredientIconBuilder();

  const generatedManifest = JSON.parse(
    readFileSync(path.join(GENERATED_ICONS, "manifest.json"), "utf8"),
  ) as Record<string, string>;

  const ingredients = JSON.parse(
    readFileSync(path.join(ROOT, "src", "data", "ingredients.json"), "utf8"),
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
    console.error("Missing generated food icons:", missingIcons);
    process.exit(1);
  }

  const foodManifestPath = path.join(tmp, "food.manifest.json");
  writeManifest(foodManifest, foodManifestPath);
  runPacker(
    foodManifestPath,
    path.join(OUT, "atlases", "food.png"),
    path.join(OUT, "atlases", "food.json"),
    128,
  );

  copyAudio();
  copyAchievementBadges();

  const shippedFiles = listShippedFiles(OUT);
  buildCredits(shippedFiles);

  let atlasBytes = 0;
  let audioBytes = 0;
  for (const file of shippedFiles) {
    const size = statSync(path.join(OUT, file)).size;
    if (file.startsWith("sfx/") || file.startsWith("music/"))
      audioBytes += size;
    if (file.startsWith("atlases/") && file.endsWith(".png"))
      atlasBytes += size;
  }

  console.log("");
  console.log(`Asset build complete -> ${OUT}`);
  console.log(
    `  Atlas PNG payload: ${atlasBytes.toLocaleString("en-US")} bytes`,
  );
  console.log(`  Audio payload: ${audioBytes.toLocaleString("en-US")} bytes`);
  console.log(
    `  CREDITS entries: ${JSON.parse(readFileSync(path.join(OUT, "CREDITS.json"), "utf8")).entries.length}`,
  );
}

main();
