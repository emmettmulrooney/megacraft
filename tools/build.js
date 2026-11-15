// Generates every data file for MegaCraft (blocks, items, recipes, lang, manifests). No dependencies.
// Textures come from tools/textures.js. Scripts in "MegaCraft BP/scripts" are hand-written.
// Usage: node tools/build.js
const fs = require("fs");
const path = require("path");
const { makeTextures, TERRAIN, ITEM_TEX, HULL_COLORS } = require("./textures.js");

const ROOT = path.join(__dirname, "..");
const NAME = "MegaCraft";
const BP = path.join(ROOT, `${NAME} BP`);
const RP = path.join(ROOT, `${NAME} RP`);
const NS = "megacraft";
const ENGINE = [1, 21, 50];
const UUID = {
  bpHeader: "3e9b7d21-6a4c-4f18-b2e5-8c1d0a7f4b61",
  bpData: "d5a2c8f0-17e3-4b9a-a64d-2e8f5b3c9d72",
  bpScript: "8f41e6b3-c25d-4a07-9e1b-6d3a7c0f8e83",
  rpHeader: "b6c0f3a8-4d92-4e75-8a1f-0c7e2b9d5a94",
  rpRes: "1a7e9d4c-b38f-4c62-9d05-f4e8a2c6b1a5",
};

const write = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) + "\n");
};
for (const d of ["blocks", "items", "recipes", "texts"]) fs.rmSync(path.join(BP, d), { recursive: true, force: true });
for (const d of ["textures", "texts"]) fs.rmSync(path.join(RP, d), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------
write(path.join(BP, "manifest.json"), {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: UUID.bpHeader, version: [1, 0, 0], min_engine_version: ENGINE },
  modules: [
    { type: "data", uuid: UUID.bpData, version: [1, 0, 0] },
    { type: "script", language: "javascript", uuid: UUID.bpScript, entry: "scripts/main.js", version: [1, 0, 0] },
  ],
  dependencies: [
    { uuid: UUID.rpHeader, version: [1, 0, 0] },
    { module_name: "@minecraft/server", version: "1.16.0" },
    { module_name: "@minecraft/server-ui", version: "1.3.0" },
  ],
  metadata: { authors: ["Emmett"] },
});
write(path.join(RP, "manifest.json"), {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: UUID.rpHeader, version: [1, 0, 0], min_engine_version: ENGINE },
  modules: [{ type: "resources", uuid: UUID.rpRes, version: [1, 0, 0] }],
  dependencies: [{ uuid: UUID.bpHeader, version: [1, 0, 0] }],
  metadata: { authors: ["Emmett"] },
});

// ---------------------------------------------------------------------------
// Blocks (all full cubes, so they tile into giant smooth vehicles)
// ---------------------------------------------------------------------------
const CARD = "minecraft:cardinal_direction";
const DIRS = ["north", "east", "south", "west"];
const facing = { traits: { "minecraft:placement_direction": { enabled_states: [CARD], y_rotation_offset: 0 } } };
const mats = (m, method = "opaque") => Object.fromEntries(Object.entries(typeof m === "string" ? { "*": m } : m).map(([k, t]) => [k, { texture: `${NS}_${t}`, render_method: method }]));
const OPP = { north: "south", south: "north", east: "west", west: "east" };
/** Material map for a block whose front ("north" in art) faces `dir`. */
const turned = (dir, front, back, side, up, down) => ({ "*": side, [dir]: front, [OPP[dir]]: back ?? side, up: up ?? side, down: down ?? up ?? side });
const BLOCKS = [];
function block(id, name, comps, desc = {}, permutations = [], sound = "metal") {
  BLOCKS.push([id, name, sound]);
  write(path.join(BP, "blocks", `${id}.json`), {
    format_version: "1.21.40",
    "minecraft:block": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: "construction" }, ...desc },
      components: {
        "minecraft:display_name": `tile.${NS}:${id}.name`,
        "minecraft:destructible_by_mining": { seconds_to_destroy: 0.8 },
        "minecraft:destructible_by_explosion": { explosion_resistance: 8 },
        ...comps,
      },
      ...(permutations.length ? { permutations } : {}),
    },
  });
}

