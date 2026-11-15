// Pure geometry for the Mega Wand and Mega Table blueprints. Unit-tested (tools/test.mjs).
// Offsets are [x, y, z] with y up; blueprints point their nose north (-z) before rotation.
import { rotOff, CARD4 } from "./vehicle.js";

export const SHAPES = [
  ["box", "Solid Box"], ["shell", "Hollow Box"], ["cyl", "Solid Cylinder"], ["tube", "Tube (open ends, for fuselages)"],
  ["sphere", "Hollow Ellipsoid"], ["cone", "Hollow Cone (nose cone)"], ["wing", "Wing (flat, tapered)"],
];
export const MAX_SPAN = 48, MAX_CELLS = 6000;

/** Longest axis of a size vector (ties prefer y, then z). */
export function longAxis(s) {
  // if two sides match and the third differs (e.g. 9×5×9 or 5×30×5), the odd one out is the axis
  if (s[0] === s[2] && s[1] !== s[0]) return 1;
  if (s[0] === s[1] && s[2] !== s[0]) return 2;
  if (s[1] === s[2] && s[0] !== s[1]) return 0;
  return s[1] >= s[0] && s[1] >= s[2] ? 1 : s[2] >= s[0] ? 2 : 0;
}

const inEllipse = (u, v, w, h) => {
  const a = w / 2, b = h / 2, du = u + 0.5 - a, dv = v + 0.5 - b;
  return (du * du) / (a * a) + (dv * dv) / (b * b) <= 1.0001;
};

/**
 * Cells of `kind` filling a box of `size` (all offsets in 0..size-1).
 * `tip` (cone/wing) chooses which end of the long axis is narrow: +1 = high end, -1 = low end.
 */
export function shapeCells(kind, size, tip = 1) {
  const [sx, sy, sz] = size;
  const ax = longAxis(size), [ua, va] = [0, 1, 2].filter((i) => i !== ax);
  const L = size[ax];
  const inside = (p) => {
    if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= sx || p[1] >= sy || p[2] >= sz) return false;
    switch (kind) {
      case "box": case "shell": return true;
      case "cyl": case "tube": return inEllipse(p[ua], p[va], size[ua], size[va]);
      case "sphere": {
        let d = 0;
        for (let i = 0; i < 3; i++) { const a = size[i] / 2, t = (p[i] + 0.5 - a) / a; d += t * t; }
        return d <= 1.0001;
      }
      case "cone": {
        const t = tip > 0 ? p[ax] / L : (L - 1 - p[ax]) / L; // 0 at the wide end
        const k = Math.max(0, 1 - t);
        const w = Math.max(1, size[ua] * k), h = Math.max(1, size[va] * k);
        const du = p[ua] + 0.5 - size[ua] / 2, dv = p[va] + 0.5 - size[va] / 2;
        return (du * du) / ((w / 2) ** 2) + (dv * dv) / ((h / 2) ** 2) <= 1.0001;
      }
      case "wing": {
        // flat: thinnest axis is thickness; taper the chord toward the tip of the long axis
        const thin = [0, 1, 2].reduce((m, i) => (size[i] < size[m] ? i : m), 0);
        const chordAx = [0, 1, 2].find((i) => i !== ax && i !== thin) ?? ua;
        const t = tip > 0 ? p[ax] / L : (L - 1 - p[ax]) / L;
        const chord = Math.max(1, Math.round(size[chordAx] * (1 - 0.6 * t)));
        return p[chordAx] < chord;
      }
    }
    return false;
  };
  const hollow = kind === "shell" || kind === "tube" || kind === "sphere" || kind === "cone";
  const nbrs = kind === "tube" ? [ua, va] : [0, 1, 2];
  const out = [];
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    const p = [x, y, z];
    if (!inside(p)) continue;
    if (hollow) {
      let edge = false;
      for (const i of nbrs) for (const d of [-1, 1]) { const q = [...p]; q[i] += d; if (!inside(q)) edge = true; }
      if (kind === "tube" && (size[ua] <= 2 || size[va] <= 2)) edge = true;
      if (!edge) continue;
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blueprints. Each cell: [x, y, z, part, states?]. Parts are MegaCraft block names without namespace.
// ---------------------------------------------------------------------------
const disk = (r) => {
  const out = [];
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + r * 0.8) out.push([x, z]);
  return out;
};
const ringOf = (r) => {
  const d = new Set(disk(r).map(([x, z]) => `${x},${z}`));
  return disk(r).filter(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !d.has(`${x + a},${z + b}`)));
};

