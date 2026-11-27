(() => {
"use strict";
// ---------------------------------------------------------------- constantes
const COLS = 192, FMIN = 30, FMAX = 14000, HMAX = 72;
const LOGR = Math.log(FMAX / FMIN);
const PAPER = [229, 228, 224], INK = [38, 40, 45], BLUE = "#3F7FB5";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const colFreq = c => FMIN * Math.exp(LOGR * c / (COLS - 1));
const freqCol = f => Math.log(f / FMIN) / LOGR * (COLS - 1);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = f => { const m = Math.round(69 + 12 * Math.log2(f / 440)); return NOTE_NAMES[(m % 12 + 12) % 12] + (Math.floor(m / 12) - 1); };
const fmtHz = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + " kHz" : Math.round(f) + " Hz";

// ruído 1D estável
const NZ = new Float32Array(2048);
let seed = 1234567;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < NZ.length; i++) NZ[i] = rnd();
const vnoise = x => { const i = Math.floor(x), f = x - i, a = NZ[i & 2047], b = NZ[(i + 1) & 2047], s = f * f * (3 - 2 * f); return a + (b - a) * s; };

// ---------------------------------------------------------------- estado
const par = { colour: "print", trails: 0.6, mode: "am", cell: 4.5, planes: 40, height: 0.48, jag: 0.45, shift: 3.2, notes: true,
  cutoff: 0.55, res: 6, spread: 12, release: 0.45, pattern: "arp" };
const cutoffHz = () => 80 * Math.pow(9000 / 80, par.cutoff);
let source = "sim", frozen = false;

const ring = []; for (let i = 0; i < HMAX; i++) ring.push(new Float32Array(COLS));
let ringHead = 0, lastPush = performance.now(), dust = 0;
const live = new Float32Array(COLS), tmp = new Float32Array(COLS);
const stored = k => ring[((ringHead - (k - 1)) % HMAX + HMAX) % HMAX];
const storedIdx = k => ((ringHead - (k - 1)) % HMAX + HMAX) % HMAX;
const PUSH_MS = 1000 / 12;

// ---------------------------------------------------------------- simulação (sem áudio)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function lpResp(f, fc, q) { const r = f / fc; return 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2); }
function addPeak(f, a, w) {
  const cc = freqCol(f); if (cc < 0 || cc > COLS - 1) return;
  const lo = Math.max(0, Math.floor(cc - 4 * w)), hi = Math.min(COLS - 1, Math.ceil(cc + 4 * w));
  for (let c = lo; c <= hi; c++) tmp[c] += a * Math.exp(-((c - cc) ** 2) / (2 * w * w));
}
let simNote = 220;
function simSpectrum(t) {
  tmp.fill(0);
  const bar = Math.floor(t / 2.4) % 4, ch = CHORDS[bar];
  const stepF = t * 6, step = Math.floor(stepF) % 6, env = Math.exp(-(stepF % 1) * 2.2);
  const fc = cutoffHz() * (0.7 + 0.3 * Math.sin(t * 0.35)), q = Math.max(0.7, par.res);
  const voices = [[mtof(ch[0] - 12), 0.75], [mtof(ch[step % 3] + (step >= 3 ? 12 : 0)), 0.9 * env + 0.1]];
  simNote = voices[1][0];
  for (const [f0, a0] of voices) {
    for (let n = 1; n <= 40; n++) {
      const f = f0 * n; if (f > FMAX) break;
      const a = a0 / Math.pow(n, 0.75) * Math.min(3, lpResp(f, fc, q)) * 0.45;
      addPeak(f, a, 0.9 + par.spread / 40);
      if (par.spread > 4) addPeak(f * Math.pow(2, par.spread / 1200), a * 0.6, 0.8);
    }
  }
  for (let c = 0; c < COLS; c++) tmp[c] += 0.03 * vnoise(c * 0.3 + t * 3);
  for (let c = 0; c < COLS; c++) live[c] = 1 - Math.exp(-tmp[c] * 1.4);
  massif();
}
// harmônicos isolados viram agulhas; o maciço (espectro borrado) dá corpo de montanha
const blurA = new Float32Array(COLS), blurB = new Float32Array(COLS);
function box(src, dst, r) {
  let acc = 0, n = 0;
  for (let c = -r; c < COLS + r; c++) {
    if (c + r < COLS) { acc += src[c + r]; n++; }
    if (c - r - 1 >= 0) { acc -= src[c - r - 1]; n--; }
    if (c >= 0 && c < COLS) dst[c] = acc / n;
  }
}
function massif() {
  box(live, blurA, 7); box(blurA, blurB, 7); box(blurB, blurA, 4);
  for (let c = 0; c < COLS; c++) live[c] = Math.min(1, blurA[c] * 1.9 * 0.62 + live[c] * 0.38);
}

// ---------------------------------------------------------------- áudio
let ac = null, analyser, inBus, fbuf, schedTimer = null, nextTime = 0, stepIdx = 0, mediaEl = null, mediaNode = null;
function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  const master = ac.createGain(); master.gain.value = 0.55;
  inBus = ac.createGain(); inBus.gain.value = 1;
  const dly = ac.createDelay(1.5), fb = ac.createGain(), wet = ac.createGain();
  fb.gain.value = 0.35; wet.gain.value = 0.28;
  inBus.connect(comp); inBus.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(comp);
  dly.delayTime.value = (60 / 112) * 0.75;
  analyser = ac.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.55;
  analyser.minDecibels = -96; analyser.maxDecibels = -18;
  comp.connect(master); master.connect(analyser); analyser.connect(ac.destination);
  fbuf = new Uint8Array(analyser.frequencyBinCount);
}
function voice(freq, t, dur, vel, opts) {
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator();
  o1.type = "sawtooth"; o2.type = "sawtooth"; o3.type = "square";
  o1.frequency.value = freq; o2.frequency.value = freq; o3.frequency.value = freq / 2;
  o2.detune.value = par.spread; o1.detune.value = -par.spread * 0.3;
  const g3 = ac.createGain(); g3.gain.value = 0.28;
  const flt = ac.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = par.res;
  const base = cutoffHz(), peak = Math.min(16000, base * (opts.envAmt || 2.5));
  flt.frequency.setValueAtTime(peak, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(40, base), t + (opts.fdec || 0.18));
  const vca = ac.createGain(); const A = opts.attack || 0.005, R = par.release * (opts.relMul || 1);
  vca.gain.setValueAtTime(0, t);
  vca.gain.linearRampToValueAtTime(vel, t + A);
  vca.gain.setTargetAtTime(vel * 0.6, t + A, 0.12);
  vca.gain.setValueAtTime(vel * 0.6, t + Math.max(A, dur));
  vca.gain.setTargetAtTime(0, t + Math.max(A, dur), R / 4);
  o1.connect(flt); o2.connect(flt); o3.connect(g3); g3.connect(flt); flt.connect(vca); vca.connect(inBus);
  const end = t + Math.max(A, dur) + R * 1.6 + 0.05;
  for (const o of [o1, o2, o3]) { o.start(t); o.stop(end); }
}
const ACID = [45, 45, 57, 45, 48, 45, 55, 43, 45, 57, 45, 52, 45, 50, 48, 43];
function scheduleStep(t, i) {
  const spb = 60 / 112, s16 = spb / 4;
  if (par.pattern === "arp") {
    const ch = CHORDS[Math.floor(i / 16) % 4], k = i % 16;
    const seq = [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3][k];
    const n = ch[seq % 3] + 12 * Math.floor(seq / 3);
    voice(mtof(n), t, s16 * 0.8, 0.2, { envAmt: 3 });
    if (k % 8 === 0) voice(mtof(ch[0] - 12), t, s16 * 7, 0.22, { envAmt: 1.6, fdec: 0.5 });
  } else if (par.pattern === "pad") {
    if (i % 32 === 0) {
      const ch = CHORDS[Math.floor(i / 32) % 4];
      for (const n of [ch[0] - 12, ch[0], ch[1], ch[2], ch[1] + 12])
        voice(mtof(n), t, s16 * 30, 0.1, { attack: 1.1, envAmt: 1.3, fdec: 2.5, relMul: 3 });
    }
  } else {
    const n = ACID[i % 16], acc = (i % 4 === 0) ? 0.3 : 0.2;
    voice(mtof(n), t, s16 * 0.55, acc, { envAmt: (i % 4 === 0) ? 7 : 4, fdec: 0.14 });
  }
}
function scheduler() {
  const s16 = (60 / 112) / 4;
  while (nextTime < ac.currentTime + 0.12) { scheduleStep(nextTime, stepIdx); nextTime += s16; stepIdx++; }
}
function startSynth() {
  initAudio(); stopFile(); ac.resume();
  nextTime = ac.currentTime + 0.05; stepIdx = 0;
  schedTimer = setInterval(scheduler, 25); scheduler();
  source = "synth";
}
function stopSynth() { if (schedTimer) clearInterval(schedTimer); schedTimer = null; if (source === "synth") source = "sim"; }
function stopFile() { if (mediaEl) { mediaEl.pause(); } if (source === "file") source = "sim"; }

