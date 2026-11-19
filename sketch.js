/* ──────────────────────────────────────────────────────────────
   The Kneading Room · page 1 · sketch.js
   A hand-drawn front door, drawn live with p5.js (global mode).

   p5 in one breath:
     setup()  runs once   → make the canvas, create the cats, paper grain
     draw()   runs every frame → repaint the whole picture

   The "drawn by hand" look comes from three tricks:
     1. every shape is a list of points that get nudged by a smooth wobble
     2. the colour wash is drawn a hair off the ink outline
     3. a faint second pencil pass sits behind the ink, and the wobble
        re-rolls ~6x a second so the lines gently "boil"
   ────────────────────────────────────────────────────────────── */

// Add ?fixed to the URL to see the working version (see STRUGGLE_BUS.md).
const FIXED = new URLSearchParams(location.search).has('fixed');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const M = REDUCED ? 0 : 1;                       // motion multiplier

const INK = '#4A2F29';
const C = {
  paper: '#F6E4C8', wall: '#F8DFC3', motif: '#E8C39A', floor: '#F0D3A9',
  wood: '#C98F6B', sage: '#A9C4A1', sageDeep: '#8DB387', sageDark: '#97B58F',
  rose: '#E8A39B', teal: '#CFE6E3', tealDeep: '#9CC3C0', mustard: '#F2C14E',
  sand: '#F4D9B8', cream: '#FFF9F1', terracotta: '#E7A66B'
};

// The scene is designed on a 1280×800 "virtual" page and scaled to fit.
// (0,0) in scene units is the middle of the door where it meets the floor.
let S = 1, cx = 0, floorY = 0;

let boilT = 0, shapeId = 0;     // wobble state
let grain;                      // paper-grain image, built once per window size
let cats = [], hearts = [], drops = [];
let canvasEl;
const pointer = { x: -999, y: -999, lx: -999, ly: -999, overUI: false };

// The OPEN/CLOSED sign
const sign = { state: 'closed', flipStart: 0, flipEnd: 0, openAmt: 0, announced: false };
const FLIP_MS = REDUCED ? 1 : 1300;

/* ───────────── setup / resize ───────────── */
function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  canvasEl = cnv.elt;

  // Put the canvas inside <div id="stage"> so the CSS can pin it behind the UI.
  if (FIXED) cnv.parent('stage');

  frameRate(30);
  buildGrain();

  cats = [
    { name: 'Mochi',   fur: '#F4E3C3', patch: '#E3C08F', light: '#FFF6E6', stripe: null,      slot: -1, phase: 0.4 },
    { name: 'Biscuit', fur: '#F0A55C', patch: null,      light: '#FBDDB5', stripe: '#C9702F', slot: 0,  phase: 2.2 },
    { name: 'Soot',    fur: '#A9AFC0', patch: null,      light: '#E8EAF0', stripe: null,      slot: 1,  phase: 4.1 }
  ].map(c => ({ ...c, earIn: '#F2B8B0', x: 0, y: 135, size: 1, hover: 0, bounce: 0, happyUntil: 0 }));

  for (let i = 0; i < 40; i++) drops.push({ x: random(), y: random(), v: random(0.6, 1.2) });

  watchPointer();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildGrain();
}

// Paper grain: a transparent layer of tiny brown speckles, drawn over everything.
function buildGrain() {
  if (grain) grain.remove();
  grain = createGraphics(width, height);
  grain.pixelDensity(1);
  grain.loadPixels();
  for (let i = 0; i < grain.pixels.length; i += 4) {
    const on = Math.random() < 0.2;
    grain.pixels[i] = 92; grain.pixels[i + 1] = 61; grain.pixels[i + 2] = 41;
    grain.pixels[i + 3] = on ? 8 + Math.random() * 28 : 0;
  }
  grain.updatePixels();
}