function put(map, x, y, z, part, states) {
  map.set(`${x},${y},${z}`, [x, y, z, part, states]);
}
const NOSE = { "minecraft:cardinal_direction": "north" };

/** A vertical rocket: engines at y=0, hollow body, cockpit near the top, nose cone, parachutes. */
export function rocket({ r, h, color = "white", stripe = "red", boosters = 0 }) {
  const m = new Map();
  const ring = ringOf(r), body = h - r - 2;
  for (const [x, z] of disk(r)) put(m, x, 0, z, "rocket_engine");
  for (let y = 1; y < body; y++) for (const [x, z] of ring) put(m, x, y, z, `hull_${y % 8 === 4 || y % 8 === 5 ? stripe : color}`);
  // centre column: core, fuel, cockpit
  put(m, 0, 1, 0, "vehicle_core");
  const cockY = body - 2;
  for (let y = 2; y < cockY; y++) put(m, 0, y, 0, "fuel_tank");
  put(m, 0, cockY, 0, "cockpit", NOSE);
  for (const [x, z] of ring) if (Math.abs(x) + Math.abs(z) <= r + 1 && (x === 0 || z === 0)) put(m, x, cockY + 1, z, "window");
  // nose cone
  // nose: an open ring over the pilot's head, then solid tapering discs
  for (const [x, z] of ring) put(m, x, body, z, `hull_${color}`);
  for (let k = 1; k <= r; k++) for (const [x, z] of disk(r - k + 1)) put(m, x, body + k, z, `hull_${k === r ? stripe : color}`);
  put(m, 0, body + r + 1, 0, "parachute_pod");
  put(m, 0, body + r + 2, 0, "mega_light");
  // strap-on boosters
  const spots = [[r + 2, 0], [-(r + 2), 0], [0, r + 2], [0, -(r + 2)]].slice(0, boosters);
  for (const [bx, bz] of spots) {
    const bh = Math.round(body * 0.6);
    put(m, bx, 0, bz, "rocket_engine");
    for (let y = 1; y < bh; y++) put(m, bx, y, bz, y < bh - 1 ? "fuel_tank" : `hull_${stripe}`);
    put(m, bx, bh, bz, `hull_${color}`);
    // strut to the body
    const sx = Math.sign(bx), sz = Math.sign(bz);
    for (let k = 1; k < 2; k++) put(m, bx - sx * k, Math.round(bh / 2), bz - sz * k, `hull_${color}`);
  }
  return [...m.values()];
}