function readSpectrum() {
  analyser.getByteFrequencyData(fbuf);
  const binHz = ac.sampleRate / analyser.fftSize; let sum = 0;
  for (let c = 0; c < COLS; c++) {
    const b0 = colFreq(c - 0.5) / binHz, b1 = colFreq(c + 0.5) / binHz; let v;
    if (b1 - b0 < 1) { const b = colFreq(c) / binHz, i = Math.floor(b), f = b - i; v = fbuf[i] * (1 - f) + fbuf[Math.min(i + 1, fbuf.length - 1)] * f; }
    else { v = 0; for (let i = Math.ceil(b0); i <= Math.min(Math.floor(b1), fbuf.length - 1); i++) if (fbuf[i] > v) v = fbuf[i]; }
    tmp[c] = Math.pow(v / 255, 2.0); sum += tmp[c];
  }
  for (let c = 0; c < COLS; c++) live[c] = 0.2 * tmp[Math.max(0, c - 1)] + 0.6 * tmp[c] + 0.2 * tmp[Math.min(COLS - 1, c + 1)];
  massif();
  return sum / COLS;
}

// ---------------------------------------------------------------- telas (threshold maps)
function buildThreshold(mode, W, H, cell) {
  const thr = new Float32Array(W * H);
  const th = mode === "line" ? Math.PI / 180 * 15 : Math.PI / 4, cs = Math.cos(th), sn = Math.sin(th);
  let s = 98765; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (mode === "fm") {
    const b = Math.max(1, Math.round(cell / 3)), bw = Math.ceil(W / b), bh = Math.ceil(H / b), blk = new Float32Array(bw * bh);
    for (let i = 0; i < blk.length; i++) blk[i] = r();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) thr[y * W + x] = blk[((y / b) | 0) * bw + ((x / b) | 0)];
    return thr;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x * cs + y * sn) / cell, v = (-x * sn + y * cs) / cell;
    if (mode === "am") { const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5; thr[y * W + x] = (fu * fu + fv * fv) * 2; }
    else { thr[y * W + x] = Math.abs(2 * (v - Math.floor(v)) - 1); }
  }
  return thr;
}
// alpha de tinta a partir do tom (0..1) e do limiar
function makeInker(mode, cell) {
  if (mode === "fm") return (t, th) => (t * t > th * 0.9 ? 1 : 0);
  const k = mode === "am" ? cell * 1.1 : cell * 0.9;
  return (t, th) => { const a = (t - th) * k; return a < 0 ? 0 : a > 1 ? 1 : a; };
}