/* ───────────── draw ───────────── */
function draw() {
  const t = millis() / 1000;
  shapeId = 0;                                              // keeps each shape's wobble stable between frames
  boilT = REDUCED ? 0 : floor(millis() / 170) * 0.8;        // jumps ~6x/second = hand-drawn "boil"

  layout();
  updateSign();
  updateCats();

  background(C.paper);
  drawWallAndFloor();

  push();
  translate(cx, floorY);
  scale(S);
  drawWindow(t);
  drawShelf(t);
  drawDoor(t);
  drawLightSpill();
  drawMat();
  cats.forEach(c => drawCat(c, t));
  drawHearts();
  pop();

  drawPaperFinish();
}

function layout() {
  S = constrain(min(height / 800, max(width / 1280, 0.55)), 0.5, 1.5);
  cx = width / 2;
  floorY = height * 0.6;

  const spread = min(300, width / S / 2 - 90);
  cats.forEach(c => { c.x = c.slot * spread; c.size = width < 600 ? 0.85 : 1; });
}

/* ───────────── hand-drawn toolkit ───────────── */

// A smooth, cheap "wobble": gently shifts a point depending on where it is.
function wobble(x, y, seed, amp) {
  const a = seed + boilT;
  const dx = sin(x * 0.031 + y * 0.017 + a) + 0.5 * sin(x * 0.071 - y * 0.053 + a * 1.7);
  const dy = cos(x * 0.023 - y * 0.037 + a * 1.3) + 0.5 * cos(x * 0.059 + y * 0.061 + a * 0.8);
  return [dx * amp * 0.65, dy * amp * 0.65];
}

/* ink(path, fillColour, options)
   path        list of [x, y] points
   fillColour  watercolour wash (null = no fill)
   options     line:false (wash only) · open:true (a line, not a closed shape)
               w (ink width) · amp (wobble) · col (ink colour) · inkAlpha */
function ink(path, fillCol, o = {}) {
  const seed = (shapeId++ % 997) * 0.37;
  const amp = o.amp ?? 1.8;
  const w = o.w ?? 2.6;
  const alpha = o.inkAlpha ?? 255;
  const shift = (pts, s, a) => pts.map(([x, y]) => { const [dx, dy] = wobble(x, y, s, a); return [x + dx, y + dy]; });
  const pts = shift(path, seed, amp);

  // 1. colour wash, sitting slightly off the outline
  if (fillCol && !o.open) {
    noStroke();
    fill(fillCol);
    beginShape();
    pts.forEach(([x, y]) => vertex(x + 1.6, y + 1.2));
    endShape(CLOSE);
  }
  if (o.line === false) return;

  // 2. faint second pencil pass behind the ink
  const inkCol = color(o.col || INK);
  const pts2 = shift(path, seed + 5, amp * 1.25);
  noFill();
  strokeJoin(ROUND); strokeCap(ROUND);
  inkCol.setAlpha(alpha * 0.3);
  stroke(inkCol);
  strokeWeight(w);
  push(); translate(1.7, 1.3);
  beginShape(); pts2.forEach(([x, y]) => vertex(x, y)); endShape(o.open ? undefined : CLOSE);
  pop();

  // 3. the ink line
  inkCol.setAlpha(alpha);
  stroke(inkCol);
  strokeWeight(w);
  beginShape(); pts.forEach(([x, y]) => vertex(x, y)); endShape(o.open ? undefined : CLOSE);
  noStroke();
}

// Path builders (they only make lists of points; ink() draws them)
function subdivide(pts, seg, closed) {
  const out = [], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const k = max(1, ceil(dist(a[0], a[1], b[0], b[1]) / seg));
    for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
function polyPath(pts, seg = 14) { return subdivide(pts, seg, true); }
function linePath(pts, seg = 16) { return subdivide(pts, seg, false); }

function ellipsePath(x, y, w, h, n = 28, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (TWO_PI * i) / n;
    const px = cos(a) * w / 2, py = sin(a) * h / 2;
    pts.push([x + px * cos(rot) - py * sin(rot), y + px * sin(rot) + py * cos(rot)]);
  }
  return pts;
}

