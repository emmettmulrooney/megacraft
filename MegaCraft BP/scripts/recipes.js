// Mega Table recipes. Pure data; unit-tested. Mega parts come out in big batches because vehicles are huge.
import { HULLS } from "./vehicle.js";

const M = (id) => `minecraft:${id}`;
const N = (id) => `megacraft:${id}`;
const DYE = { white: "white_dye", grey: "gray_dye", black: "black_dye", red: "red_dye", orange: "orange_dye", yellow: "yellow_dye", blue: "blue_dye", green: "green_dye" };
export const HULL_NAME = { white: "White", grey: "Grey", black: "Black", red: "Red", orange: "Orange", yellow: "Yellow", blue: "Blue", green: "Green" };

export const CATEGORIES = ["Hull & Glass", "Engines & Fuel", "Flight Systems", "Tools", "Blueprints"];

export const NAMES = {
  mega_table: "Mega Table", window: "Mega Window", rocket_engine: "Rocket Engine", jet_engine: "Jet Engine", wing: "Wing Panel",
  fuel_tank: "Fuel Tank", cockpit: "Cockpit", vehicle_core: "Vehicle Core", landing_gear: "Landing Gear", parachute_pod: "Parachute Pod",
  mega_light: "Mega Light", fuel_can: "Fuel Can", mega_wand: "Mega Wand", flight_stick: "Flight Stick",
  ...Object.fromEntries(HULLS.map((c) => [`hull_${c}`, `${HULL_NAME[c]} Mega Hull`])),
};

export const RECIPES = [
  ...HULLS.map((c) => ({
    id: `hull_${c}`, cat: "Hull & Glass", out: [N(`hull_${c}`), 32], in: [[M("iron_ingot"), 2], [M("cobblestone"), 8], [M(DYE[c]), 1]],
    desc: "Riveted structural plating. Vehicles are built from it: rocket bodies, fuselages, tails, nose cones.",
  })),
  { id: "window", cat: "Hull & Glass", out: [N("window"), 16], in: [[M("glass"), 8], [M("iron_ingot"), 1]], desc: "Framed porthole glass. Counts as part of the vehicle." },
  { id: "mega_light", cat: "Hull & Glass", out: [N("mega_light"), 4], in: [[M("glowstone_dust"), 4], [M("iron_ingot"), 2]], desc: "A bright navigation beacon. Counts as part of the vehicle." },

  { id: "rocket_engine", cat: "Engines & Fuel", out: [N("rocket_engine"), 4], in: [[M("iron_ingot"), 8], [M("blast_furnace"), 1], [M("gunpowder"), 4]], desc: "Thrust 100 straight up. A rocket needs more thrust than 1.2× its mass to lift off. Put them at the bottom." },
  { id: "jet_engine", cat: "Engines & Fuel", out: [N("jet_engine"), 2], in: [[M("iron_ingot"), 6], [M("copper_ingot"), 4], [M("furnace"), 1]], desc: "Push 60 forward. Any vehicle with jet engines (and no rocket engines) flies like a plane." },
  { id: "fuel_tank", cat: "Engines & Fuel", out: [N("fuel_tank"), 4], in: [[M("iron_ingot"), 4], [M("coal"), 4]], desc: "120 fuel each. Every engine burns 1 fuel per second at full throttle. Comes full." },
  { id: "fuel_can", cat: "Engines & Fuel", out: [N("fuel_can"), 2], in: [[M("coal"), 4], [M("gunpowder"), 1], [M("iron_ingot"), 1]], desc: "Use on a Fuel Tank to refill it." },

  { id: "vehicle_core", cat: "Flight Systems", out: [N("vehicle_core"), 1], in: [[M("iron_ingot"), 4], [M("redstone"), 4], [M("compass"), 1]], desc: "The brain. Every vehicle needs exactly one. Every MegaCraft block touching it (and touching those) becomes the vehicle." },
  { id: "cockpit", cat: "Flight Systems", out: [N("cockpit"), 1], in: [[M("iron_ingot"), 4], [M("glass"), 2], [M("redstone"), 2]], desc: "A pilot seat. Use it to fly. Extra cockpits are passenger seats. Leave the space above it open for your head." },
  { id: "wing", cat: "Flight Systems", out: [N("wing"), 16], in: [[M("iron_ingot"), 4], [M("copper_ingot"), 2]], desc: "Lift 12 each. A plane needs total lift at least equal to its mass." },
  { id: "landing_gear", cat: "Flight Systems", out: [N("landing_gear"), 4], in: [[M("iron_ingot"), 3], [M("leather"), 2]], desc: "Wheels and struts. Planes with landing gear survive much harder landings." },
  { id: "parachute_pod", cat: "Flight Systems", out: [N("parachute_pod"), 1], in: [[M("white_wool"), 6], [M("string"), 4]], desc: "Rockets with a parachute fall at only 5 blocks per second and splash down safely." },

  { id: "mega_wand", cat: "Tools", out: [N("mega_wand"), 1], in: [[M("stick"), 1], [M("gold_ingot"), 2], [M("redstone"), 1]], desc: "Mark two corners, then fill the space with a giant box, cylinder, tube, cone, ellipsoid, or wing in one go." },
  { id: "flight_stick", cat: "Tools", out: [N("flight_stick"), 1], in: [[M("stick"), 1], [M("redstone"), 1]], desc: "Opens the flight panel while you're flying. You get one free when you take off." },
];

/** How many times can this recipe be made from `have` (Map id -> count)? */
export function maxCrafts(recipe, have) {
  let n = Infinity;
  for (const [id, amt] of recipe.in) n = Math.min(n, Math.floor((have.get(id) ?? 0) / amt));
  return n === Infinity ? 0 : n;
}
