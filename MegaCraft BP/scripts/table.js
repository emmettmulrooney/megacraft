// Mega Table UI: crafting giant vehicle parts, and building whole rockets and planes from blueprints.
import { ItemStack, BlockPermutation } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { RECIPES, CATEGORIES, NAMES, maxCrafts } from "./recipes.js";
import { BLUEPRINTS, orient, bill } from "./shapes.js";
import { stats, CARD4, HEADINGS, headingFromYaw, bbox } from "./vehicle.js";
import { show, isCreative, sound, container, takeItem, giveItem, pretty, placeBatched } from "./util.js";

const NS = "megacraft";
const label = (id) => (id.startsWith(`${NS}:`) ? NAMES[id.slice(NS.length + 1)] ?? pretty(id) : pretty(id));

export function inventory(p) {
  const have = new Map();
  const inv = container(p);
  if (inv) for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it) have.set(it.typeId, (have.get(it.typeId) ?? 0) + it.amount);
  }
  return have;
}

export async function openTable(p, dim, loc) {
  for (;;) {
    const f = new ActionFormData().title("§lMega Table").body("Heavy engineering for §lgiant§r builds.\nCraft hull plating by the stack, rocket and jet engines, wings, fuel tanks, and cockpits. Or pick a §eBlueprint§r and build a whole rocket or plane in one go.");
    for (const c of CATEGORIES) f.button(c);
    f.button("§8Guide");
    const r = await show(f, p);
    if (r.canceled) return;
    if (r.selection === CATEGORIES.length) await guide(p);
    else if (CATEGORIES[r.selection] === "Blueprints") await blueprints(p, dim, loc);
    else await category(p, CATEGORIES[r.selection]);
  }
}

async function category(p, cat) {
  for (;;) {
    const list = RECIPES.filter((r) => r.cat === cat);
    const have = inventory(p), free = isCreative(p);
    const f = new ActionFormData().title(cat);
    for (const rec of list) {
      const n = free ? 64 : maxCrafts(rec, have);
      f.button(`${n > 0 ? "§2" : "§8"}${NAMES[rec.id]} ×${rec.out[1]}\n§r§7${rec.in.map(([id, a]) => `${a} ${label(id)}`).join(", ")}`);
    }
    const r = await show(f, p);
    if (r.canceled) return;
    await craft(p, list[r.selection]);
  }
}

async function craft(p, rec) {
  const free = isCreative(p);
  const max = Math.min(64, free ? 64 : maxCrafts(rec, inventory(p)));
  const needs = rec.in.map(([id, a]) => `§7- ${a} × ${label(id)} §8(have ${inventory(p).get(id) ?? 0})`).join("\n");
  if (max < 1) {
    await show(new ActionFormData().title(NAMES[rec.id]).body(`${rec.desc}\n\n§cYou need:\n${needs}`).button("Back"), p);
    return;
  }
  let times = 1;
  if (max > 1) {
    const r = await show(new ModalFormData().title(NAMES[rec.id]).slider(`${rec.desc}\n\nMakes ${rec.out[1]} each. Needs:\n${needs}\n\nHow many batches`, 1, max, 1, 1), p);
    if (r.canceled) return;
    times = r.formValues[0];
  }
  if (!free) {
    if (maxCrafts(rec, inventory(p)) < times) return p.onScreenDisplay.setActionBar("§cNot enough materials.");
    for (const [id, a] of rec.in) takeItem(p, id, a * times);
  }
  let total = rec.out[1] * times;
  while (total > 0) {
    const n = Math.min(64, total);
    giveItem(p, new ItemStack(rec.out[0], n));
    total -= n;
  }
  sound(p, "random.anvil_use", 0.8);
  p.onScreenDisplay.setActionBar(`§aMade ${rec.out[1] * times} × ${NAMES[rec.id]}`);
}

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------
const REPLACEABLE = /^minecraft:(air|short_grass|tall_grass|fern|large_fern|snow_layer|deadbush|dandelion|poppy|red_flower|yellow_flower)$/;

/** Where would this blueprint go? Starts 2 blocks past the table in the direction the player faces. */
export function plan(bp, p, loc) {
  const h = headingFromYaw(p.getRotation().y);
  const cells = orient(bp.build(), CARD4[h]);
  const { lo, hi } = bbox(cells);
  const [fx, fz] = HEADINGS[h];
  // put the near edge of the box 2 blocks beyond the table, centred sideways on it
  const base = { x: loc.x, y: loc.y - lo[1], z: loc.z };
  if (fx) {
    base.x = fx > 0 ? loc.x + 2 - lo[0] : loc.x - 2 - hi[0];
    base.z = loc.z - Math.round((lo[2] + hi[2]) / 2);
  } else {
    base.z = fz > 0 ? loc.z + 2 - lo[2] : loc.z - 2 - hi[2];
    base.x = loc.x - Math.round((lo[0] + hi[0]) / 2);
  }
  return { cells, base, size: [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1] };
}