// ---------------------------------------------------------------- Alpenglow Neon
// Everything blue, cut by one low warm light. Same stops as fm1/sr.c.
const hex = v => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const SKY = [0x044185, 0x3595F6, 0x6B8DEE, 0xAF83E9].map(hex);
const BODY = [0x044A87, 0x0656A4, 0x7476E2, 0xB177D8].map(hex);
const LIT = [0xE39E64, 0xE28868, 0xD37C92, 0xE193A3].map(hex);
const DOTC = [0x002732, 0x044A87, 0x6B8DEE].map(hex);
const FOGC = [0x1A8BEB, 0x5D8DED].map(hex);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(st, t) {
  t = clamp(t, 0, 1); const p = t * (st.length - 1), i = Math.min(p | 0, st.length - 2);
  return mixc(st[i], st[i + 1], p - i);
}

// ---------------------------------------------------------------- Normal (after TORUS)
// The colour is the direction the surface faces, as in p5's normalMaterial: +x red, up green,
// toward the viewer blue, negatives clipped to black. Same formula as fm1/sr.c.
function normalRGB(sl, t, e, dz, faceFall) {
  let nx = clamp(sl / 0.28, -1, 1) * (0.3 + 0.7 * e);
  let ny = 0.8 * Math.exp(-t / (0.35 * faceFall)) + 0.15 * dz;
  const l2 = nx * nx + ny * ny, nz = Math.sqrt(Math.max(0.04, 1 - l2));
  // full saturation: the brightest channel goes to 255, like the TORUS captures
  const r = Math.max(0, nx), g = Math.max(0, ny), k = 255 / Math.max(r, g, nz);
  return [r * k, g * k, nz * k];
}