function rrectPath(x, y, w, h, r = 10) {
  r = min(r, w / 2, h / 2);
  const pts = [];
  const corner = (ccx, ccy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (HALF_PI * i) / 4; pts.push([ccx + cos(a) * r, ccy + sin(a) * r]); } };
  corner(x + w - r, y + r, -HALF_PI);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, HALF_PI);
  corner(x + r, y + r, PI);
  return subdivide(pts, 14, true);
}

// An arch: bottom-centre (x, y), width w, straight sides h tall, then a round top.
function archPath(x, y, w, h) {
  const r = w / 2, pts = [[x - r, y], [x - r, y - h]];
  for (let i = 1; i < 14; i++) { const a = PI + (PI * i) / 14; pts.push([x + cos(a) * r, y - h + sin(a) * r]); }
  pts.push([x + r, y - h], [x + r, y]);
  return subdivide(pts, 16, true);
}

function bez(p0, c1, c2, p3, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([bezierPoint(p0[0], c1[0], c2[0], p3[0], t), bezierPoint(p0[1], c1[1], c2[1], p3[1], t)]);
  }
  return out;
}

// Limit drawing to a path (used to keep clouds and rain inside the glass)
function clipTo(path) {
  const ctx = drawingContext;
  ctx.beginPath();
  path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
}

/* ───────────── wall, floor, paper ───────────── */
function drawWallAndFloor() {
  noStroke();
  fill(C.wall);
  rect(-20, -20, width + 40, floorY + 20);

  // soft watercolour blotches: warm light by the window, rose wash in the corner
  fill(255, 233, 168, 70);  ellipse(cx - 400 * S, floorY - 200 * S, 540 * S, 500 * S);
  fill(244, 201, 181, 90);  ellipse(cx + 440 * S, floorY - 400 * S, 500 * S, 250 * S);

  // little wallpaper doodles
  stroke(C.motif);
  strokeWeight(2.2 * S);
  noFill();
  const step = 96 * S;
  let row = 0;
  for (let y = 26 * S; y < floorY - 20 * S; y += step, row++) {
    for (let x = (row % 2 ? 72 : 24) * S; x < width; x += 2 * step) {
      circle(x, y, 8 * S);
      line(x, y - 10 * S, x, y - 14 * S); line(x, y + 10 * S, x, y + 14 * S);
      line(x - 10 * S, y, x - 14 * S, y); line(x + 10 * S, y, x + 14 * S, y);
    }
  }
  noStroke();

  // floor
  fill(C.floor);
  rect(-20, floorY, width + 40, height - floorY + 20);
  ink(linePath([[-20, floorY], [width + 20, floorY]], 30), null, { open: true, w: 3, inkAlpha: 110 });
  const rows = 4, rh = (height - floorY) / rows;
  for (let r = 1; r < rows; r++) {
    ink(linePath([[-20, floorY + r * rh], [width + 20, floorY + r * rh]], 30), null, { open: true, w: 1.8, inkAlpha: 50 });
  }
}