block("mega_table", "Mega Table", {
  "minecraft:material_instances": mats({ "*": "table_side", up: "table_top", down: "table_bottom" }),
  "minecraft:destructible_by_mining": { seconds_to_destroy: 2.5 },
  "minecraft:map_color": "#5d6b78",
});
const HULL_NAME = { white: "White", grey: "Grey", black: "Black", red: "Red", orange: "Orange", yellow: "Yellow", blue: "Blue", green: "Green" };
for (const c of HULL_COLORS) block(`hull_${c}`, `${HULL_NAME[c]} Mega Hull`, { "minecraft:material_instances": mats(`hull_${c}`), "minecraft:map_color": "#d0d4d8" });
block("window", "Mega Window", { "minecraft:material_instances": mats("window", "blend"), "minecraft:light_dampening": 0 }, {}, [], "glass");
block("mega_light", "Mega Light", { "minecraft:material_instances": mats("mega_light"), "minecraft:light_emission": 15 }, {}, [], "glass");
block("vehicle_core", "Vehicle Core", { "minecraft:material_instances": mats({ "*": "core_side", up: "core_top", down: "core_top" }), "minecraft:light_emission": 4 });
block("wing", "Wing Panel", { "minecraft:material_instances": mats({ "*": "wing_edge", up: "wing_top", down: "wing_bottom" }) });
block("landing_gear", "Landing Gear", { "minecraft:material_instances": mats({ "*": "gear_side", up: "gear_top", down: "gear_bottom" }) });
block("parachute_pod", "Parachute Pod", { "minecraft:material_instances": mats({ "*": "chute_side", up: "chute_top", down: "chute_top" }) }, {}, [], "cloth");

// Rocket engine: nozzle at the bottom; glows and shows flame while firing.
const lit = { [`${NS}:lit`]: [false, true] };
block("rocket_engine", "Rocket Engine", {
  "minecraft:material_instances": mats({ "*": "rocket_side", up: "rocket_top", down: "rocket_nozzle" }),
}, { states: lit }, [{
  condition: `q.block_state('${NS}:lit')`,
  components: { "minecraft:material_instances": mats({ "*": "rocket_side_on", up: "rocket_top", down: "rocket_nozzle_on" }), "minecraft:light_emission": 15 },
}]);

// Jet engine and cockpit: face the way the player looks when placing them.
{
  const perms = [];
  for (const dir of DIRS) for (const on of [false, true]) perms.push({
    condition: `q.block_state('${CARD}') == '${dir}' && ${on ? "" : "!"}q.block_state('${NS}:lit')`,
    components: { "minecraft:material_instances": mats(turned(dir, "jet_intake", on ? "jet_exhaust_on" : "jet_exhaust", "jet_side")), ...(on ? { "minecraft:light_emission": 10 } : {}) },
  });
  block("jet_engine", "Jet Engine", { "minecraft:material_instances": mats(turned("north", "jet_intake", "jet_exhaust", "jet_side")) }, { ...facing, states: lit }, perms);
}
block("cockpit", "Cockpit", { "minecraft:material_instances": mats(turned("north", "cockpit_front", "cockpit_back", "cockpit_side", "cockpit_top", "cockpit_bottom")) }, facing,
  DIRS.map((dir) => ({ condition: `q.block_state('${CARD}') == '${dir}'`, components: { "minecraft:material_instances": mats(turned(dir, "cockpit_front", "cockpit_back", "cockpit_side", "cockpit_top", "cockpit_bottom")) } })));