// ---------------------------------------------------------------- superfícies
// A mesma cena desenha em várias telas: a prova grande e as prévias de hardware.
let dirty = true;
const surfaces = [];
function makeSurface(canvas, opts = {}) {
  const s = { canvas, cx: canvas.getContext("2d"), opts, W: 0, H: 0, visible: true, ridges: null };
  s.cell = () => opts.cell ? opts.cell(par.cell) : par.cell;
  s.planes = () => opts.planes ? opts.planes(par.planes) : par.planes;
  s.rebuild = () => { if (s.W) s.thr = buildThreshold(par.mode, s.W, s.H, s.cell()); };
  s.resize = () => {
    let w, h;
    if (opts.fixed) [w, h] = opts.fixed;
    else {
      const r = canvas.getBoundingClientRect(); if (!r.width) return;
      const k = r.width > 1100 ? 1100 / r.width : 1;
      w = Math.max(200, Math.round(r.width * k)); h = Math.max(160, Math.round(r.height * k));
    }
    s.W = w; s.H = h; canvas.width = w; canvas.height = h;
    s.img = s.cx.createImageData(w, h); s.px = new Uint32Array(s.img.data.buffer);
    s.grain = new Float32Array(w * h); let q = 4242;
    for (let i = 0; i < s.grain.length; i++) s.grain[i] = (q = (q * 1664525 + 1013904223) >>> 0) / 4294967296;
    s.rebuild(); dirty = true;
  };
  new IntersectionObserver(es => { s.visible = es[es.length - 1].isIntersecting; }).observe(canvas);
  if (!opts.fixed) new ResizeObserver(s.resize).observe(canvas); else s.resize();
  surfaces.push(s);
  return s;
}
const rebuildAll = () => { for (const s of surfaces) s.rebuild(); dirty = true; };