function drawPaperFinish() {
  image(grain, 0, 0, width, height);
  const ctx = drawingContext;
  ctx.save();
  const g = ctx.createRadialGradient(width / 2, height * 0.48, min(width, height) * 0.4, width / 2, height * 0.48, max(width, height) * 0.75);
  g.addColorStop(0, 'rgba(138, 90, 60, 0)');
  g.addColorStop(1, 'rgba(138, 90, 60, 0.24)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/* ───────────── window (left) ───────────── */
function drawWindow(t) {
  const wx = -400, base = -62, w = 230, h = 170;
  const glass = archPath(wx, base, w, h);

  ink(archPath(wx, base + 10, w + 28, h + 8), C.wood);          // wooden frame
  ink(glass, C.teal);

  push();                                                       // clouds drift inside the glass
  clipTo(glass);
  noStroke();
  fill(255, 255, 255, 190);
  const drift = (t * 6 * M) % 300;
  [[-60, -300], [60, -240]].forEach(([ox, oy], i) => {
    const x = wx + ox + ((drift + i * 140) % 300) - 150;
    ellipse(x, oy, 90, 32); ellipse(x + 24, oy - 14, 56, 34); ellipse(x - 26, oy - 6, 50, 26);
  });
  pop();

  ink([[wx, base], [wx, base - h - w / 2]], null, { open: true, w: 3 });                 // cross bars
  ink([[wx - w / 2, base - 110], [wx + w / 2, base - 110]], null, { open: true, w: 3 });

  // curtains (left mirrors right)
  [-1, 1].forEach(s => {
    const pts = [
      ...bez([wx + s * 144, -345], [wx + s * 114, -323], [wx + s * 96, -258], [wx + s * 104, -178]),
      ...bez([wx + s * 104, -178], [wx + s * 108, -138], [wx + s * 88, -84], [wx + s * 82, -36]),
      [wx + s * 148, -36]
    ];
    ink(polyPath(pts, 12), C.rose);
    ink(ellipsePath(wx + s * 101, -172, 26, 15, 14), C.sand, { w: 2 });                     // tie-back
  });

  // sill and a little plant
  ink(rrectPath(wx - 142, base + 2, 284, 24, 8), C.wood);
  ink(polyPath([[wx - 64, base + 2], [wx - 52, base - 32], [wx - 20, base - 32], [wx - 8, base + 2]]), C.terracotta, { w: 2.2 });
  const sway = sin(t * 1.2) * 0.05 * M;
  [[-0.5, 0], [0.4, 0], [0, -6]].forEach(([r, dy], i) => {
    ink(ellipsePath(wx - 36 + r * 20, base - 56 + dy, 18, 46, 16, r + sway), i === 2 ? C.sageDeep : C.sage, { w: 2.2 });
  });
}

/* ───────────── shelf (right) ───────────── */
function drawShelf(t) {
  const x0 = 330, y1 = -320, y2 = -190;

  ink(rrectPath(x0, y1, 240, 16, 6), C.wood);                               // top board
  ink(polyPath([[x0 + 20, y1 + 16], [x0 + 20, y1 + 40], [x0 + 44, y1 + 16]]), C.wood, { w: 2 });
  ink(polyPath([[x0 + 220, y1 + 16], [x0 + 220, y1 + 40], [x0 + 196, y1 + 16]]), C.wood, { w: 2 });

  // pot + plant
  ink(polyPath([[x0 + 24, y1], [x0 + 32, y1 - 42], [x0 + 72, y1 - 42], [x0 + 80, y1]]), C.rose, { w: 2.2 });
  ink(ellipsePath(x0 + 36, y1 - 76, 18, 50, 16, -0.5), C.sage, { w: 2.2 });
  ink(ellipsePath(x0 + 68, y1 - 76, 18, 50, 16, 0.5), C.sageDeep, { w: 2.2 });
  ink(ellipsePath(x0 + 52, y1 - 84, 18, 56, 16, 0), C.sage, { w: 2.2 });

  // books
  ink(rrectPath(x0 + 128, y1 - 28, 84, 28, 4), C.mustard, { w: 2.2 });
  ink(rrectPath(x0 + 134, y1 - 54, 72, 26, 4), C.rose, { w: 2.2 });
  ink(rrectPath(x0 + 130, y1 - 78, 76, 24, 4), C.tealDeep, { w: 2.2 });

  // lower shelf with a steaming mug
  ink(rrectPath(x0 + 60, y2, 180, 16, 6), C.wood);
  ink(ellipsePath(x0 + 188, y2 - 26, 22, 26, 14), C.sand, { w: 2.2 });                     // handle
  ink(rrectPath(x0 + 128, y2 - 46, 52, 46, 12), C.tealDeep, { w: 2.4 });                   // mug
  for (let i = 0; i < 2; i++) {
    const pts = [];
    for (let k = 0; k <= 8; k++) pts.push([x0 + 144 + i * 20 + sin(t * 2 * M + k * 0.9 + i) * 5, y2 - 54 - k * 7]);
    ink(pts, null, { open: true, w: 2, inkAlpha: 90, amp: 0.6 });
  }
}

/* ───────────── the door and its sign ───────────── */
function drawDoor(t) {
  // soft glow behind the door once it's open
  if (sign.openAmt > 0) {
    push();
    noStroke();
    const g = drawingContext.createRadialGradient(0, -200, 40, 0, -200, 330);
    g.addColorStop(0, `rgba(255, 233, 168, ${0.55 * sign.openAmt})`);
    g.addColorStop(1, 'rgba(255, 233, 168, 0)');
    drawingContext.fillStyle = g;
    drawingContext.fillRect(-340, -540, 680, 680);
    pop();
  }

  ink(archPath(0, 0, 272, 300), C.wood);                  // frame
  ink(archPath(0, 0, 224, 296), C.sage);                  // door panel

  // glass: dull and rainy at first, warm and golden once the sign says OPEN
  const glass = archPath(0, -178, 142, 92);
  const glassCol = lerpColor(color('#BCD1D6'), color('#FFE9A8'), sign.openAmt);
  ink(glass, glassCol);
  push();
  clipTo(glass);
  stroke(255, 255, 255, 170 * (1 - sign.openAmt));
  strokeWeight(2);
  drops.forEach(d => {
    const f = (d.y + (millis() / 1000) * d.v * 0.6 * M) % 1;
    const px = -70 + d.x * 140 + f * 14, py = -340 + f * 170;
    line(px, py, px - 3, py - 12);
  });
  noStroke();
  fill(255, 250, 220, 160 * sign.openAmt);
  ellipse(0, -270, 100, 100);
  pop();
  ink([[0, -178], [0, -340]], null, { open: true, w: 2.6 });
  ink([[-71, -250], [71, -250]], null, { open: true, w: 2.6 });

  ink(rrectPath(-92, -52, 184, 34, 8), C.sageDark, { w: 2.2 });            // kick plate
  ink(ellipsePath(84, -112, 18, 18, 12), C.mustard, { w: 2.2 });           // door knob

  drawSign(t);
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2);
}

function updateSign() {
  const now = millis();
  if (sign.state === 'flipping' && now >= sign.flipEnd) {
    sign.state = 'open';
    if (!sign.announced) { sign.announced = true; window.dispatchEvent(new Event('sign-opened')); }
  }
  if (sign.state === 'open') {
    sign.openAmt = REDUCED ? 1 : constrain((now - sign.flipEnd) / 1500, 0, 1);
  }
}

function drawSign(t) {
  const prog = sign.state === 'closed' ? 0
    : sign.state === 'open' ? 1
    : constrain((millis() - sign.flipStart) / FLIP_MS, 0, 1);

  const theta = PI * easeOutBack(prog);              // 0 = CLOSED facing us, PI = OPEN facing us
  const c = cos(theta);
  const side = c >= 0 ? 'closed' : 'open';
  const flipping = sign.state === 'flipping';
  const swing = (sin(t * 2.2) * 0.022 + (flipping ? sin(prog * PI * 3) * 0.06 : 0)) * M;
  const lift = flipping ? -10 * sin(prog * PI) : 0;

  ink(ellipsePath(0, -200, 11, 11, 10), C.mustard, { w: 2 });          // hook

  push();
  translate(0, -200);
  rotate(swing);                                     // the whole sign swings from its hook
  translate(0, 68 + lift);
  scale(max(abs(c), 0.03), 1);                       // squashing sideways = turning around

  ink([[0, -68], [-34, -27]], null, { open: true, w: 2 });
  ink([[0, -68], [34, -27]], null, { open: true, w: 2 });
  ink(rrectPath(-64, -27, 128, 54, 14), side === 'open' ? C.cream : C.sand);

  noStroke();
  fill(side === 'open' ? '#4F7D4B' : '#A5554F');
  textFont('Gaegu');
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  textSize(side === 'open' ? 38 : 32);
  text(side === 'open' ? 'OPEN' : 'CLOSED', 0, 1);
  pop();
}

function drawLightSpill() {
  if (sign.openAmt <= 0) return;
  noStroke();
  fill(255, 233, 168, 80 * sign.openAmt);
  beginShape();
  vertex(-110, 0); vertex(110, 0); vertex(210, 200); vertex(-210, 200);
  endShape(CLOSE);
}

function drawMat() {
  ink(rrectPath(-112, 12, 224, 40, 10), '#F4C9B5');
  push();
  drawingContext.setLineDash([6, 7]);
  noFill(); stroke(74, 47, 41, 110); strokeWeight(2);
  rect(-98, 21, 196, 22, 8);
  drawingContext.setLineDash([]);
  pop();
}

/* ───────────── the cats ───────────── */
function updateCats() {
  cats.forEach(c => {
    const near = !pointer.overUI && dist(pointer.lx, pointer.ly, c.x, c.y - 72) < 72 * c.size;
    c.isNear = near;
    c.hover += ((near ? 1 : 0) - c.hover) * 0.2;
    c.bounce *= 0.92;
  });
}

function arcPath(x, y, r, a0, a1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([x + cos(a) * r, y + sin(a) * r]); }
  return pts;
}