async function blueprints(p, dim, loc) {
  for (;;) {
    const f = new ActionFormData().title("Blueprints").body("Build a complete vehicle in front of this table. In Survival you need every part in your inventory.");
    for (const bp of BLUEPRINTS) {
      const s = stats(bp.build().map((c) => `${NS}:${c[3]}`));
      f.button(`${bp.name}\n§r§7${s.blocks} blocks, ${s.kind}`);
    }
    const r = await show(f, p);
    if (r.canceled) return;
    await blueprint(p, dim, loc, BLUEPRINTS[r.selection]);
  }
}

async function blueprint(p, dim, loc, bp) {
  const free = isCreative(p);
  const pl = plan(bp, p, loc);
  const need = bill(pl.cells);
  const have = inventory(p);
  const lines = [...need].map(([part, n]) => {
    const h = have.get(`${NS}:${part}`) ?? 0;
    return `${free || h >= n ? "§a" : "§c"}${n} × ${NAMES[part]}§8 (have ${h})`;
  });
  const short = !free && [...need].some(([part, n]) => (have.get(`${NS}:${part}`) ?? 0) < n);
  const s = stats(pl.cells.map((c) => `${NS}:${c[3]}`));
  const body = `${bp.desc}\nSize ${pl.size.join(" × ")}, ${s.blocks} blocks. ${s.kind === "rocket" ? `Thrust ${s.thrust} vs mass ${s.mass}.` : `Push ${s.push}, lift ${s.lift}, mass ${s.mass}.`}\nIt'll be built in the direction you're facing, 2 blocks past the table.\n\n${lines.join("\n")}`;
  const r = await show(new MessageFormData().title(bp.name).body(body).button1(short ? "Back" : "§lBuild it!").button2("Back"), p);
  if (r.canceled || r.selection !== 0 || short) return;
  // check the space
  const blocked = [];
  for (const [x, y, z] of pl.cells) {
    const l = { x: pl.base.x + x, y: pl.base.y + y, z: pl.base.z + z };
    let b;
    try {
      b = dim.getBlock(l);
    } catch {}
    if (!b || !REPLACEABLE.test(b.typeId)) { blocked.push(l); if (blocked.length > 2) break; }
  }
  if (blocked.length) {
    const b = blocked[0];
    return p.sendMessage(`§6[MegaCraft]§r §cNot enough room.§r Something is in the way at ${b.x}, ${b.y}, ${b.z}. Clear a ${pl.size.join(" × ")} space in front of the table.`);
  }
  if (!free) for (const [part, n] of need) if (!takeItem(p, `${NS}:${part}`, n)) return p.onScreenDisplay.setActionBar("§cMissing parts.");
  const list = pl.cells.map(([x, y, z, part, st]) => [{ x: pl.base.x + x, y: pl.base.y + y, z: pl.base.z + z }, BlockPermutation.resolve(`${NS}:${part}`, st ?? {})]);
  // build bottom-up so it looks like it's being assembled
  list.sort((a, b) => a[0].y - b[0].y);
  sound(p, "random.anvil_use", 0.6);
  p.onScreenDisplay.setActionBar(`§eAssembling ${bp.name}...`);
  placeBatched(dim, list, 300, () => {
    sound(p, "random.levelup", 1.2);
    p.sendMessage(`§6[MegaCraft]§r §a${bp.name} built!§r Climb in and use the §fCockpit§r to ${s.kind === "rocket" ? "launch" : "take off"}.`);
  });
}

async function guide(p) {
  await show(new ActionFormData().title("MegaCraft Guide").body([
    "§lBUILDING A VEHICLE",
    "A vehicle is every MegaCraft block connected to one §eVehicle Core§r (touching face to face). Hull, windows, lights, engines, wings, tanks, gear, and cockpits all count. Vanilla blocks never count, so your launch pad stays put.",
    "",
    "§lROCKETS",
    "Put §eRocket Engines§r at the bottom. Total thrust must be more than 1.2× the mass (shown when you use the Core). Add §eFuel Tanks§r, a §eCockpit§r, and a §eParachute Pod§r for a safe landing. Use the Cockpit (or any Mega Window on the vehicle to climb in): 3, 2, 1, liftoff! Jump = throttle up, Sneak = throttle down. Fly high enough and you reach space.",
    "",
    "§lPLANES",
    "Use §eJet Engines§r and §eWing Panels§r (total lift at least the mass). Use the Cockpit to taxi, hold Jump to speed up, then look up to take off. Look left or right to turn, down to dive. Below speed 9 you stall and sink. §eLanding Gear§r lets you land harder.",
    "",
    "§lTOOLS",
    "The §eMega Wand§r fills giant shapes: tap two blocks to mark corners, then use it in the air to fill a box, cylinder, tube, nose cone, ellipsoid, or tapered wing with the hull in your inventory. The §eFlight Stick§r opens the flight panel (throttle, bail out). §eFuel Cans§r refill tanks.",
    "",
    "§lCRASHING",
    "Hitting something too fast blows the vehicle up. Pilots are protected, but your build isn't!",
  ].join("\n")).button("Back"), p);
}