function render(s, phase) {
  const { W, H, px, thr, grain } = s; if (!W) return;
  const P = s.planes(), cell = s.cell(), sc = W / 900;
  const paper = s.opts.paper || PAPER, inkC = s.opts.ink || INK;
  const offX = par.shift * Math.max(sc, 0.35), baseFront = H * 0.95, stepY = (H * 0.5) / P, amp = H * par.height;
  const mL = W * 0.06, span = W * 0.88 - P * offX;
  if (!s.ridges || s.ridges.length < P * W) s.ridges = new Float32Array(P * W);
  const ridges = s.ridges;
  const zs = new Float32Array(P), bases = new Float32Array(P), fades = new Float32Array(P);
  const nsc = Math.max(sc, 0.4);
  // 1) cristas
  for (let p = 0; p < P; p++) {
    const row = p === 0 ? live : stored(p), idx = p === 0 ? (ringHead + 1) % HMAX : storedIdx(p);
    const z = p === 0 ? 0 : p - 1 + phase; zs[p] = z;
    const base = baseFront - z * stepY; bases[p] = base;
    fades[p] = p === P - 1 ? 1 - phase : 1;
    const ampP = amp * (1 - 0.4 * z / P), xShift = z * offX, nseed = idx * 61.7;
    for (let x = 0; x < W; x++) {
      const xs = x - xShift, u = (xs - mL) / span; let h = 0;
      if (u > 0 && u < 1) {
        const cp = u * (COLS - 1), i = cp | 0, f = cp - i;
        h = row[i] * (1 - f) + row[Math.min(i + 1, COLS - 1)] * f;
        h = (h + 0.025) * Math.pow(Math.sin(Math.PI * u), 0.5);
        if (par.jag > 0) h *= 1 + par.jag * (vnoise(xs / (7 * nsc) + nseed) - 0.5) * 1.2 + par.jag * (vnoise(xs / (2.2 * nsc) + nseed * 1.7) - 0.5) * 0.35;
      }
      ridges[p * W + x] = base - ampP * h;
    }
  }
  // 2) preenchimento frente→fundo, já com a tela de impressão
  const ink = makeInker(par.mode, cell);
  const pr = paper[0], pg = paper[1], pb = paper[2], ir = inkC[0], ig = inkC[1], ib = inkC[2];
  const fogH = Math.max(stepY * 2.2, H * 0.04), crease = 1.5 * Math.max(1, sc), faceFall = 40 * Math.max(0.6, sc);
  const fm = par.mode === "fm", sw = Math.max(1, Math.round(5 * Math.max(sc, 0.5))), GL = grain.length;
  const alp = par.colour === "alpenglow";
  if (alp && (!s.sky || s.sky.length !== H)) { s.sky = []; for (let y = 0; y < H; y++) s.sky.push(ramp(SKY, y / H)); }
  const sky = s.sky;
  const q8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const nrm = par.colour === "normal", trails = nrm && par.trails > 0, dec = 0.8 + 0.19 * par.trails;
  // trails: what was drawn before fades instead of being erased, like the TORUS canvas that is never cleared
  const putn = (i, r, g, b) => {
    if (trails) { const o = px[i]; r = Math.max(r, (o & 255) * dec); g = Math.max(g, ((o >> 8) & 255) * dec); b = Math.max(b, ((o >> 16) & 255) * dec); }
    px[i] = 0xff000000 | (q8(b) << 16) | (q8(g) << 8) | q8(r);
  };
  const putc = (i, c, n) => { px[i] = 0xff000000 | (q8(c[2] + n) << 16) | (q8(c[1] + n) << 8) | q8(c[0] + n); };
  const put = (i, a) => {
    const n = (grain[(i * 7) % GL] - 0.5) * 8;
    px[i] = 0xff000000 | ((pb + n + (ib - pb) * a) << 16) | ((pg + n + (ig - pg) * a) << 8) | (pr + n + (ir - pr) * a);
  };
  for (let x = 0; x < W; x++) {
    let top = H;
    for (let p = 0; p < P && top > 0; p++) {
      const r = ridges[p * W + x], ry = Math.max(0, Math.ceil(r));
      if (ry >= top) continue;
      const slope = (ridges[p * W + Math.min(x + sw, W - 1)] - ridges[p * W + Math.max(x - sw, 0)]) / (2 * sw) * 0.4;
      const dz = zs[p] / P, baseDark = 0.8 - 0.62 * Math.pow(dz, 0.8), sl = clamp(-slope * 0.35, -0.28, 0.28);
      const base = bases[p], fade = fades[p], creaseD = 0.24 * (1 - dz);
      let body, litc, dotc, fogc, face = 0;
      if (alp) { body = ramp(BODY, dz); litc = ramp(LIT, dz); dotc = ramp(DOTC, dz); fogc = ramp(FOGC, dz); face = sl < 0 ? -sl / 0.28 : 0; }
      for (let y = ry; y < top; y++) {
        const i = y * W + x, t = y - r, e = Math.exp(-t / faceFall);
        let d = baseDark + sl * e;
        if (t < crease && !alp) d += creaseD;
        const m = clamp((y - (base - fogH)) / fogH, 0, 1);
        d *= 1 - 0.9 * m * m;
        d += (grain[i] - 0.5) * 0.14;
        d *= fade;
        if (nrm) {
          const c = normalRGB(sl, t, e, dz, faceFall), a = ink(d < 0 ? 0 : d > 1 ? 1 : d, thr[i]) * (1 - 0.6 * dz) * (1 - m * m) * fade;
          putn(i, c[0] * a, c[1] * a, c[2] * a);
        } else if (alp) {
          // warm light only on faces turned to the sun and a thin rim on the crest
          let L = face * e; if (t < 2 * crease + 1) L = Math.max(L, 0.375 + face / 2);
          L *= 1 - dz / 2;
          const mist = mixc(fogc, sky[y], 0.375 + 0.625 * dz);
          const b = mixc(mixc(body, litc, L), mist, m * m);
          const dd = d * (1 - 0.7 * L);
          putc(i, mixc(b, dotc, ink(dd < 0 ? 0 : dd > 1 ? 1 : dd, thr[i])), (grain[(i * 7) % GL] - 0.5) * 6);
        } else put(i, ink(d < 0 ? 0 : d > 1 ? 1 : d, thr[i]));
      }
      top = ry;
    }
    // céu com poeira, mais densa perto das cristas
    if (nrm) { for (let y = 0; y < top; y++) putn(y * W + x, 0, 0, 0); continue; }
    if (alp) { // smooth sky, a few tiny stars in the upper part
      for (let y = 0; y < top; y++) { const i = y * W + x; putc(i, grain[i] > 0.9975 && y < H * 0.4 ? mixc(sky[y], [242, 244, 255], 0.6) : sky[y], 0); }
      continue;
    }
    for (let y = 0; y < top; y++) {
      const i = y * W + x, q = y / Math.max(top, 1);
      const d = dust * 0.07 * q * q * q * q;
      put(i, d > 0.005 ? ink(fm ? Math.sqrt(d) * 0.55 : d, thr[i]) : 0);
    }
  }
  s.cx.putImageData(s.img, 0, 0);
  if (s.opts.annotate && par.notes) annotate(s, P, offX, baseFront, stepY, mL, span, sc);
}

