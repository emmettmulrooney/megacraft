// Builds the Minecraft Marketplace (Bedrock) add-on submission package for MegaCraft (FREE).
// Output: dist/marketplace/MegaCraft/{Content,Store Art,Marketing Art,Store Listing.txt}
//         dist/MegaCraft - Marketplace Submission.zip
//         dist/MegaCraft.mcaddon (for testing on your own device)
// Usage: node tools/build.js && node tools/make_marketplace.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Img, decode, hex, mix } = require("./lib/png.js");

const ROOT = path.join(__dirname, "..");
const NAME = "MegaCraft";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "marketplace", NAME);
const BP = path.join(ROOT, `${NAME} BP`);
const RP = path.join(ROOT, `${NAME} RP`);

fs.rmSync(path.join(DIST, "marketplace"), { recursive: true, force: true });
const bpOut = path.join(OUT, "Content", "behavior_packs", "MegaCraft_BP");
const rpOut = path.join(OUT, "Content", "resource_packs", "MegaCraft_RP");
fs.cpSync(BP, bpOut, { recursive: true });
fs.cpSync(RP, rpOut, { recursive: true });
for (const dir of [bpOut, rpOut]) {
  const mf = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (mf.header.name !== "pack.name" || mf.header.description !== "pack.description") throw new Error(`${dir}: manifest must use pack.name / pack.description`);
  if (!fs.readFileSync(path.join(dir, "texts", "en_US.lang"), "utf8").includes("pack.name=")) throw new Error(`${dir}: missing pack.name`);
}

// ---------- art ----------
const tex = (rel) => decode(path.join(RP, "textures", rel));
const T = (n) => tex(`blocks/megacraft_${n}.png`);

/** Draw a voxel vehicle (side view) from blueprint-ish columns of textures. */
function drawBlocks(im, cells, x0, y0, s) {
  for (const [cx, cy, t] of cells) im.paste(t, Math.round(x0 + cx * s), Math.round(y0 - (cy + 1) * s), s / 16);
}

