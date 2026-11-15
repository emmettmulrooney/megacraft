// Pure vehicle maths for MegaCraft: scanning, part stats, flight physics, rotation. Unit-tested (tools/test.mjs).
export const NS = "megacraft";

/** mass in "blocks"; thrust lifts that much mass; push drives planes; lift holds planes up; fuel in units. */
export const HULLS = ["white", "grey", "black", "red", "orange", "yellow", "blue", "green"];
export const PARTS = {
  ...Object.fromEntries(HULLS.map((c) => [`hull_${c}`, { mass: 1 }])),
  window: { mass: 1 },
  rocket_engine: { mass: 4, thrust: 100 },
  jet_engine: { mass: 3, push: 60 },
  wing: { mass: 1, lift: 12 },
  fuel_tank: { mass: 2, fuel: 120 },
  cockpit: { mass: 2, seat: true },
  vehicle_core: { mass: 2, core: true },
  landing_gear: { mass: 1, gear: true },
  parachute_pod: { mass: 1, chute: true },
  mega_light: { mass: 1 },
};
export const MAX_BLOCKS = 2048;
export const TANK_LEVELS = 4, PER_LEVEL = 30; // a full tank = 120 fuel
export const USED = `${NS}:used`; // fuel tank state: 0 = full, 4 = empty

/** Only MegaCraft parts are structural, so a vehicle never grabs terrain, houses, or launch pads. */
export function partOf(id) {
  if (!id || !id.startsWith(`${NS}:`)) return null;
  return PARTS[id.slice(NS.length + 1)] ?? null;
}

/** Spread `fuel` back over n tanks (rounding up per tank). Returns the `used` state for each. */
export function tankStates(fuel, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = Math.max(0, Math.min(TANK_LEVELS * PER_LEVEL, fuel));
    fuel -= f;
    out.push(TANK_LEVELS - Math.ceil(f / PER_LEVEL));
  }
  return out;
}

const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Flood-fill vehicle parts from `start` (the core). getType(x,y,z) -> typeId | undefined. */
export function scan(getType, start, max = MAX_BLOCKS) {
  const k = (x, y, z) => `${x},${y},${z}`;
  const seen = new Set([k(...start)]);
  const cells = [];
  const stack = [[...start, getType(...start)]];
  let overflow = false;
  while (stack.length) {
    const [x, y, z, id] = stack.pop();
    cells.push([x, y, z, id]);
    for (const [dx, dy, dz] of D6) {
      const n = [x + dx, y + dy, z + dz];
      const kk = k(...n);
      if (seen.has(kk)) continue;
      seen.add(kk);
      const nid = getType(...n);
      if (!partOf(nid)) continue;
      if (cells.length + stack.length >= max) { overflow = true; continue; }
      stack.push([...n, nid]);
    }
  }
  return { cells, overflow };
}

export function stats(ids) {
  const s = { blocks: 0, mass: 0, thrust: 0, push: 0, lift: 0, fuelCap: 0, seats: 0, cores: 0, gear: 0, chutes: 0, rockets: 0, jets: 0, wings: 0 };
  for (const id of ids) {
    const p = partOf(id);
    if (!p) continue;
    s.blocks++;
    s.mass += p.mass;
    if (p.thrust) { s.thrust += p.thrust; s.rockets++; }
    if (p.push) { s.push += p.push; s.jets++; }
    if (p.lift) { s.lift += p.lift; s.wings++; }
    s.fuelCap += p.fuel ?? 0;
    if (p.seat) s.seats++;
    if (p.core) s.cores++;
    if (p.gear) s.gear++;
    if (p.chute) s.chutes++;
  }
  s.kind = s.rockets ? "rocket" : s.jets ? "plane" : "none";
  return s;
}

export const ROCKET_TWR = 1.2; // thrust must beat weight by 20%
export const PLANE_PUSH = 0.25;

export function problems(s) {
  const out = [];
  if (s.cores !== 1) out.push(s.cores ? "Only one Vehicle Core per vehicle." : "No Vehicle Core.");
  if (!s.seats) out.push("Add a Cockpit block so someone can fly it.");
  if (!s.fuelCap) out.push("Add at least one Fuel Tank.");
  if (s.kind === "none") out.push("Add Rocket Engines (for a rocket) or Jet Engines (for a plane).");
  if (s.kind === "rocket" && s.thrust < s.mass * ROCKET_TWR) out.push(`Too heavy to lift off: thrust ${s.thrust}, needs ${Math.ceil(s.mass * ROCKET_TWR)}. Add Rocket Engines or remove blocks.`);
  if (s.kind === "plane" && s.lift < s.mass) out.push(`Not enough wing: lift ${s.lift}, needs ${s.mass}. Add Wings.`);
  if (s.kind === "plane" && s.push < s.mass * PLANE_PUSH) out.push(`Engines too weak: push ${s.push}, needs ${Math.ceil(s.mass * PLANE_PUSH)}. Add Jet Engines.`);
  return out;
}