function arrow(cx, x0, y0, x1, y1, s) {
  cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0), L = 7 * s;
  cx.beginPath(); cx.moveTo(x1, y1);
  cx.lineTo(x1 - L * Math.cos(a - 0.4), y1 - L * Math.sin(a - 0.4));
  cx.lineTo(x1 - L * Math.cos(a + 0.4), y1 - L * Math.sin(a + 0.4)); cx.closePath(); cx.fill();
}
let peakInfo = null;
function findPeak() {
  let best = -1, bv = 0.12;
  for (let c = 2; c < COLS - 2; c++) if (live[c] > bv) { bv = live[c]; best = c; }
  return best;
}
function annotate(srf, P, offX, baseFront, stepY, mL, span, sc) {
  const { cx, W, H, ridges } = srf;
  const s = Math.max(0.8, Math.min(1.3, sc));
  const mark = par.colour === "print" ? BLUE : "#F2F4FF";
  cx.strokeStyle = mark; cx.fillStyle = mark; cx.lineWidth = 1.1 * s;
  cx.font = `${Math.round(10.5 * s)}px "IBM Plex Mono", ui-monospace, monospace`;
  const yA = H * 0.985;
  arrow(cx, mL, yA, mL + span + 10 * s, yA, s);
  cx.textBaseline = "bottom";
  for (const f of [100, 1000, 10000]) {
    const x = mL + span * freqCol(f) / (COLS - 1);
    cx.beginPath(); cx.moveTo(x, yA); cx.lineTo(x, yA - 4 * s); cx.stroke();
    cx.fillText(fmtHz(f), x + 3 * s, yA - 3 * s);
  }
  const x0 = mL * 0.45, y0 = baseFront - 8 * s, x1 = x0 + (P - 1) * offX, y1 = baseFront - (P - 1) * stepY;
  arrow(cx, x0, y0, x1, y1, s);
  cx.fillText("time · past", x1 + 4 * s, y1 + 2 * s);
  const best = findPeak();
  if (best >= 0) {
    const f = colFreq(best), x = Math.round(mL + span * best / (COLS - 1));
    const ry = ridges[Math.min(W - 1, Math.max(0, x))];
    cx.beginPath(); cx.arc(x, ry, 3 * s, 0, Math.PI * 2); cx.stroke();
    cx.beginPath(); cx.moveTo(x, ry - 4 * s); cx.lineTo(x, ry - 22 * s); cx.stroke();
    const label = `${noteName(f)} · ${fmtHz(f)}`, tw = cx.measureText(label).width;
    cx.fillText(label, Math.min(W - tw - 6, x + 4 * s), ry - 24 * s);
  }
}

