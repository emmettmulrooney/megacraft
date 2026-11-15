// Flight engine: turns a structure of MegaCraft blocks into a flying vehicle.
// Vehicles stay real blocks. Each tick we work out the physics, check the leading face for obstacles,
// and shift the whole structure by whole blocks, rewriting only the cells whose block changes.
import { world, system, BlockPermutation, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  NS, scan, stats, problems, physics, isCrash, crashPower, takeWhole, rotOff, rotStates, okey, frontCells, bbox,
  headingFromYaw, CARD4, HEADINGS, tankStates, TANK_LEVELS, PER_LEVEL, USED, STALL as STALL_SPEED,
} from "./vehicle.js";
import { show, sound, isCreative, giveItem, countItem, particle } from "./util.js";

const COCKPIT = `${NS}:cockpit`, TANK = `${NS}:fuel_tank`, ROCKET = `${NS}:rocket_engine`, JET = `${NS}:jet_engine`;
const STICK = `${NS}:flight_stick`;
const LIT = `${NS}:lit`;
const DT = 0.05;
const REPLACEABLE = new Set([
  "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern", "minecraft:deadbush", "minecraft:snow_layer",
  "minecraft:fire", "minecraft:soul_fire", "minecraft:vine", "minecraft:seagrass", "minecraft:kelp", "minecraft:dandelion", "minecraft:poppy",
  "minecraft:red_flower", "minecraft:yellow_flower", "minecraft:sweet_berry_bush", "minecraft:glow_lichen", "minecraft:structure_void",
]);

/** @type {Map<string, any>} vehicle id -> flight */
export const flights = new Map();
let nextId = 1;
const permKey = (p) => `${p.type.id}${JSON.stringify(p.getAllStates())}`;
const posKey = (x, y, z) => `${x},${y},${z}`;
const add = (a, o) => ({ x: a.x + o[0], y: a.y + o[1], z: a.z + o[2] });

function free(dim, l) {
  let b;
  try {
    b = dim.getBlock(l);
  } catch {
    return false;
  }
  if (!b) return false; // unloaded chunk: treat as a wall
  return b.isAir || b.isLiquid || REPLACEABLE.has(b.typeId);
}

const maxY = (dim) => {
  try {
    return dim.heightRange.max;
  } catch {
    return dim.id.endsWith("nether") ? 128 : dim.id.endsWith("the_end") ? 256 : 320;
  }
};
const minY = (dim) => {
  try {
    return dim.heightRange.min;
  } catch {
    return dim.id.endsWith("overworld") ? -64 : 0;
  }
};

