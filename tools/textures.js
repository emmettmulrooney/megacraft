// Procedural pixel art for MegaCraft (16x16 blocks/items, 128x128 pack icon).
const path = require("path");
const { Img, hex, mix } = require("./lib/png.js");

const C = {
  k: hex("#101216"), d: hex("#2a2f36"), g: hex("#4b535e"), m: hex("#7f8994"), l: hex("#bcc4cc"), w: hex("#eef1f4"),
  r: hex("#a3160f"), R: hex("#ff4a2a"), o: hex("#ff9a1f"), y: hex("#ffd23a"), Y: hex("#fff6b0"),
  b: hex("#1f5fc4"), B: hex("#8fd3ff"), c: hex("#2a9ad6"), e: hex("#2c8a3c"), E: hex("#58e07a"),
  n: hex("#5a3b22"), N: hex("#8a5f3a"),
};
const HULL = {
  white: hex("#e9ecef"), grey: hex("#8e969e"), black: hex("#2b2f35"), red: hex("#c8302a"),
  orange: hex("#ec7a1c"), yellow: hex("#f0c419"), blue: hex("#2b63c9"), green: hex("#3f9b45"),
};
const HULL_COLORS = Object.keys(HULL);
const ART = (rows) => rows.map((r) => r.replace(/\./g, " "));

const TERRAIN = [];
const ITEM_TEX = [];

/** Riveted plate: the base of most textures. */
function plate(col, seed) {
  const dark = mix(col, C.k, 0.28), lite = mix(col, C.w, 0.25);
  const im = new Img(16, 16).rect(0, 0, 16, 16, col);
  im.rect(0, 0, 16, 1, lite).rect(0, 0, 1, 16, lite).rect(0, 15, 16, 1, dark).rect(15, 0, 1, 16, dark);
  im.rect(0, 7, 16, 1, dark).rect(0, 8, 16, 1, lite);
  for (const [x, y] of [[2, 2], [13, 2], [2, 5], [13, 5], [2, 10], [13, 10], [2, 13], [13, 13]]) { im.set(x, y, dark); im.set(x + 1, y + 1, lite); }
  return im.noise(3, seed);
}