const main = makeSurface(document.getElementById("cv"), { annotate: true });
// FM-1: tela 240×240 RGB565 → lineatura menor e menos planos
const fm1 = document.getElementById("hw-fm1") && makeSurface(document.getElementById("hw-fm1"), {
  fixed: [240, 240], cell: c => Math.max(3, c * 0.7), planes: p => Math.round(p * 0.55),
});
// Ableton Live: faixa de devices, tema escuro → tinta clara sobre fundo grafite
const live12 = document.getElementById("hw-live") && makeSurface(document.getElementById("hw-live"), {
  fixed: [560, 169], cell: c => Math.max(3, c * 0.75), planes: p => Math.round(p * 0.6),
  paper: [36, 37, 40], ink: [214, 213, 208],
});

// ---------------------------------------------------------------- laço
const t0 = performance.now(); let frames = 0, fpsT = performance.now(), fps = 0, lastRO = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (!frozen) {
    let level;
    if (source === "sim") { simSpectrum((now - t0) / 1000); level = 0; for (let c = 0; c < COLS; c++) level += live[c]; level /= COLS; }
    else level = readSpectrum();
    dust += (Math.min(1, level * 4) - dust) * 0.08;
    while (now - lastPush > PUSH_MS) { ringHead = (ringHead + 1) % HMAX; ring[ringHead].set(live); lastPush += PUSH_MS; if (now - lastPush > 1000) lastPush = now; }
  }
  if (frozen && !dirty) return;
  const phase = frozen ? 0 : clamp((now - lastPush) / PUSH_MS, 0, 1);
  for (const s of surfaces) if (s.visible || dirty) render(s, phase);
  dirty = false;
  const b = findPeak(); peakInfo = b >= 0 ? colFreq(b) : null;
  frames++;
  if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  if (now - lastRO > 150) { lastRO = now; updateReadout(); }
}
// pré-aquecer a história para a prova chegar cheia
for (let k = 0; k < HMAX; k++) { simSpectrum(k * PUSH_MS / 1000); ringHead = (ringHead + 1) % HMAX; ring[ringHead].set(live); }
lastPush = performance.now();
if (reduceMotion) { frozen = true; document.getElementById("freeze").setAttribute("aria-pressed", "true"); }
requestAnimationFrame(tick);

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
function updateReadout() {
  $("ro-src").innerHTML = `source <b>${source === "sim" ? "simulation" : source === "synth" ? "synth · " + par.pattern : "file"}</b>`;
  $("ro-note").innerHTML = `peak <b>${peakInfo ? noteName(peakInfo) + " · " + fmtHz(peakInfo) : "—"}</b>`;
  $("ro-cut").innerHTML = `cutoff <b>${fmtHz(cutoffHz())}</b> · Q <b>${par.res.toFixed(1)}</b>`;
  $("ro-fps").textContent = frozen ? "frozen" : `${fps} fps`;
}
const fmts = {
  cutoff: () => fmtHz(cutoffHz()), res: v => v.toFixed(1), spread: v => v + " cents",
  release: v => v.toFixed(2) + " s", cell: v => v.toString() + " px",
  planes: v => v + " layers", height: v => Math.round(v * 100) + "%", jag: v => Math.round(v * 100) + "%",
  shift: v => v.toFixed(1) + " px/layer", trails: v => v > 0 ? Math.round(v * 100) + "%" : "off",
};
for (const id of Object.keys(fmts)) {
  const el = $(id), out = $("o-" + id);
  const upd = () => { par[id] = parseFloat(el.value); out.textContent = fmts[id](par[id]); dirty = true;
    if (id === "cell") rebuildAll(); };
  el.addEventListener("input", upd); upd();
}
function seg(id, key, labels) {
  const g = $(id);
  g.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    for (const o of g.querySelectorAll("button")) o.setAttribute("aria-pressed", o === b ? "true" : "false");
    par[key] = b.dataset.v; $("o-" + id).textContent = labels[b.dataset.v]; dirty = true;
    if (key === "mode") { rebuildAll(); drawTiles(); }
    if (key === "colour") document.body.dataset.colour = b.dataset.v;
  });
}
seg("mode", "mode", { am: "halftone", fm: "stipple", line: "lines" });
seg("colour", "colour", { print: "print", alpenglow: "alpenglow", normal: "normal" });
seg("pattern", "pattern", { arp: "arpeggio", pad: "pad", acid: "acid" });
$("notes").addEventListener("change", e => { par.notes = e.target.checked; dirty = true; });
$("play").addEventListener("click", () => {
  if (source === "synth") { stopSynth(); $("play").textContent = "Play synth"; }
  else { startSynth(); $("play").textContent = "Stop synth"; if (frozen) toggleFreeze(); }
});
function toggleFreeze() { frozen = !frozen; $("freeze").setAttribute("aria-pressed", String(frozen)); dirty = true; if (!frozen) lastPush = performance.now(); }
$("freeze").addEventListener("click", toggleFreeze);
$("file").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  initAudio(); stopSynth(); $("play").textContent = "Play synth"; ac.resume();
  if (!mediaEl) { mediaEl = new Audio(); mediaEl.loop = true; mediaNode = ac.createMediaElementSource(mediaEl); mediaNode.connect(inBus); }
  mediaEl.src = URL.createObjectURL(f); mediaEl.play().catch(() => {});
  source = "file"; if (frozen) toggleFreeze();
});