function drawCat(c, t) {
  const now = millis() / 1000;
  const happy = c.hover > 0.5 || now < c.happyUntil;
  const hop = 14 * c.bounce * abs(sin(t * 16)) * M;
  const k = c.size * (1 + 0.04 * c.hover);

  push();
  translate(c.x, c.y - hop);
  scale(k);

  noStroke(); fill(107, 74, 62, 36);
  ellipse(0, 4, 150, 16);                                           // shadow

  ink(ellipsePath(84, -40, 30, 70, 16, 0.35 + sin(t * 1.7 + c.phase) * 0.18 * M), c.fur);   // tail

  const perk = c.hover * 6;                                         // ears
  [-1, 1].forEach(s => {
    ink(polyPath([[s * 74, -92], [s * 62, -150 - perk], [s * 22, -110]], 12), c.fur, { amp: 1.1 });
    ink(polyPath([[s * 62, -104], [s * 58, -134 - perk], [s * 40, -112]], 12), c.earIn, { line: false });
  });

  ink(ellipsePath(0, -58, 160, 118, 34), c.fur);                    // body (the head is part of it)
  if (c.patch) {
    ink(ellipsePath(-38, -88, 56, 40, 18, -0.3), c.patch, { line: false });
    ink(ellipsePath(52, -50, 38, 30, 14), c.patch, { line: false });
  }
  ink(ellipsePath(0, -30, 100, 54, 22), c.light, { line: false });  // belly
  if (c.stripe) {
    [[0, -116, 0, -102], [-14, -114, -12, -102], [14, -114, 12, -102]].forEach(([a, b, d, e]) =>
      ink([[a, b], [d, e]], null, { open: true, w: 3, col: c.stripe, amp: 0.6 }));
    [[-74, -70, -60, -66], [-74, -56, -60, -54], [74, -70, 60, -66], [74, -56, 60, -54]].forEach(([a, b, d, e]) =>
      ink([[a, b], [d, e]], null, { open: true, w: 3, col: c.stripe, amp: 0.6 }));
  }

  [-1, 1].forEach(s => {                                            // paws
    ink(ellipsePath(s * 30, -9, 38, 22, 14), c.light);
    ink([[s * 30 - 5, -13], [s * 30 - 5, -4]], null, { open: true, w: 1.6, inkAlpha: 150, amp: 0.4 });
    ink([[s * 30 + 5, -13], [s * 30 + 5, -4]], null, { open: true, w: 1.6, inkAlpha: 150, amp: 0.4 });
  });

  // eyes follow the pointer a little
  const lx = constrain((pointer.lx - c.x) * 0.03, -3, 3);
  const ly = constrain((pointer.ly - (c.y - 72)) * 0.03, -2, 3);
  const blink = ((t + c.phase) % 4.8) < 0.14;
  [-1, 1].forEach(s => {
    const ex = s * 36, ey = -72;
    if (happy) ink(arcPath(ex, ey + 4, 7, PI, TWO_PI), null, { open: true, w: 3, amp: 0.4 });   // ^ ^
    else if (blink) ink(arcPath(ex, ey - 2, 7, 0, PI), null, { open: true, w: 3, amp: 0.4 });    // ‿ ‿
    else {
      noStroke(); fill(INK); ellipse(ex + lx, ey + ly, 9, 12);
      fill(255); ellipse(ex + lx + 1.6, ey + ly - 3, 3.4, 3.4);
    }
  });

  noStroke(); fill(240, 140, 140, 110);
  ellipse(-56, -58, 22, 12); ellipse(56, -58, 22, 12);              // blush
  ink(polyPath([[-5, -63], [5, -63], [0, -56]], 6), '#E58F94', { w: 1.6, amp: 0.4 });          // nose
  ink(linePath([[0, -56], [0, -51]], 6), null, { open: true, w: 1.8, amp: 0.3 });
  ink(arcPath(-5, -51, 5, 0, PI, 6), null, { open: true, w: 1.8, amp: 0.3 });
  ink(arcPath(5, -51, 5, 0, PI, 6), null, { open: true, w: 1.8, amp: 0.3 });
  [-1, 1].forEach(s => {                                            // whiskers
    ink([[s * 62, -63], [s * 94, -69]], null, { open: true, w: 1.6, inkAlpha: 150, amp: 0.8 });
    ink([[s * 62, -56], [s * 94, -54]], null, { open: true, w: 1.6, inkAlpha: 150, amp: 0.8 });
  });

  pop();
}