// Fuel tank: gauge shows 4..0 bars left (`used` 0 = full).
block("fuel_tank", "Fuel Tank", { "minecraft:material_instances": mats({ "*": "tank_0", up: "tank_top", down: "tank_top" }) }, { states: { [`${NS}:used`]: { values: { min: 0, max: 4 } } } },
  [0, 1, 2, 3, 4].map((u) => ({ condition: `q.block_state('${NS}:used') == ${u}`, components: { "minecraft:material_instances": mats({ "*": `tank_${u}`, up: "tank_top", down: "tank_top" }) } })));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const ITEMS = [
  ["fuel_can", "Fuel Can", 16, "items"],
  ["mega_wand", "Mega Wand", 1, "equipment"],
  ["flight_stick", "Flight Stick", 1, "equipment"],
];
for (const [id, , stack, cat] of ITEMS) {
  write(path.join(BP, "items", `${id}.json`), {
    format_version: "1.21.40",
    "minecraft:item": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: cat } },
      components: { "minecraft:display_name": { value: `item.${NS}:${id}` }, "minecraft:icon": `${NS}_${id}`, "minecraft:max_stack_size": stack },
    },
  });
}

// Vanilla recipe: only the Mega Table. Everything else is made AT the Mega Table (scripts/recipes.js).
write(path.join(BP, "recipes", "mega_table.json"), {
  format_version: "1.20.10",
  "minecraft:recipe_shaped": {
    description: { identifier: `${NS}:mega_table` },
    tags: ["crafting_table"],
    pattern: ["IBI", "ICI", "I I"],
    key: { I: { item: "minecraft:iron_ingot" }, B: { item: "minecraft:iron_block" }, C: { item: "minecraft:crafting_table" } },
    unlock: [{ item: "minecraft:iron_ingot" }],
    result: { item: `${NS}:mega_table`, count: 1 },
  },
});

// ---------------------------------------------------------------------------
// Resource pack atlases + texts
// ---------------------------------------------------------------------------
makeTextures(RP, BP);
write(path.join(RP, "textures", "terrain_texture.json"), {
  resource_pack_name: NAME, texture_name: "atlas.terrain", padding: 8, num_mip_levels: 4,
  texture_data: Object.fromEntries(TERRAIN.map((t) => [`${NS}_${t}`, { textures: `textures/blocks/${NS}_${t}` }])),
});
write(path.join(RP, "textures", "item_texture.json"), {
  resource_pack_name: NAME, texture_name: "atlas.items",
  texture_data: Object.fromEntries(ITEMS.map(([id]) => [`${NS}_${id}`, { textures: `textures/items/${NS}_${id}` }])),
});
write(path.join(RP, "blocks.json"), {
  format_version: "1.21.40",
  ...Object.fromEntries(BLOCKS.map(([id, , sound]) => [`${NS}:${id}`, { sound }])),
});
const DESC = "Build giant rockets and planes on the Mega Table, then fly them: countdowns, liftoff, real thrust and lift, and crashes.";
const lang = [
  `pack.name=${NAME}`,
  `pack.description=${DESC}`,
  ...BLOCKS.map(([id, name]) => `tile.${NS}:${id}.name=${name}`),
  ...ITEMS.map(([id, name]) => `item.${NS}:${id}=${name}`),
].join("\n") + "\n";
for (const dir of [BP, RP]) {
  write(path.join(dir, "texts", "en_US.lang"), lang);
  write(path.join(dir, "texts", "languages.json"), JSON.stringify(["en_US"]) + "\n");
}

// Sanity: every texture referenced exists.
const terrain = new Set(TERRAIN);
for (const f of fs.readdirSync(path.join(BP, "blocks"))) {
  const s = fs.readFileSync(path.join(BP, "blocks", f), "utf8");
  for (const m of s.matchAll(/"texture": "megacraft_(\w+)"/g)) if (!terrain.has(m[1])) throw new Error(`${f}: missing terrain texture ${m[1]}`);
}
for (const [id] of ITEMS) if (!ITEM_TEX.includes(id)) throw new Error(`missing item texture ${id}`);
for (const t of TERRAIN) if (!fs.existsSync(path.join(RP, "textures", "blocks", `${NS}_${t}.png`))) throw new Error(`missing png ${t}`);
console.log(`Built ${BLOCKS.length} blocks, ${ITEMS.length} items ->`, BP, RP);