// ---------------------------------------------------------------- amostras do moodboard
function drawTile(id, mode, fog) {
  const c = $(id), r = c.getBoundingClientRect(); if (!r.width) return;
  const w = Math.round(r.width), h = Math.round(r.height); c.width = w; c.height = h;
  const g = c.getContext("2d"), im = g.createImageData(w, h), p32 = new Uint32Array(im.data.buffer);
  const cell = 5, th = buildThreshold(mode, w, h, cell), inkF = makeInker(mode, cell);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let t = x / (w - 1);
    if (fog) { // três planos com névoa na base
      t = 0;
      for (let k = 2; k >= 0; k--) {
        const base = h * (0.45 + k * 0.22), ridge = base - h * (0.18 + 0.06 * Math.sin(x / w * 6 + k * 2)) * (1 - Math.abs(x / w - 0.5 - k * 0.1));
        if (y >= ridge) { const m = clamp((y - (base - h * 0.12)) / (h * 0.12), 0, 1); t = (0.25 + k * 0.25) * (1 - 0.9 * m * m); }
      }
    }
    const a = inkF(t, th[i]);
    p32[i] = 0xff000000 | ((PAPER[2] + (INK[2] - PAPER[2]) * a) << 16) | ((PAPER[1] + (INK[1] - PAPER[1]) * a) << 8) | (PAPER[0] + (INK[0] - PAPER[0]) * a);
  }
  g.putImageData(im, 0, 0);
}
function drawTiles() { drawTile("t-am", "am"); drawTile("t-fm", "fm"); drawTile("t-line", "line"); drawTile("t-fog", par.mode, true); }
new ResizeObserver(drawTiles).observe(document.querySelector(".tiles"));
})();