function keyArt(w, h) {
  const im = new Img(w, h);
  const top = hex("#071030"), mid = hex("#1d4f9c"), bot = hex("#8cc6ff");
  for (let y = 0; y < h; y++) { const t = y / h; const c = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, bot, (t - 0.55) / 0.45); for (let x = 0; x < w; x++) im.set(x, y, c); }
  let s = 11;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 120; i++) { const x = rnd() * w, y = rnd() * h * 0.45; im.rect(x, y, Math.max(1, w / 900), Math.max(1, w / 900), hex("#ffffff", 120 + Math.floor(rnd() * 135))); }
  // ground
  const gy = Math.round(h * 0.86);
  im.rect(0, gy, w, h - gy, hex("#3d7a35")).rect(0, gy, w, Math.max(2, h / 120), hex("#5aa64b"));
  const bs = Math.max(8, Math.floor(h / 30 / 2) * 2); // block size in px (multiple of 2 so 16px textures scale cleanly)
  const f = bs / 16;
  const sz = Math.max(1, Math.round(f)) * 16;
  // giant rocket on the right, mid-launch
  const R = [];
  const W = T("hull_white"), K = T("hull_black"), RD = T("hull_red"), WI = T("window"), EN = T("rocket_side_on");
  const rx = 0, rows = 22;
  for (let y = 0; y < rows; y++) for (let x = -2; x <= 2; x++) R.push([x, y, y === 0 ? EN : y % 7 === 3 ? K : x === 0 && y === rows - 4 ? WI : W]);
  for (let k = 0; k < 3; k++) for (let x = -2 + k; x <= 2 - k; x++) R.push([x, rows + k, k === 2 ? RD : W]);
  for (const bx of [-4, 4]) { for (let y = 0; y < 10; y++) R.push([bx, y, y === 0 ? EN : W]); R.push([bx, 10, RD]); }
  const scale = Math.max(1, Math.round(f));
  const rpx = Math.round(w * 0.76), rpy = Math.round(gy - h * 0.18);
  for (const [cx, cy, t] of R) im.paste(t, rpx + cx * sz, rpy - (cy + 1) * sz, scale);
  // exhaust plume + smoke
  for (let i = 0; i < 260; i++) {
    const t = rnd(), x = rpx + (rnd() - 0.5) * sz * 5 * (0.4 + t * 2.2), y = rpy + t * (gy - rpy + h * 0.02);
    const r = sz * (0.3 + t * 1.2) * (0.5 + rnd() * 0.5);
    const c = t < 0.35 ? mix(hex("#fff6b0"), hex("#ff9a1f"), t / 0.35) : mix(hex("#ff7a1a"), hex("#e8e8e8"), Math.min(1, (t - 0.35) * 2.5));
    for (let a = -r; a <= r; a += 2) for (let b = -r; b <= r; b += 2) if (a * a + b * b <= r * r) im.rect(x + a, y + b, 2, 2, [c[0], c[1], c[2], t < 0.35 ? 255 : 200]);
  }
  for (const bx of [-4, 4]) for (let i = 0; i < 40; i++) { const t = rnd(); im.rect(rpx + bx * sz + sz / 2 + (rnd() - 0.5) * sz * 2, rpy + t * sz * 4, sz / 2, sz / 2, mix(hex("#fff6b0"), hex("#ff7a1a"), t)); }
  // jumbo jet on the left, flying
  const J = [];
  const G = T("hull_white"), B = T("hull_blue"), WG = T("wing_edge"), JE = T("jet_side"), CK = T("cockpit_side");
  for (let x = 0; x < 26; x++) for (let y = 0; y < 3; y++) J.push([x, y, x % 6 === 0 && y === 1 ? B : y === 2 && x > 1 && x < 23 && x % 2 ? WI : G]);
  J.push([26, 1, G]); J.push([-1, 1, G]); J.push([0, 2, CK]); J.push([1, 2, CK]);
  for (let y = 3; y < 7; y++) for (let x = 22 - (y - 3); x < 26; x++) J.push([x, y, B]);
  for (let x = 9; x < 16; x++) J.push([x, -1, WG]);
  J.push([10, -2, JE]); J.push([11, -2, JE]); J.push([14, -2, JE]);
  const jpx = Math.round(w * 0.06), jpy = Math.round(h * 0.42);
  const js = Math.max(1, Math.round(f * 0.75));
  for (const [cx, cy, t] of J) im.paste(t, jpx + (25 - cx) * js * 16, jpy - (cy + 1) * js * 16, js);
  for (let i = 0; i < 60; i++) im.rect(jpx + 26 * js * 16 + i * js * 6, jpy - js * 16 * 1.5 + (rnd() - 0.5) * js * 6, js * 5, js * 5, hex("#ffffff", 150 - i * 2));
  // logo: "MEGACRAFT" in blocky letters
  const FONT = {
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], E: ["####", "#...", "###.", "#...", "####"], G: [".###", "#...", "#.##", "#..#", ".###"],
    A: [".##.", "#..#", "####", "#..#", "#..#"], C: [".###", "#...", "#...", "#...", ".###"], R: ["###.", "#..#", "###.", "#.#.", "#..#"],
    F: ["####", "#...", "###.", "#...", "#..."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  };
  const word = "MEGACRAFT";
  const px = Math.max(4, Math.floor(w / 110));
  const widths = [...word].map((ch) => FONT[ch][0].length);
  const total = widths.reduce((a, b) => a + b + 1, -1) * px;
  let lx = Math.round(w * 0.34 - total / 2);
  const ly = Math.round(h * 0.62);
  for (const ch of word) {
    const g = FONT[ch];
    g.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== "#") return;
      im.rect(lx + x * px + px * 0.3, ly + y * px + px * 0.3, px, px, hex("#000000", 140));
      im.rect(lx + x * px, ly + y * px, px, px, y < 2 ? hex("#ffd23a") : hex("#ff9a1f"));
    }));
    lx += (g[0].length + 1) * px;
  }
  // FREE ribbon
  const rw = Math.round(w * 0.16), rh = Math.round(h * 0.09);
  im.rect(w - rw - Math.round(w * 0.03), Math.round(h * 0.05), rw, rh, hex("#1c7a3c")).border(w - rw - Math.round(w * 0.03), Math.round(h * 0.05), rw, rh, hex("#4fe07a"));
  const FREE = ["###.##..###.###", "#...#.#.#...#..", "##..##..##..##.", "#...#.#.#...#..", "#...#.#.###.###"];
  const pf = Math.floor(rh / 8);
  const fw = FREE[0].length * pf;
  im.paste(new Img(FREE[0].length, 5).art(0, 0, FREE.map((r) => r.replace(/\./g, " ")), { "#": hex("#ffffff") }), w - rw - Math.round(w * 0.03) + Math.round((rw - fw) / 2), Math.round(h * 0.05 + (rh - 5 * pf) / 2), pf);
  return im;
}
void drawBlocks;
const storeArt = path.join(OUT, "Store Art"), mkt = path.join(OUT, "Marketing Art");
keyArt(800, 450).save(path.join(storeArt, `${NAME}_Thumbnail_0.png`));
keyArt(1920, 1080).save(path.join(mkt, `${NAME}_MarketingKeyArt.png`));
fs.copyFileSync(path.join(RP, "pack_icon.png"), path.join(storeArt, `${NAME}_packicon_0.png`));