function makeTextures(RP, BP) {
  const T = (n) => { TERRAIN.includes(n) || TERRAIN.push(n); return path.join(RP, "textures", "blocks", `megacraft_${n}.png`); };
  const I = (n) => { ITEM_TEX.includes(n) || ITEM_TEX.push(n); return path.join(RP, "textures", "items", `megacraft_${n}.png`); };

  // --- Mega Table: a steel workbench with a blueprint on top ---
  {
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    top.rect(2, 2, 12, 12, hex("#1d4f8f")).border(2, 2, 12, 12, C.B);
    top.art(4, 3, ART([".....#..", "....###.", "....###.", "....###.", "...#####", "....###.", "...##.##", "...#...#"]), { "#": C.w }); // rocket sketch
    top.rect(3, 12, 4, 1, C.B);
    top.noise(3, 1).save(T("table_top"));
    const side = plate(C.m, 2);
    side.rect(4, 9, 8, 5, C.d).border(4, 9, 8, 5, C.k); side.rect(6, 11, 4, 1, C.y);
    side.rect(0, 0, 16, 3, C.g).rect(0, 3, 16, 1, C.k);
    side.save(T("table_side"));
    new Img(16, 16).rect(0, 0, 16, 16, C.d).border(0, 0, 16, 16, C.k).noise(3, 3).save(T("table_bottom"));
  }

  // --- Hulls ---
  HULL_COLORS.forEach((c, i) => plate(HULL[c], 10 + i).save(T(`hull_${c}`)));

  // --- Window ---
  {
    const im = new Img(16, 16).rect(0, 0, 16, 16, C.m).border(0, 0, 16, 16, C.d);
    im.rect(2, 2, 12, 12, hex("#9fd8ff", 110));
    im.rect(3, 3, 2, 5, hex("#ffffff", 200)); im.rect(5, 3, 1, 2, hex("#ffffff", 160));
    im.save(T("window"));
  }
  // --- Mega light ---
  new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k).rect(2, 2, 12, 12, C.y).rect(4, 4, 8, 8, C.Y).rect(6, 6, 4, 4, C.w).save(T("mega_light"));

  // --- Vehicle core ---
  {
    const side = plate(C.d, 20);
    side.rect(4, 3, 8, 10, C.k).border(4, 3, 8, 10, C.c);
    side.rect(6, 5, 4, 6, hex("#0d2a3a")); side.set(7, 6, C.E); side.set(8, 7, C.E); side.set(7, 8, C.R); side.set(8, 9, C.B);
    side.save(T("core_side"));
    const top = plate(C.d, 21);
    top.rect(5, 5, 6, 6, C.c).rect(6, 6, 4, 4, C.B).rect(7, 7, 2, 2, C.w);
    top.save(T("core_top"));
  }

  // --- Rocket engine ---
  for (const on of [false, true]) {
    const side = plate(C.l, 30);
    side.rect(0, 10, 16, 6, C.g); for (let x = 1; x < 16; x += 3) side.rect(x, 11, 1, 4, C.d);
    if (on) side.rect(0, 15, 16, 1, C.o);
    side.save(T(on ? "rocket_side_on" : "rocket_side"));
    const noz = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    noz.rect(2, 2, 12, 12, C.d).rect(4, 4, 8, 8, on ? C.o : C.k).rect(6, 6, 4, 4, on ? C.Y : hex("#050505"));
    noz.noise(2, 31).save(T(on ? "rocket_nozzle_on" : "rocket_nozzle"));
  }
  plate(C.l, 32).rect(6, 6, 4, 4, C.g).save(T("rocket_top"));

  // --- Jet engine ---
  {
    const intake = new Img(16, 16).rect(0, 0, 16, 16, C.m).border(0, 0, 16, 16, C.d);
    intake.rect(2, 2, 12, 12, C.k);
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; for (let r = 1; r < 6; r++) intake.set(8 + Math.cos(t + r * 0.25) * r, 8 + Math.sin(t + r * 0.25) * r, C.l); }
    intake.rect(7, 7, 2, 2, C.w);
    intake.save(T("jet_intake"));
    for (const on of [false, true]) {
      const ex = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
      ex.rect(3, 3, 10, 10, C.d).rect(5, 5, 6, 6, on ? C.o : C.k).rect(7, 7, 2, 2, on ? C.Y : C.k);
      ex.noise(2, 41).save(T(on ? "jet_exhaust_on" : "jet_exhaust"));
    }
    const side = plate(C.m, 42);
    side.rect(0, 3, 16, 1, C.d).rect(0, 12, 16, 1, C.d).rect(11, 4, 1, 8, C.r);
    side.save(T("jet_side"));
  }

  // --- Wing panel ---
  {
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.l);
    for (let x = 0; x < 16; x += 4) top.rect(x, 0, 1, 16, C.m);
    top.rect(0, 0, 16, 1, C.w).rect(0, 15, 16, 1, C.m);
    top.noise(2, 50).save(T("wing_top"));
    new Img(16, 16).rect(0, 0, 16, 16, C.m).rect(0, 0, 16, 1, C.l).noise(2, 51).save(T("wing_bottom"));
    new Img(16, 16).rect(0, 0, 16, 16, C.l).rect(0, 7, 16, 2, C.m).rect(0, 0, 16, 1, C.w).rect(0, 15, 16, 1, C.d).noise(2, 52).save(T("wing_edge"));
  }

  // --- Cockpit ---
  {
    const front = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m);
    front.rect(1, 1, 14, 8, C.k).rect(2, 2, 12, 6, hex("#5fb4ff")).rect(3, 3, 3, 2, C.w).rect(7, 2, 1, 6, C.k);
    front.rect(2, 10, 12, 5, C.d); front.set(4, 12, C.E); front.set(6, 12, C.R); front.set(8, 12, C.y); front.rect(10, 11, 3, 3, C.c);
    front.save(T("cockpit_front"));
    const side = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m).rect(3, 2, 10, 6, hex("#5fb4ff")).border(3, 2, 10, 6, C.k);
    side.rect(4, 3, 2, 2, C.w).rect(2, 11, 12, 2, C.r);
    side.save(T("cockpit_side"));
    plate(C.l, 61).save(T("cockpit_back"));
    const top = new Img(16, 16).rect(0, 0, 16, 16, C.l).border(0, 0, 16, 16, C.m);
    top.rect(3, 3, 10, 10, hex("#7a2b20")).rect(4, 4, 8, 8, hex("#a23b2a")).rect(5, 10, 6, 2, C.k); // seat
    top.save(T("cockpit_top"));
    plate(C.g, 63).save(T("cockpit_bottom"));
  }

  // --- Fuel tank: gauge with 4 bars ---
  for (let used = 0; used <= 4; used++) {
    const im = plate(hex("#d9dde1"), 70);
    im.rect(0, 2, 16, 2, C.r).rect(0, 12, 16, 2, C.r);
    im.rect(5, 4, 6, 8, C.k);
    for (let b = 0; b < 4; b++) im.rect(6, 10 - b * 2, 4, 1, b < 4 - used ? (4 - used <= 1 ? C.R : C.E) : C.d);
    im.save(T(`tank_${used}`));
  }
  plate(hex("#d9dde1"), 71).rect(5, 5, 6, 6, C.g).rect(6, 6, 4, 4, C.y).save(T("tank_top"));

  // --- Landing gear ---
  {
    const side = new Img(16, 16).rect(0, 0, 16, 16, C.g).border(0, 0, 16, 16, C.k);
    side.rect(7, 0, 2, 9, C.l).rect(3, 8, 10, 8, C.k).rect(5, 10, 6, 4, C.d).rect(7, 11, 2, 2, C.m);
    side.save(T("gear_side"));
    plate(C.g, 81).save(T("gear_top"));
    new Img(16, 16).rect(0, 0, 16, 16, C.k).rect(3, 2, 10, 12, hex("#1b1b1b")).rect(3, 7, 10, 2, C.d).save(T("gear_bottom"));
  }
  // --- Parachute pod ---
  {
    const side = plate(C.o, 90);
    side.rect(3, 3, 10, 10, C.w).art(4, 4, ART(["..####..", ".######.", "########", "#.#..#.#", "..#..#..", "...##...", "...##...", "........"]), { "#": C.r });
    side.save(T("chute_side"));
    plate(C.o, 91).rect(6, 6, 4, 4, C.w).save(T("chute_top"));
  }

  // --- Items ---
  const items = {
    fuel_can: [
      "................", ".....kkkk.......", ".....kyyk.......", "...kkkkkkkkk....", "..krrrrrrrrrk...", "..krRRRRRRRrk...",
      "..krRkkkkkRrk...", "..krRkyyykRrk...", "..krRkyyykRrk...", "..krRkkkkkRrk...", "..krRRRRRRRrk...", "..krrrrrrrrrk...",
      "..krrrrrrrrrk...", "...kkkkkkkkk....", "................", "................",
    ],
    mega_wand: [
      "................", "...........yY...", "..........yYYy..", "...........yY.y.", "..........kk....", ".........kNk....",
      "........kNk.....", ".......kNk......", "......kNk.......", ".....kNk........", "....kNk.........", "...kNk..........",
      "..kNk...........", "..kk............", "................", "................",
    ],
    flight_stick: [
      "................", "......kkkk......", ".....kRRRRk.....", ".....kRkkRk.....", ".....kRRRRk.....", "......kddk......",
      "......kddk......", "......kddk......", "......kddk......", ".......dd.......", "....kkkkkkkk....", "...kddddddddk...",
      "...kdmmEEmmdk...", "...kddddddddk...", "....kkkkkkkk....", "................",
    ],
  };
  for (const [id, rows] of Object.entries(items)) new Img(16, 16).art(0, 0, ART(rows), C).save(I(id));

  // --- Pack icon: a giant rocket lifting off past a plane ---
  {
    const im = new Img(32, 32);
    for (let y = 0; y < 32; y++) { const c = mix(hex("#0b1640"), hex("#3f86d8"), y / 32); for (let x = 0; x < 32; x++) im.set(x, y, c); }
    for (const [x, y] of [[3, 3], [26, 5], [9, 8], [29, 13], [5, 15]]) im.set(x, y, C.w);
    // rocket
    im.art(11, 1, ART([
      ".....rr.....", "....rwwr....", "...rwwwwr...", "...wwwwww...", "...wwBBww...", "...wwBBww...", "...wwwwww...", "...rrrrrr...",
      "...wwwwww...", "...wwwwww...", "...kkkkkk...", "...wwwwww...", "..rwwwwwwr..", ".rrwwwwwwrr.", ".rr.gggg.rr.", "....gggg....",
      "....oooo....", "...oYYYYo...", "...oYwwYo...", "..ooYYYYoo..", "...ooYYoo...", "....oooo....",
    ]), { r: C.r, w: C.w, B: C.c, k: C.k, g: C.g, o: C.o, Y: C.Y });
    // smoke clouds
    for (const [x, y, r] of [[8, 29, 4], [16, 30, 5], [24, 29, 4], [3, 31, 3], [29, 31, 3]]) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) im.set(x + a, y + b, mix(C.l, C.w, ((a + b + 8) % 3) / 3));
    // plane
    im.art(22, 17, ART(["...m.....", "..mmm....", "mmlllllll", "..mmm....", "...m....."]), { m: C.g, l: C.l });
    const big = im.scaled(4);
    big.save(path.join(RP, "pack_icon.png"));
    big.save(path.join(BP, "pack_icon.png"));
  }
}

module.exports = { makeTextures, TERRAIN, ITEM_TEX, HULL_COLORS };
