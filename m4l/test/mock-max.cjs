// Runs the device script under a small mock of Max's JS globals (mgraphics, MGraphics, Image,
// Buffer, Task) and rasterises the drawing to a PPM. No Max needed.
//   node m4l/test/mock-max.cjs <mode 0..2> <colour 0..2> <out.ppm> [width height]
const fs = require("fs"), vm = require("vm"), path = require("path");
const mode = +process.argv[2] || 0, colour = +process.argv[3] || 0, outPath = process.argv[4] || "m4l.ppm";
const W = +process.argv[5] || 388, H = +process.argv[6] || 161;

let fills = 0;
function surface(w, h) {
  const img = new Float32Array(w * h * 3);
  let src = [0, 0, 0, 1], grad = null, pathOps = [];
  const blend = (i, c, a) => { for (let k = 0; k < 3; k++) img[i + k] = img[i + k] * (1 - a) + c[k] * a; };
  const raster = (x0, y0, ww, hh, inside) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y0 + hh)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x0 + ww)); x++)
        if (inside(x + 0.5, y + 0.5)) blend((y * w + x) * 3, grad ? grad(y) : src, grad ? 1 : src[3]);
  };
  const ctx = {
    img, w, h,
    init() {}, redraw() {},
    get size() { return [w, h]; },
    set_source_rgba(r, g, b, a) { src = [r, g, b, a === undefined ? 1 : a]; grad = null; },
    pattern_create_linear() { const st = []; return { st, add_color_stop_rgba(t, r, g, b) { st.push([t, r, g, b]); } }; },
    set_source(p) {
      grad = y => {
        const t = y / h; let i = 0;
        while (i < p.st.length - 2 && t > p.st[i + 1][0]) i++;
        const a = p.st[i], b = p.st[i + 1], k = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      };
    },
    rectangle(x, y, ww, hh) { pathOps.push(["r", x, y, ww, hh]); },
    ellipse(x, y, ww, hh) { pathOps.push(["e", x, y, ww, hh]); },
    fill() {
      fills++;
      for (const [k, x, y, ww, hh] of pathOps) {
        if (k === "r") raster(x, y, ww, hh, () => true);
        else raster(x, y, ww, hh, (px, py) => ((px - x - ww / 2) / (ww / 2)) ** 2 + ((py - y - hh / 2) / (hh / 2)) ** 2 <= 1);
      }
      pathOps = [];
    },
    image_surface_draw(im) { img.set(im.src.img); },
  };
  return ctx;
}

const mg = surface(W, H);
const tasks = [];
let now = 1e12;
const ctx = {
  mgraphics: mg, box: { rect: [0, 0, W, H] }, Math, post: console.log,
  MGraphics: function (w, h) { return surface(w, h); },
  Image: function (s) { this.src = s; },
  Task: function (f) { this.f = f; this.repeat = () => tasks.push(this); this.cancel = () => {}; },
  Date: { now: () => now },
};
// a fake buffer~: saw harmonics through a gentle lowpass, notes stepping like an arpeggio
const N = 2048, fsr = 48000;
ctx.Buffer = function () {
  this.peek = (ch, i0, n) => {
    const a = new Array(n).fill(0), t = now / 1000;
    for (const f0 of [110, 220 * Math.pow(2, (Math.floor(t * 6) % 5) / 12), 330])
      for (let k = 1; k < 60; k++) {
        const f = f0 * k, b = Math.round(f / (fsr / N));
        if (b < n) a[b] += (N / 4) * 0.3 / k / Math.sqrt(1 + (f / 1500) ** 4);
      }
    return a;
  };
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spectral-relief-v8.js"), "utf8"), ctx);
const call = (k, v) => vm.runInContext(`${k}(${JSON.stringify(v)})`, ctx);
call("setbuf", "x"); call("sr", fsr); call("mode", mode); call("colour", colour);
vm.runInContext("lastPush = Date.now()", ctx);
// six seconds at the device's 25 frames a second, painting every frame (trails need that)
let ms = 0;
for (let i = 0; i < 150; i++) {
  now += 40; tasks[0].f();
  const t0 = process.hrtime.bigint(); vm.runInContext("paint()", ctx); ms += Number(process.hrtime.bigint() - t0) / 1e6;
}
const out = Buffer.alloc(W * H * 3);
for (let i = 0; i < mg.img.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(mg.img[i] * 255)));
fs.writeFileSync(outPath, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), out]));
console.log(`mode ${mode} colour ${colour}: ${(ms / 150).toFixed(1)} ms per paint (mock rasteriser included), ${fills} fills`);