/** Which flight (if any) owns the block at loc? */
export function flightAt(dim, loc) {
  for (const v of flights.values()) {
    if (v.dim.id !== dim.id) continue;
    const i = v.index.get(posKey(loc.x - v.pos.x, loc.y - v.pos.y, loc.z - v.pos.z));
    if (i !== undefined) return [v, i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
/** Scan the vehicle that contains `loc`. Returns { cells (world coords), st, probs, overflow }. */
export function survey(dim, loc) {
  const get = (x, y, z) => {
    try {
      return dim.getBlock({ x, y, z })?.typeId;
    } catch {
      return undefined;
    }
  };
  const { cells, overflow } = scan(get, [loc.x, loc.y, loc.z]);
  const st = stats(cells.map((c) => c[3]));
  let fuel = 0;
  for (const [x, y, z, id] of cells) if (id === TANK) fuel += (TANK_LEVELS - (dim.getBlock({ x, y, z }).permutation.getState(USED) ?? 0)) * PER_LEVEL;
  const probs = problems(st);
  if (overflow) probs.unshift(`Too big: vehicles can be up to 2048 blocks.`);
  if (st.kind === "rocket" && st.jets) probs.push("Use Rocket Engines or Jet Engines, not both.");
  return { cells, st, fuel, probs };
}

export function takeOff(p, dim, cockpitLoc) {
  const s = survey(dim, cockpitLoc);
  if (s.probs.length) return { ok: false, probs: s.probs };
  const infinite = isCreative(p);
  if (!infinite && s.fuel <= 0) return { ok: false, probs: ["The fuel tanks are empty. Use Fuel Cans on them."] };
  const core = s.cells.find((c) => c[3] === `${NS}:vehicle_core`);
  const pos = { x: core[0], y: core[1], z: core[2] };
  const cells = s.cells.map(([x, y, z]) => {
    const perm = dim.getBlock({ x, y, z }).permutation;
    return { o: [x - pos.x, y - pos.y, z - pos.z], perm, k: permKey(perm) };
  });
  const cockpit = cells.find((c) => c.o[0] === cockpitLoc.x - pos.x && c.o[1] === cockpitLoc.y - pos.y && c.o[2] === cockpitLoc.z - pos.z);
  const face = cockpit.perm.getState("minecraft:cardinal_direction") ?? "north";
  const v = {
    id: nextId++, dim, pos, cells, index: null, st: s.st, kind: s.st.kind, fuel: s.fuel, infinite,
    throttle: 0, vy: 0, speed: 0, heading: Math.max(0, CARD4.indexOf(face)), acc: [0, 0, 0], stalled: false,
    pilot: p.id, riders: new Map([[p.id, cells.indexOf(cockpit)]]), countdown: s.st.kind === "rocket" ? 60 : 0,
    grounded: true, turnWait: 0, lit: false, sneakT: new Map(), ticks: 0, top: false, peak: pos.y, launchY: pos.y,
  };
  reindex(v);
  flights.set(v.id, v);
  if (!countItem(p, STICK)) giveItem(p, new ItemStack(STICK, 1));
  if (v.kind === "rocket") {
    p.sendMessage(`§6[MegaCraft]§r Rocket armed: §f${s.st.blocks}§r blocks, thrust §f${s.st.thrust}§r vs mass §f${s.st.mass}§r. Launching in 3...`);
    p.onScreenDisplay.setTitle?.("§c3", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0, subtitle: "§7Jump = more throttle, Sneak = less" });
  } else {
    v.throttle = 0.3; // taxi speed: below crash speed and below take-off speed
    p.sendMessage(`§6[MegaCraft]§r ${s.st.blocks}-block plane taxiing. §7Jump = more throttle (take off above ${STALL_SPEED} speed), Sneak = less. Look up/down to climb/dive, look left/right to turn. Flight Stick = panel.`);
  }
  return { ok: true, v };
}

function reindex(v) {
  v.index = new Map(v.cells.map((c, i) => [okey(c.o), i]));
  v.box = bbox(v.cells.map((c) => c.o));
}

// ---------------------------------------------------------------------------
// Moving blocks
// ---------------------------------------------------------------------------
function rewrite(v, next, nextPos) {
  // old world positions -> perm key, new world positions -> cell
  const old = new Map();
  for (const c of v.cells) old.set(posKey(v.pos.x + c.o[0], v.pos.y + c.o[1], v.pos.z + c.o[2]), c.k);
  const neu = new Map();
  for (const c of next) neu.set(posKey(nextPos.x + c.o[0], nextPos.y + c.o[1], nextPos.z + c.o[2]), c);
  const air = BlockPermutation.resolve("minecraft:air");
  let writes = 0;
  for (const [k, c] of neu) {
    if (old.get(k) === c.k) continue;
    const [x, y, z] = k.split(",").map(Number);
    try {
      v.dim.getBlock({ x, y, z })?.setPermutation(c.perm);
      writes++;
    } catch {}
  }
  for (const k of old.keys()) {
    if (neu.has(k)) continue;
    const [x, y, z] = k.split(",").map(Number);
    try {
      v.dim.getBlock({ x, y, z })?.setPermutation(air);
      writes++;
    } catch {}
  }
  v.cells = next;
  v.pos = nextPos;
  reindex(v);
  return writes;
}

/** Try to move by whole-block vector mv. Returns false if the vehicle crashed. */
function move(v, mv, vel) {
  const offs = v.cells.map((c) => c.o);
  const set = new Set(offs.map(okey));
  const shift = [0, 0, 0];
  let landed = false;
  for (const axis of [1, 0, 2]) {
    const sign = Math.sign(mv[axis]);
    if (!sign) continue;
    const front = frontCells(offs, set, axis, sign);
    for (let n = 0; n < Math.abs(mv[axis]); n++) {
      const step = [...shift];
      step[axis] += sign;
      let blocked = false;
      if (axis === 1 && sign > 0 && v.pos.y + v.box.hi[1] + step[1] >= maxY(v.dim)) {
        blocked = true;
        if (!v.top) {
          v.top = true;
          tell(v, "§b§lYOU REACHED SPACE!§r §7The edge of the sky. Throttle down to come back.");
          ridersDo(v, (p) => sound(p, "random.levelup", 0.8, 1));
        }
      } else if (axis === 1 && sign < 0 && v.pos.y + v.box.lo[1] + step[1] < minY(v.dim)) blocked = true;
      else for (const o of front) {
        const q = [o[0] + step[0], o[1] + step[1], o[2] + step[2]];
        if (set.has(okey(q))) continue; // our own block: it moves with us
        if (!free(v.dim, { x: v.pos.x + q[0], y: v.pos.y + q[1], z: v.pos.z + q[2] })) { blocked = true; break; }
      }
      if (blocked) {
        const impact = Math.abs(vel[axis]);
        if (!v.top && isCrash(impact, v.st)) return crash(v, impact), false;
        if (axis === 1) { v.vy = 0; v.acc[1] = 0; if (sign < 0) landed = true; }
        else { v.speed = 0; v.acc[0] = v.acc[2] = 0; }
        break;
      }
      shift[axis] += sign;
    }
  }
  if (shift[1] !== 0) v.grounded = false;
  if (shift[1] < 0) v.top = false;
  if (landed) v.grounded = true;
  if (shift.some(Boolean)) rewrite(v, v.cells, { x: v.pos.x + shift[0], y: v.pos.y + shift[1], z: v.pos.z + shift[2] });
  return true;
}

/** Rotate the vehicle t quarter turns (clockwise from above) around the core, if there's room. */
function turn(v, t) {
  const next = v.cells.map((c) => {
    const st = rotStates(c.perm.getAllStates(), t);
    let perm = c.perm;
    try {
      perm = BlockPermutation.resolve(c.perm.type.id, st);
    } catch {}
    return { o: rotOff(c.o, t), perm, k: permKey(perm) };
  });
  for (const c of next) {
    if (v.index.has(okey(c.o))) continue;
    if (!free(v.dim, add(v.pos, c.o))) return false;
  }
  const seats = new Map([...v.riders].map(([id, i]) => [id, i]));
  rewrite(v, next, v.pos);
  v.riders = seats; // cell order is preserved, so seat indices still match
  v.heading = (v.heading + t + 4) % 4;
  return true;
}

function setLit(v, on) {
  if (v.lit === on) return;
  v.lit = on;
  for (const c of v.cells) {
    const id = c.perm.type.id;
    if (id !== ROCKET && id !== JET) continue;
    try {
      c.perm = c.perm.withState(LIT, on);
      c.k = permKey(c.perm);
      v.dim.getBlock(add(v.pos, c.o))?.setPermutation(c.perm);
    } catch {}
  }
}

function crash(v, impact) {
  const dim = v.dim;
  const pts = [];
  const lead = v.cells.filter((_, i) => i % Math.max(1, Math.floor(v.cells.length / 4)) === 0).slice(0, 4);
  for (const c of lead) pts.push(add(v.pos, c.o));
  tell(v, `§c§lCRASH!§r §7You hit at ${impact.toFixed(1)} blocks/s.`);
  const riders = [...v.riders.keys()];
  end(v, false);
  const power = crashPower(v.st);
  for (const id of riders) {
    const p = world.getAllPlayers().find((q) => q.id === id);
    p?.addEffect("resistance", 100, { amplifier: 255, showParticles: false });
  }
  for (const l of pts) {
    try {
      dim.createExplosion({ x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 }, power, { breaksBlocks: true, causesFire: v.fuel > 0 });
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------
const playerById = (id) => world.getAllPlayers().find((p) => p.id === id);
function ridersDo(v, fn) {
  for (const id of v.riders.keys()) {
    const p = playerById(id);
    if (p) fn(p);
  }
}
function tell(v, msg) {
  ridersDo(v, (p) => p.sendMessage(`§6[MegaCraft]§r ${msg}`));
}
const seatLoc = (v, i) => {
  const o = v.cells[i]?.o ?? [0, 0, 0];
  return { x: v.pos.x + o[0] + 0.5, y: v.pos.y + o[1] + 1, z: v.pos.z + o[2] + 0.5 }; // sitting on the cockpit
};

export function seatPassenger(p, v, cellIndex) {
  for (const [id, i] of v.riders) if (i === cellIndex && id !== p.id) return false;
  v.riders.set(p.id, cellIndex);
  p.sendMessage("§6[MegaCraft]§r You're a passenger. §7Hold Sneak to get out.");
  return true;
}

function eject(v, p, bail) {
  v.riders.delete(p.id);
  if (v.pilot === p.id) v.pilot = null;
  const { lo, hi } = v.box;
  const s = seatLoc(v, 0);
  const x = v.pos.x + hi[0] + 2, z = Math.floor(s.z);
  let y = Math.floor(p.location.y);
  if (!bail) for (let k = 0; k < 64 && free(v.dim, { x, y: y - 1, z }); k++) y--;
  try {
    p.teleport({ x: x + 0.5, y, z: z + 0.5 }, { dimension: v.dim });
  } catch {}
  p.addEffect("slow_falling", bail ? 600 : 60, { showParticles: false });
  p.removeEffect("resistance");
  if (bail) p.sendMessage("§6[MegaCraft]§r §eBailed out!§r §7Your parachute (Slow Falling) lasts 30 seconds.");
}

/** Vehicle comes to rest: write fuel back to tanks, shut the engines down, forget it. */
function end(v, writeBack = true) {
  flights.delete(v.id);
  if (!writeBack) return;
  setLit(v, false);
  const tanks = v.cells.filter((c) => c.perm.type.id === TANK);
  const used = tankStates(v.infinite ? Infinity : v.fuel, tanks.length);
  tanks.forEach((c, i) => {
    try {
      c.perm = c.perm.withState(USED, used[i]);
      v.dim.getBlock(add(v.pos, c.o))?.setPermutation(c.perm);
    } catch {}
  });
  ridersDo(v, (p) => {
    p.removeEffect("resistance");
    p.onScreenDisplay.setActionBar("§7Engines off. Vehicle parked.");
  });
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
function inputs(v) {
  for (const [id, seat] of [...v.riders]) {
    const p = playerById(id);
    if (!p || !p.isValid() || p.dimension.id !== v.dim.id) {
      v.riders.delete(id);
      if (v.pilot === id) v.pilot = null;
      continue;
    }
    const sl = seatLoc(v, seat);
    const d = Math.hypot(p.location.x - sl.x, p.location.y - sl.y, p.location.z - sl.z);
    if (d > 6 && v.ticks > 2) { // they teleported/died/were knocked away
      v.riders.delete(id);
      if (v.pilot === id) v.pilot = null;
      p.removeEffect("resistance");
      continue;
    }
    if (v.ticks % 20 === 0) p.addEffect("resistance", 40, { amplifier: 255, showParticles: false });
    const sneak = !!p.isSneaking;
    const st = (v.sneakT.get(id) ?? 0);
    v.sneakT.set(id, sneak ? st + 1 : 0);
    if (id === v.pilot) {
      if (p.isJumping && v.countdown <= 0) v.throttle = Math.min(1, v.throttle + 0.04);
      if (sneak) v.throttle = Math.max(0, v.throttle - 0.04);
      if (v.kind === "plane") {
        const r = p.getRotation();
        v.look = -r.x / 45;
        const want = headingFromYaw(r.y);
        if (want !== v.heading) {
          v.turnWait++;
          if (v.turnWait > 8) {
            const diff = (want - v.heading + 4) % 4;
            if (!turn(v, diff === 3 ? -1 : 1)) p.onScreenDisplay.setActionBar("§cNo room to turn here.");
            v.turnWait = 0;
          }
        } else v.turnWait = 0;
      }
    }
    // hold sneak to get out: passengers any time on the ground, pilots once throttle is 0
    const atRest = v.grounded && Math.abs(v.speed) < 1 && Math.abs(v.vy) < 1;
    if (sneak && st > 25 && atRest && (id !== v.pilot || v.throttle === 0)) eject(v, p, false);
    else if (sneak && st > 25 && !atRest && id !== v.pilot) p.onScreenDisplay.setActionBar("§7Wait for the landing, or use a Flight Stick → Bail Out.");
  }
}

function effects(v) {
  if (!v.lit || v.ticks % 2) return;
  const engines = v.cells.filter((c) => c.perm.type.id === (v.kind === "rocket" ? ROCKET : JET));
  const step = Math.max(1, Math.floor(engines.length / 10));
  for (let i = 0; i < engines.length; i += step) {
    const o = engines[i].o;
    if (v.kind === "rocket") {
      if (v.index.has(okey([o[0], o[1] - 1, o[2]]))) continue;
      const l = { x: v.pos.x + o[0] + 0.5, y: v.pos.y + o[1] - 0.6, z: v.pos.z + o[2] + 0.5 };
      particle(v.dim, "minecraft:basic_flame_particle", l);
      particle(v.dim, "minecraft:mobflame_single", { ...l, y: l.y - 0.6 });
      if (v.ticks % 4 === 0) particle(v.dim, "minecraft:large_explosion", { ...l, y: l.y - 1.5 });
      if (v.grounded || v.pos.y - v.launchY < 8) particle(v.dim, "minecraft:huge_explosion_emitter", { ...l, y: l.y - 2 });
    } else {
      const [fx, fz] = HEADINGS[v.heading];
      particle(v.dim, "minecraft:basic_smoke_particle", { x: v.pos.x + o[0] + 0.5 - fx, y: v.pos.y + o[1] + 0.5, z: v.pos.z + o[2] + 0.5 - fz });
    }
  }
  if (v.ticks % 10 === 0) ridersDo(v, (p) => sound(p, v.kind === "rocket" ? "mob.blaze.shoot" : "mob.ghast.fireball", v.kind === "rocket" ? 0.5 : 1.4, 0.5));
}

function hud(v) {
  if (v.ticks % 4) return;
  const alt = v.pos.y, fuelPct = v.infinite ? "∞" : `${Math.round((v.fuel / Math.max(1, v.st.fuelCap)) * 100)}%`;
  const bar = (t) => "§a" + "|".repeat(Math.round(t * 10)) + "§8" + "|".repeat(10 - Math.round(t * 10));
  const line = v.kind === "rocket"
    ? `§6ALT §f${alt}  §6V §f${v.vy >= 0 ? "+" : ""}${v.vy.toFixed(1)}  §6THR ${bar(v.throttle)}  §6FUEL §f${fuelPct}${v.top ? "  §b§lSPACE" : ""}`
    : `§6ALT §f${alt}  §6SPD §f${v.speed.toFixed(1)}  §6HDG §f${CARD4[v.heading].toUpperCase()}  §6THR ${bar(v.throttle)}  §6FUEL §f${fuelPct}${v.stalled && !v.grounded ? "  §c§lSTALL" : ""}`;
  ridersDo(v, (p) => p.onScreenDisplay.setActionBar(line));
}

function tickFlight(v) {
  v.ticks++;
  inputs(v);
  if (!flights.has(v.id)) return;
  if (v.countdown > 0) {
    v.countdown--;
    if (v.countdown % 20 === 0) {
      const n = v.countdown / 20;
      ridersDo(v, (p) => {
        sound(p, n ? "note.pling" : "random.explode", n ? 1 : 0.6, 1);
        p.onScreenDisplay.setTitle?.(n ? `§c${n}` : "§6§lLIFTOFF!", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 5 });
      });
      if (!n) v.throttle = 1;
    }
  }
  setLit(v, v.throttle > 0 && (v.fuel > 0 || v.infinite));
  if (v.fuel <= 0 && !v.infinite && v.throttle > 0 && !v.outOfFuel) {
    v.outOfFuel = true;
    tell(v, v.st.chutes ? "§eOut of fuel! Parachutes deployed." : "§cOut of fuel!");
  }
  const vel = physics(v, DT, { lookY: v.look ?? 0 });
  for (let i = 0; i < 3; i++) v.acc[i] += vel[i] * DT;
  const mv = takeWhole(v.acc);
  if (mv.some(Boolean) && !move(v, mv, vel)) return;
  v.peak = Math.max(v.peak, v.pos.y);
  for (const [id, seat] of v.riders) {
    const p = playerById(id);
    try {
      p?.teleport(seatLoc(v, seat), { dimension: v.dim, keepVelocity: false });
    } catch {}
  }
  effects(v);
  hud(v);
  // Parked: on the ground, engines off, nobody flying it.
  const thrusting = v.throttle > 0 && (v.fuel > 0 || v.infinite);
  if (!v.grounded) v.flew = true;
  const resting = v.grounded && !thrusting && Math.abs(v.speed) < 0.5 && v.countdown <= 0;
  if (resting && (!v.pilot || v.riders.size === 0 || (v.kind === "rocket" && v.flew))) {
    if (v.flew) tell(v, `§aTouchdown!§r §7Peak altitude ${v.peak}.`);
    end(v);
  }
  else if (!v.pilot && v.throttle > 0 && v.kind === "plane") v.throttle = Math.max(0, v.throttle - 0.01); // nobody flying: engines spool down
  else if (!v.pilot && v.kind === "rocket") v.throttle = 0;
}

system.runInterval(() => {
  for (const v of [...flights.values()]) {
    try {
      tickFlight(v);
    } catch (e) {
      console.warn(`[MegaCraft] flight ${v.id}: ${e}`);
      flights.delete(v.id);
    }
  }
}, 1);

// Breaking a block of a flying vehicle removes it from the vehicle (so it isn't rebuilt next move).
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  const hit = flightAt(block.dimension, block.location);
  if (!hit) return;
  const [v, i] = hit;
  const seats = [...v.riders];
  v.cells.splice(i, 1);
  v.riders = new Map(seats.filter(([, s]) => s !== i).map(([id, s]) => [id, s > i ? s - 1 : s]));
  reindex(v);
  v.st = stats(v.cells.map((c) => c.perm.type.id));
});

// ---------------------------------------------------------------------------
// Flight Stick panel
// ---------------------------------------------------------------------------
export const riding = (p) => [...flights.values()].find((v) => v.riders.has(p.id));

export async function flightPanel(p) {
  const v = riding(p);
  if (!v) return p.onScreenDisplay.setActionBar("§7Sit in a Cockpit and take off first.");
  const pilot = v.pilot === p.id;
  const opts = [];
  if (pilot) {
    for (const t of [1, 0.75, 0.5, 0.25]) opts.push([`Throttle ${t * 100}%`, () => { v.throttle = t; if (v.countdown > 0) v.countdown = 0; }]);
    opts.push(["§cCut Engines", () => (v.throttle = 0)]);
  }
  opts.push(["§eBail Out (parachute)", () => eject(v, p, true)]);
  const s = v.st;
  const body = [
    `§l${v.kind === "rocket" ? "Rocket" : "Plane"}§r  ${s.blocks} blocks, mass ${s.mass}`,
    v.kind === "rocket" ? `Thrust ${s.thrust} (${(s.thrust / s.mass).toFixed(2)}× weight)` : `Push ${s.push}, lift ${s.lift}`,
    `Altitude ${v.pos.y} (peak ${v.peak}), fuel ${v.infinite ? "unlimited" : `${Math.round(v.fuel)}/${s.fuelCap}`}`,
    pilot ? "§7Jump = throttle up, Sneak = throttle down. Hold Sneak on the ground with engines off to get out." : "§7You're a passenger.",
  ].join("\n");
  const f = new ActionFormData().title("§lFlight Panel").body(body);
  for (const [l] of opts) f.button(l);
  const r = await show(f, p);
  if (r.canceled || !flights.has(v.id)) return;
  opts[r.selection][1]();
}