/** A plane pointing north (-z). Fuselage along z, wings along x. */
export function plane({ len, fr, span, chord, jets, color = "white", stripe = "blue" }) {
  const m = new Map();
  const ring = ringOf(fr);
  // fuselage tube along z, nose at z=0
  for (let z = 2; z < len; z++) for (const [x, y] of ring) put(m, x, y, z, `hull_${z % 6 === 0 ? stripe : color}`);
  for (const [x, y] of disk(Math.max(0, fr - 1))) put(m, x, y, 1, `hull_${color}`);
  put(m, 0, 0, 0, `hull_${stripe}`);
  for (const [x, y] of disk(fr)) put(m, x, y, len, `hull_${color}`); // tail cap
  // inside: cockpit near the nose with a canopy, then core and fuel
  put(m, 0, 0, 2, "cockpit", NOSE);
  put(m, 0, fr, 2, "window"); put(m, 0, fr, 3, "window");
  if (fr > 1) { put(m, 1, fr - 1, 2, "window"); put(m, -1, fr - 1, 2, "window"); }
  put(m, 0, 0, 4, "vehicle_core");
  for (let z = 5; z < len - 1; z++) put(m, 0, 0, z, "fuel_tank");
  // keel: ties the centre column (cockpit, core, tanks) to the bottom of a wide fuselage
  for (let z = 2; z < len; z++) for (let y = -fr + 1; y < 0; y++) put(m, 0, y, z, `hull_${color}`);
  // main wings at the middle, y=0
  const wz = Math.floor(len * 0.4);
  const half = Math.floor(span / 2);
  const lead = new Map(); // |x| -> leading-edge z of the wing
  for (let x = fr + 1; x <= half; x++) {
    const t = (x - fr - 1) / Math.max(1, half - fr - 1);
    const c = Math.max(1, Math.round(chord * (1 - 0.5 * t)));
    lead.set(x, wz + Math.round(t * 2));
    for (let k = 0; k < c; k++) { put(m, x, 0, lead.get(x) + k, "wing"); put(m, -x, 0, lead.get(x) + k, "wing"); }
  }
  // jets hang under the wings
  for (let i = 0; i < jets; i++) {
    const ax = Math.min(half, fr + 2 + Math.floor(i / 2) * 3);
    put(m, ax * (i % 2 ? -1 : 1), -1, lead.get(ax), "jet_engine", NOSE);
  }
  // tail: fin + stabilisers
  const fh = fr + 3;
  for (let y = fr + 1; y < fh; y++) for (let z = len - 2 - (fh - y) + 1; z <= len; z++) put(m, 0, y, z, `hull_${stripe}`);
  const st = Math.max(2, Math.floor(half / 3));
  for (let x = fr + 1; x <= fr + st; x++) for (const z of [len - 1, len]) { put(m, x, 0, z, "wing"); put(m, -x, 0, z, "wing"); }
  // landing gear
  put(m, 0, -fr - 1, 3, "landing_gear");
  put(m, fr + 1, -1, lead.get(fr + 1) + 1, "landing_gear"); put(m, -fr - 1, -1, lead.get(fr + 1) + 1, "landing_gear");
  if (fr > 1) for (const [x, y, z] of [...m.values()]) if (y === -fr && Math.abs(x) <= 0 && z > 3 && z % 8 === 0) put(m, x, y - 1, z, "landing_gear");
  // keep the pilot's head space clear (open canopy on thin fuselages), windscreen in front
  for (let y = 1; y <= 2; y++) m.delete(`0,${y},2`);
  put(m, 0, 1, 1, "window");
  // shift so the lowest block is at y=0
  const cells = [...m.values()];
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y, z, p, s]) => [x, y - minY, z, p, s]);
}

export const BLUEPRINTS = [
  { id: "hopper", name: "Hopper Rocket", desc: "A small test rocket, 14 blocks tall.", build: () => rocket({ r: 1, h: 14 }) },
  { id: "titan", name: "Titan Rocket", desc: "A big orbital rocket, 34 blocks tall, with 2 boosters.", build: () => rocket({ r: 2, h: 34, boosters: 2, stripe: "black" }) },
  { id: "saturn", name: "Saturn Mega Rocket", desc: "A colossal moon rocket, 56 blocks tall, with 4 boosters.", build: () => rocket({ r: 4, h: 56, boosters: 4, color: "white", stripe: "black" }) },
  { id: "prop", name: "Prop Plane", desc: "A small plane, 12 long with a 15 block wingspan.", build: () => plane({ len: 12, fr: 1, span: 15, chord: 3, jets: 2, stripe: "red" }) },
  { id: "jet", name: "Fighter Jet", desc: "A fast grey jet, 18 long.", build: () => plane({ len: 18, fr: 1, span: 17, chord: 5, jets: 4, color: "grey", stripe: "black" }) },
  { id: "jumbo", name: "Jumbo Jet", desc: "A giant airliner, 40 long with a 45 block wingspan.", build: () => plane({ len: 40, fr: 3, span: 45, chord: 6, jets: 8, stripe: "blue" }) },
];

/** Rotate blueprint cells to face `dir` (north/east/south/west) and count the parts needed. */
export function orient(cells, dir) {
  const t = Math.max(0, CARD4.indexOf(dir));
  return cells.map(([x, y, z, p, s]) => {
    const [rx, ry, rz] = rotOff([x, y, z], t);
    const st = s ? { "minecraft:cardinal_direction": CARD4[(CARD4.indexOf(s["minecraft:cardinal_direction"]) + t) % 4] } : undefined;
    return [rx, ry, rz, p, st];
  });
}
export function bill(cells) {
  const n = new Map();
  for (const c of cells) n.set(c[3], (n.get(c[3]) ?? 0) + 1);
  return n;
}