/* ───────────── hearts ───────────── */
function burst(c, n) {
  for (let i = 0; i < n; i++) {
    hearts.push({ x: c.x + random(-30, 30), y: c.y - 150, vx: random(-0.6, 0.6), vy: random(-1.8, -0.9), life: 1, s: random(0.7, 1.2) });
  }
}

function drawHearts() {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.x += h.vx + sin(h.y * 0.05) * 0.4;
    h.y += h.vy;
    h.life -= 0.012;
    if (h.life <= 0) { hearts.splice(i, 1); continue; }
    const pts = [];
    for (let a = 0; a < TWO_PI; a += TWO_PI / 22) {
      pts.push([h.x + 0.9 * h.s * 16 * pow(sin(a), 3),
                h.y - 0.9 * h.s * (13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a))]);
    }
    const col = color(C.rose); col.setAlpha(255 * min(1, h.life * 1.6));
    ink(pts, col, { w: 2, amp: 0.5, inkAlpha: 255 * min(1, h.life * 1.6) });
  }
}

/* ───────────── pointer + page hooks ─────────────
   The page UI sits on top of the canvas, so we listen on the whole window
   and convert the pointer into scene coordinates ourselves. */
function watchPointer() {
  const update = e => {
    const r = canvasEl.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.lx = (pointer.x - cx) / S;
    pointer.ly = (pointer.y - floorY) / S;
    pointer.overUI = !!e.target.closest('.panel, .btn');
  };

  window.addEventListener('pointermove', e => {
    update(e);
    document.body.style.cursor = cats.some(c => c.isNear) ? 'pointer' : '';
  });

  window.addEventListener('pointerdown', e => {
    update(e);
    if (pointer.overUI) return;
    cats.forEach(c => {
      if (dist(pointer.lx, pointer.ly, c.x, c.y - 72) < 72 * c.size) {
        c.bounce = 1;
        c.happyUntil = millis() / 1000 + 1.4;
        burst(c, 5);
      }
    });
  });
}

// game.js calls this when the player closes the pop-up.
window.flipSign = function () {
  if (sign.state !== 'closed') return;
  sign.state = 'flipping';
  sign.flipStart = millis();
  sign.flipEnd = sign.flipStart + FLIP_MS;
  cats.forEach((c, i) => setTimeout(() => { c.happyUntil = millis() / 1000 + 2.5; c.bounce = 1; burst(c, 4); }, 900 + i * 160));
};
