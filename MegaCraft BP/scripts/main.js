// MegaCraft entry point: block interactions and item uses.
import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { openTable } from "./table.js";
import { survey, takeOff, flightAt, seatPassenger, flightPanel, riding, flights } from "./flight.js";
import { markCorner, fillMenu, WAND } from "./wand.js";
import { NS, USED, TANK_LEVELS, PER_LEVEL } from "./vehicle.js";
import { show, isCreative, sound, cooldown, isBlockItem, takeItem } from "./util.js";

const TABLE = `${NS}:mega_table`, COCKPIT = `${NS}:cockpit`, CORE = `${NS}:vehicle_core`, TANK = `${NS}:fuel_tank`;
const CAN = `${NS}:fuel_can`, STICK = `${NS}:flight_stick`;
const WINDOW = `${NS}:window`;
const INTERACTIVE = new Set([TABLE, COCKPIT, CORE, TANK, WINDOW]);

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { block, player: p } = ev;
  const held = ev.itemStack?.typeId;
  if (held === WAND) return; // handled by itemUseOn
  if (!INTERACTIVE.has(block.typeId) || p.isSneaking) return;
  if (block.typeId !== TABLE && isBlockItem(held)) return; // let people keep building onto their vehicle
  if (block.typeId === TANK && held !== CAN) return;
  ev.cancel = true;
  if (ev.isFirstEvent === false || !cooldown(p, "interact", 8)) return;
  const dim = block.dimension, loc = { x: block.x, y: block.y, z: block.z }, typeId = block.typeId;
  system.run(() => {
    if (typeId === TABLE) return openTable(p, dim, loc).catch(() => {});
    if (typeId === CORE) return coreInfo(p, dim, loc).catch(() => {});
    if (typeId === TANK) return refuel(p, dim, loc);
    if (typeId === COCKPIT) return cockpit(p, dim, loc);
    if (typeId === WINDOW) return board(p, dim, loc);
  });
});

/** Clicking a vehicle's window climbs into the nearest cockpit (rocket cockpits are sealed inside the hull). */
function board(p, dim, loc) {
  const hit = flightAt(dim, loc);
  const cockpits = hit
    ? hit[0].cells.filter((c) => c.perm.type.id === COCKPIT).map((c) => ({ x: hit[0].pos.x + c.o[0], y: hit[0].pos.y + c.o[1], z: hit[0].pos.z + c.o[2] }))
    : survey(dim, loc).cells.filter((c) => c[3] === COCKPIT).map(([x, y, z]) => ({ x, y, z }));
  if (!cockpits.length) return p.onScreenDisplay.setActionBar("§7This vehicle has no Cockpit.");
  const d = (c) => (c.x - loc.x) ** 2 + (c.y - loc.y) ** 2 + (c.z - loc.z) ** 2;
  cockpits.sort((a, b) => d(a) - d(b));
  cockpit(p, dim, cockpits[0]);
}

function cockpit(p, dim, loc) {
  if (riding(p)) return;
  const hit = flightAt(dim, loc);
  if (hit) {
    const [v, i] = hit;
    if (!v.pilot && v.cells[i].perm.type.id === COCKPIT) {
      v.pilot = p.id;
      v.riders.set(p.id, i);
      p.sendMessage("§6[MegaCraft]§r You took the controls.");
      return;
    }
    if (!seatPassenger(p, v, i)) p.onScreenDisplay.setActionBar("§7That seat is taken.");
    return;
  }
  const r = takeOff(p, dim, loc);
  if (!r.ok) {
    sound(p, "note.bass", 0.6);
    p.sendMessage(`§6[MegaCraft]§r §cCan't fly yet:§r\n§7- ${r.probs.join("\n§7- ")}`);
  }
}

async function coreInfo(p, dim, loc) {
  const s = survey(dim, loc);
  const st = s.st;
  const body = [
    `§lVehicle§r: ${st.blocks} blocks, mass §f${st.mass}`,
    `Type: §e${st.kind === "none" ? "no engines yet" : st.kind}`,
    `Rocket engines ${st.rockets} (thrust ${st.thrust}, needs ${Math.ceil(st.mass * 1.2)})`,
    `Jet engines ${st.jets} (push ${st.push}), wings ${st.wings} (lift ${st.lift}, needs ${st.mass})`,
    `Fuel ${s.fuel}/${st.fuelCap}, cockpits ${st.seats}, landing gear ${st.gear}, parachutes ${st.chutes}`,
    "",
    s.probs.length ? `§cNot ready:\n§7- ${s.probs.join("\n- ")}` : "§a§lReady to fly!§r Use a Cockpit to go.",
  ].join("\n");
  await show(new ActionFormData().title("Vehicle Core").body(body).button("OK"), p);
}

function refuel(p, dim, loc) {
  if (flightAt(dim, loc)) return p.onScreenDisplay.setActionBar("§7Land first, then refuel.");
  const b = dim.getBlock(loc);
  const used = b.permutation.getState(USED) ?? 0;
  if (!used) return p.onScreenDisplay.setActionBar(`§7This tank is full (${TANK_LEVELS * PER_LEVEL} fuel).`);
  if (!isCreative(p) && !takeItem(p, CAN, 1)) return;
  b.setPermutation(b.permutation.withState(USED, 0));
  sound(p, "bucket.fill_lava", 1);
  p.onScreenDisplay.setActionBar("§aTank refilled.");
}

// Mega Wand: tap blocks to mark corners.
world.beforeEvents.itemUseOn.subscribe((ev) => {
  if (ev.itemStack?.typeId !== WAND) return;
  ev.cancel = true;
  const p = ev.source, block = ev.block;
  if (!cooldown(p, "wand", 6)) return;
  system.run(() => markCorner(p, block));
});

world.afterEvents.itemUse.subscribe(({ source: p, itemStack }) => {
  if (p.typeId !== "minecraft:player") return;
  const id = itemStack?.typeId;
  if (id === STICK) system.run(() => flightPanel(p).catch(() => {}));
  if (id === WAND) {
    // itemUse can also fire right after an itemUseOn on some devices; ignore it if a corner was just marked.
    if (!cooldown(p, "wand", 6)) return;
    system.run(() => fillMenu(p).catch(() => {}));
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.getDynamicProperty("megacraft:welcomed")) return;
  player.setDynamicProperty("megacraft:welcomed", true);
  system.runTimeout(() => {
    player.sendMessage("§l§6MegaCraft§r §7is installed. Craft a §fMega Table§7 (iron ingots, an iron block, and a crafting table) and use it to build giant rockets and planes.");
  }, 60);
});

export { flights };