// ---------------------------------------------------------------------------
// Flight physics (blocks, seconds)
// ---------------------------------------------------------------------------
export const G = 10;
export const ROCKET_MAX = 30, TERMINAL = 40, CHUTE_FALL = 5;
export const PLANE_MAX = 28, STALL = 9, SINK = 4, BURN = 1;
export const HEADINGS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export const CARD4 = ["north", "east", "south", "west"];

/** Bedrock yaw: 0 = south, 90 = west, ±180 = north, -90 = east. Returns heading index (N=0,E=1,S=2,W=3). */
export function headingFromYaw(yaw) {
  const i = Math.round((((yaw % 360) + 360) % 360) / 90) % 4;
  return [2, 3, 0, 1][i];
}

/** Top speed for a vehicle of this many blocks, so huge builds don't flood the world with block updates. */
export const speedCap = (blocks, max) => Math.max(10, Math.min(max, 15000 / Math.max(1, blocks)));

/** Advance one physics step. Mutates v (vy, speed, fuel). Returns world velocity [vx, vy, vz] in blocks/s. */
export function physics(v, dt, input = {}) {
  const s = v.st;
  const th = v.fuel > 0 || v.infinite ? v.throttle : 0;
  if (v.kind === "rocket") {
    const a = th > 0 ? G * ((s.thrust * th) / s.mass - 1) : -G;
    v.vy += a * dt;
    v.vy = Math.max(-(s.chutes ? CHUTE_FALL : TERMINAL), Math.min(speedCap(s.blocks, ROCKET_MAX), v.vy));
    if (!v.infinite) v.fuel = Math.max(0, v.fuel - s.rockets * th * dt * BURN);
    v.stalled = false;
    return [0, v.vy, 0];
  }
  const top = Math.min(speedCap(s.blocks, PLANE_MAX), 6 + (PLANE_MAX - 6) * Math.min(1, s.push / (s.mass * 0.6)));
  const target = top * th;
  const rate = (target > v.speed ? 5 : 3) * dt;
  v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), rate);
  if (!v.infinite) v.fuel = Math.max(0, v.fuel - s.jets * th * dt * BURN);
  v.stalled = v.speed < STALL || s.lift < s.mass;
  const climb = Math.max(-0.6, Math.min(0.6, input.lookY ?? 0));
  v.vy = v.stalled ? -(s.chutes ? Math.min(SINK, CHUTE_FALL) : SINK) : climb * v.speed;
  const [fx, fz] = HEADINGS[v.heading];
  return [fx * v.speed, v.vy, fz * v.speed];
}

/** Is hitting something at `impact` blocks/s a crash? */
export function isCrash(impact, s) {
  if (s.chutes && s.kind === "rocket") return impact > CHUTE_FALL + 1;
  return impact > (s.gear ? 16 : 11);
}
export const crashPower = (s) => Math.min(8, 2 + s.blocks / 150);

/** Split accumulated movement into whole blocks. Mutates acc. */
export function takeWhole(acc) {
  const mv = acc.map((a) => Math.trunc(a));
  for (let i = 0; i < 3; i++) acc[i] -= mv[i];
  return mv;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
/** Rotate an offset clockwise (seen from above) by t quarter turns around the origin. */
export function rotOff([x, y, z], t) {
  t = ((t % 4) + 4) % 4;
  for (let i = 0; i < t; i++) [x, z] = [-z, x];
  return [x + 0, y, z + 0];
}

/** Rotate direction block states clockwise by t quarter turns. */
export function rotStates(st, t) {
  t = ((t % 4) + 4) % 4;
  if (!t) return st;
  const o = { ...st };
  const turn = (d) => CARD4[(CARD4.indexOf(d) + t) % 4];
  for (const k of ["minecraft:cardinal_direction", "minecraft:facing_direction"]) if (CARD4.includes(o[k])) o[k] = turn(o[k]);
  if (typeof o.facing_direction === "number" && o.facing_direction >= 2) {
    const m = { 2: "north", 3: "south", 4: "west", 5: "east" }, r = { north: 2, south: 3, west: 4, east: 5 };
    o.facing_direction = r[turn(m[o.facing_direction])];
  }
  if (typeof o.direction === "number") o.direction = (o.direction + t) % 4; // 0 S, 1 W, 2 N, 3 E (clockwise)
  if (typeof o.weirdo_direction === "number") {
    const m = ["east", "west", "south", "north"];
    o.weirdo_direction = m.indexOf(turn(m[o.weirdo_direction]));
  }
  return o;
}

export const okey = (o) => `${o[0]},${o[1]},${o[2]}`;

/** Offsets on the leading face when moving along `axis` (0,1,2) in direction `sign`. */
export function frontCells(offsets, set, axis, sign) {
  return offsets.filter((o) => {
    const n = [...o];
    n[axis] += sign;
    return !set.has(okey(n));
  });
}

export function bbox(offsets) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of offsets) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o[i]); hi[i] = Math.max(hi[i], o[i]); }
  return { lo, hi };
}