// ---------- listing ----------
fs.writeFileSync(path.join(OUT, "Store Listing.txt"), `Title: ${NAME}
Type: Add-On (Bedrock)
Price: FREE (0 Minecoins)
Min engine version: 1.21.50
Experimental toggles required: none (stable Script API: @minecraft/server 1.16.0, @minecraft/server-ui 1.3.0)
Multiplayer: yes

Short description:
Build giant rockets and planes, then fly them. Countdowns, liftoff, real thrust and lift, passengers, parachutes, and spectacular crashes.

Long description:
MegaCraft is miniCraft's big brother: engineering at a giant scale, and it's free.

THE MEGA TABLE
- A heavy engineering bench made from iron and a crafting table.
- Makes hull plating 32 at a time in 8 colours, Mega Windows, Rocket Engines, Jet Engines, Wing Panels, Fuel Tanks, Cockpits, Vehicle Cores, Landing Gear, Parachute Pods, and Mega Lights.
- Blueprints build a complete vehicle in seconds: Hopper Rocket, Titan Rocket, the 56-block-tall Saturn Mega Rocket, Prop Plane, Fighter Jet, and a 40-block Jumbo Jet.

BUILD ANYTHING THAT FLIES
- Any shape works. A vehicle is every MegaCraft block connected to its Vehicle Core, up to 2048 blocks.
- The Vehicle Core shows mass, thrust, lift, and fuel, and tells you exactly what's missing.
- The Mega Wand fills giant shapes in one go: boxes, cylinders, fuselage tubes, nose cones, ellipsoids, and tapered wings up to 48 blocks across.

ROCKETS
- 3, 2, 1, LIFTOFF! Flames, smoke, and a roaring launch.
- Real thrust-to-weight: too heavy and it won't leave the pad. Throttle with Jump and Sneak.
- Climb all the way to the edge of space, then parachute back down.

PLANES
- Taxi, throttle up, and pull up to take off. Look left and right to bank the whole plane around.
- Slow down too much and you stall. Landing gear lets you land harder.

CREW AND SAFETY
- Extra cockpits are passenger seats for your friends.
- The Flight Stick panel sets the throttle, cuts the engines, or bails you out with a parachute.
- Fuel burns as you fly. Refill tanks with Fuel Cans. Creative mode has unlimited fuel.
- Hit something too fast and your vehicle explodes.

Everything is craftable in Survival and in the Creative inventory.

Keywords: rocket, plane, jet, airplane, space, flying, vehicle, giant, mega, big, build, launch, engineering, free
`);

// ---------- zips ----------
const zip = path.join(DIST, `${NAME} - Marketplace Submission.zip`);
fs.rmSync(zip, { force: true });
execSync(`cd "${path.dirname(OUT)}" && zip -qrX "${zip}" "${NAME}" -x "*.DS_Store"`);
const addon = path.join(DIST, `${NAME}.mcaddon`);
fs.rmSync(addon, { force: true });
execSync(`cd "${ROOT}" && zip -qrX "${addon}" "${NAME} BP" "${NAME} RP" -x "*.DS_Store"`);
console.log("Marketplace package:", OUT, "\nZip:", zip, "\nTest add-on:", addon);
