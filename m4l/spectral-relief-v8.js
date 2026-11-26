/* Spectral Relief for Max for Live: the site's engine drawn with mgraphics.
 * Works in v8ui (Max 9) and jsui (Max 8): plain ES5 only.
 *
 * The device's pfft~ (sr.fft~.maxpat) writes one amplitude per FFT bin into a buffer~;
 * this script reads it 25 times a second, keeps 72 layers of history and draws the range.
 * Mono print and Alpenglow Neon colour; halftone, stipple or line screen.
 *
 * Messages: setbuf <name>, sr <Hz>, mode 0|1|2, colour 0|1, planes N, height 0..1,
 *           jag 0..1, cell px, shift px, freeze 0|1, bang (redraw) */
autowatch = 1;
inlets = 1;
outlets = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var COLS = 192, FMIN = 30, FMAX = 14000, HMAX = 72, FFT_N = 2048, PUSH_MS = 1000 / 12;
var LOGR = Math.log(FMAX / FMIN);
var par = { mode: 0, colour: 0, planes: 24, height: 0.48, jag: 0.45, cell: 4, shift: 2.2, frozen: 0 };
var fs = 48000, buf = null;
var live = zeros(COLS), smooth = zeros(COLS), tmp = zeros(COLS), ring = [], head = 0, lastPush = Date.now(), dust = 0;
for (var k = 0; k < HMAX; k++) ring.push(zeros(COLS));

function zeros(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function colFreq(c) { return FMIN * Math.exp(LOGR * c / (COLS - 1)); }

/* stable 1D noise, same generator as the site */
var NZ = [], seed = 1234567;
for (var i = 0; i < 2048; i++) { seed = (seed * 1664525 + 1013904223) % 4294967296; NZ.push(seed / 4294967296); }
function vnoise(x) {
	var i = Math.floor(x), f = x - i, a = NZ[i & 2047], b = NZ[(i + 1) & 2047], s = f * f * (3 - 2 * f);
	return a + (b - a) * s;
}
function hash(x, y) {
	var h = (Math.imul ? Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) : (x * 374761393 + y * 668265263)) | 0;
	h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
	return ((h >>> 0) % 65536) / 65536;
}

/* ------------------------------------------------------------ messages */
function setbuf(name) { buf = new Buffer(name); }
function sr(v) { if (v > 0) fs = v; }
function mode(v) { par.mode = clamp(v | 0, 0, 2); mgraphics.redraw(); }
function colour(v) { par.colour = clamp(v | 0, 0, 1); mgraphics.redraw(); }
function planes(v) { par.planes = clamp(Math.round(v), 6, HMAX - 2); }
function height(v) { par.height = clamp(v, 0.1, 0.8); }
function jag(v) { par.jag = clamp(v, 0, 1); }
function cell(v) { par.cell = clamp(v, 2.5, 10); }
function shift(v) { par.shift = clamp(v, 0, 8); }
function freeze(v) { par.frozen = v ? 1 : 0; if (!v) lastPush = Date.now(); }
function bang() { mgraphics.redraw(); }

var task = new Task(tick, this);
task.interval = 40;
task.repeat();
function notifydeleted() { task.cancel(); }

/* ------------------------------------------------------------ spectrum */
function box3(src, dst, r) {
	var acc = 0, n = 0;
	for (var c = -r; c < COLS + r; c++) {
		if (c + r < COLS) { acc += src[c + r]; n++; }
		if (c - r - 1 >= 0) { acc -= src[c - r - 1]; n--; }
		if (c >= 0 && c < COLS) dst[c] = acc / n;
	}
}
var bA = zeros(COLS), bB = zeros(COLS);
function massif() {
	box3(live, bA, 7); box3(bA, bB, 7); box3(bB, bA, 4);
	for (var c = 0; c < COLS; c++) live[c] = Math.min(1, bA[c] * 1.178 + live[c] * 0.38);
}

function readSpectrum() {
	var amp = null, c;
	if (buf) { try { amp = buf.peek(1, 0, FFT_N / 2); } catch (e) { amp = null; } }
	if (!amp || !amp.length) { for (c = 0; c < COLS; c++) live[c] *= 0.9; return 0; }
	var binHz = fs / FFT_N, sum = 0, ref = FFT_N / 4;    /* full-scale sine after a Hann window */
	for (c = 0; c < COLS; c++) {
		var b0 = colFreq(c - 0.5) / binHz, b1 = colFreq(c + 0.5) / binHz, m = 0;
		if (b1 - b0 < 1) {
			var b = Math.max(1, colFreq(c) / binHz), i0 = Math.floor(b), f = b - i0;
			m = (amp[i0] || 0) * (1 - f) + (amp[i0 + 1] || 0) * f;
		} else {
			for (var j = Math.ceil(b0); j <= Math.min(Math.floor(b1), amp.length - 1); j++) if (amp[j] > m) m = amp[j];
		}
		/* the site's analyser: (dB + 96) / 78, full-scale sine near -13.5 dB, then gamma 2 */
		var db = m > 0 ? 20 * Math.log(m / ref) / Math.LN10 - 13.5 : -200;
		var v = clamp((db + 96) / 78, 0, 1);
		smooth[c] = smooth[c] * 0.55 + v * 0.45;
		tmp[c] = smooth[c] * smooth[c]; sum += tmp[c];
	}
	for (c = 0; c < COLS; c++) live[c] = 0.2 * tmp[Math.max(0, c - 1)] + 0.6 * tmp[c] + 0.2 * tmp[Math.min(COLS - 1, c + 1)];
	massif();
	return sum / COLS;
}

function tick() {
	if (!par.frozen) {
		var level = readSpectrum(), now = Date.now();
		dust += (Math.min(1, level * 4) - dust) * 0.08;
		while (now - lastPush > PUSH_MS) {
			head = (head + 1) % HMAX;
			for (var c = 0; c < COLS; c++) ring[head][c] = live[c];
			lastPush += PUSH_MS;
			if (now - lastPush > 1000) lastPush = now;
		}
	}
	mgraphics.redraw();
}

/* ------------------------------------------------------------ geometry (the site's render, step 1) */
var G = { W: 0, H: 0, P: 0, ridges: [], zs: [], bases: [], fades: [], stepY: 0, faceFall: 40, crease: 1.5, fogH: 10, sw: 2 };
function stored(k) { return ring[((head - (k - 1)) % HMAX + HMAX) % HMAX]; }
function storedIdx(k) { return ((head - (k - 1)) % HMAX + HMAX) % HMAX; }

function computeRidges(W, H) {
	var P = par.planes, sc = W / 900, phase = par.frozen ? 0 : clamp((Date.now() - lastPush) / PUSH_MS, 0, 1);
	var offX = par.shift * Math.max(sc, 0.35), baseFront = H * 0.95, stepY = (H * 0.5) / P, amp = H * par.height;
	var mL = W * 0.06, span = W * 0.88 - P * offX, nsc = Math.max(sc, 0.7);
	G.W = W; G.H = H; G.P = P; G.stepY = stepY;
	G.faceFall = 40 * Math.max(0.6, sc); G.crease = 1.5 * Math.max(1, sc);
	G.fogH = Math.max(stepY * 2.2, H * 0.04); G.sw = Math.max(1, Math.round(5 * Math.max(sc, 0.5)));
	for (var p = 0; p < P; p++) {
		var row = p === 0 ? live : stored(p), idx = p === 0 ? (head + 1) % HMAX : storedIdx(p);
		var z = p === 0 ? 0 : p - 1 + phase, base = baseFront - z * stepY;
		G.zs[p] = z; G.bases[p] = base; G.fades[p] = p === P - 1 ? 1 - phase : 1;
		var ampP = amp * (1 - 0.4 * z / P), xShift = z * offX, ns = idx * 61.7, r = G.ridges[p] || (G.ridges[p] = []);
		for (var x = 0; x < W; x++) {
			var xs = x - xShift, u = (xs - mL) / span, h = 0;
			if (u > 0 && u < 1) {
				var cp = u * (COLS - 1), i = cp | 0, f = cp - i;
				h = row[i] * (1 - f) + row[Math.min(i + 1, COLS - 1)] * f;
				h = (h + 0.025) * Math.pow(Math.sin(Math.PI * u), 0.5);
				if (par.jag > 0) h *= 1 + par.jag * (vnoise(xs / (16 * nsc) + ns) - 0.5) * 1.2 + par.jag * (vnoise(xs / (2.2 * nsc) + ns * 1.7) - 0.5) * 0.35;
			}
			r[x] = base - ampP * h;
		}
	}
}

/* tone and light at a point: the first layer, front to back, whose ridge is above it */
function toneAt(x, y) {
	var W = G.W, xi = clamp(Math.round(x), 0, W - 1);
	for (var p = 0; p < G.P; p++) {
		var R = G.ridges[p], r = R[xi];
		if (y < r) continue;
		var slope = (R[Math.min(xi + G.sw, W - 1)] - R[Math.max(xi - G.sw, 0)]) / (2 * G.sw) * 0.4;
		var dz = G.zs[p] / G.P, sl = clamp(-slope * 0.35, -0.28, 0.28), t = y - r, e = Math.exp(-t / G.faceFall);
		var d = 0.8 - 0.62 * Math.pow(dz, 0.8) + sl * e;
		if (t < G.crease && !par.colour) d += 0.24 * (1 - dz);
		var m = clamp((y - (G.bases[p] - G.fogH)) / G.fogH, 0, 1);
		d *= 1 - 0.9 * m * m;
		d *= G.fades[p];
		var face = sl < 0 ? -sl / 0.28 : 0, L = face * e;
		if (t < 2 * G.crease + 1) L = Math.max(L, 0.375 + face / 2);
		L *= 1 - dz / 2;
		return { d: clamp(d, 0, 1), dz: dz, m: m, L: L };
	}
	return null;
}

/* ------------------------------------------------------------ colour */
function hx(v) { return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
function hxs(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(hx(a[i])); return o; }
var SKY = hxs([0x044185, 0x3595F6, 0x6B8DEE, 0xAF83E9]), BODY = hxs([0x044A87, 0x0656A4, 0x7476E2, 0xB177D8]);
var LIT = hxs([0xE39E64, 0xE28868, 0xD37C92, 0xE193A3]), DOTC = hxs([0x002732, 0x044A87, 0x6B8DEE]), FOGC = hxs([0x1A8BEB, 0x5D8DED]);
var PAPER = hx(0x242528), INK = hx(0xD6D5D0);      /* Live's dark theme: light ink on graphite */
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function ramp(st, t) { t = clamp(t, 0, 1); var p = t * (st.length - 1), i = Math.min(p | 0, st.length - 2); return mixc(st[i], st[i + 1], p - i); }
function q(c) { return Math.round(c[0] * 15) + "," + Math.round(c[1] * 15) + "," + Math.round(c[2] * 15); }

/* shapes are batched per colour: one fill per group keeps mgraphics fast */
var groups;
function add(c, kind, a, b, cc, d) {
	var key = q(c), g = groups[key];
	if (!g) g = groups[key] = { c: c, s: [] };
	g.s.push(kind, a, b, cc, d);
}
function flush() {
	for (var key in groups) {
		var g = groups[key], s = g.s;
		mgraphics.set_source_rgba(g.c[0], g.c[1], g.c[2], 1);
		for (var i = 0; i < s.length; i += 5) {
			if (s[i] === 0) mgraphics.ellipse(s[i + 1], s[i + 2], s[i + 3], s[i + 4]);
			else mgraphics.rectangle(s[i + 1], s[i + 2], s[i + 3], s[i + 4]);
		}
		mgraphics.fill();
	}
	groups = {};
}

/* ------------------------------------------------------------ paint */
function paint() {
	/* the drawn size (presentation or patching), falling back to the box */
	var sz = mgraphics.size || [box.rect[2] - box.rect[0], box.rect[3] - box.rect[1]];
	var W = Math.round(sz[0]), H = Math.round(sz[1]);
	if (W < 20 || H < 20) return;
	computeRidges(W, H);
	var alp = par.colour === 1, cellPx = par.cell, x, y, info;
	groups = {};

	/* ground: graphite paper, or the Alpenglow sky gradient */
	if (alp) {
		var pat = mgraphics.pattern_create_linear(0, 0, 0, H);
		for (var s = 0; s < SKY.length; s++) pat.add_color_stop_rgba(s / (SKY.length - 1), SKY[s][0], SKY[s][1], SKY[s][2], 1);
		mgraphics.set_source(pat);
	} else mgraphics.set_source_rgba(PAPER[0], PAPER[1], PAPER[2], 1);
	mgraphics.rectangle(0, 0, W, H);
	mgraphics.fill();

	/* Alpenglow: the masses' body colour on a coarse grid, before the dots */
	if (alp) {
		var gq = Math.max(2, Math.round(cellPx * 0.75));
		for (y = 0; y < H; y += gq) for (x = 0; x < W; x += gq) {
			info = toneAt(x + gq / 2, y + gq / 2);
			if (!info) continue;
			var mist = mixc(ramp(FOGC, info.dz), ramp(SKY, (y + gq / 2) / H), 0.375 + 0.625 * info.dz);
			add(mixc(mixc(ramp(BODY, info.dz), ramp(LIT, info.dz), info.L), mist, info.m * info.m), 1, x, y, gq + 0.5, gq + 0.5);
		}
		flush();
	}

	function inkOf(info) { return alp ? ramp(DOTC, info.dz) : INK; }
	function toneOf(info) { return alp ? info.d * (1 - 0.7 * info.L) : info.d; }

	if (par.mode === 0) {                                   /* AM halftone, 45 degrees */
		var a = cellPx / Math.SQRT2, umax = Math.ceil((W + H) / a) + 2;
		for (var u = -2; u < umax; u++) for (var v = -umax; v < umax; v++) {
			x = (u - v) * a; y = (u + v) * a;                /* lattice of pitch cell, turned 45 degrees */
			if (x < -cellPx || x > W + cellPx || y < -cellPx || y > H + cellPx) continue;
			info = toneAt(x, y);
			var t = info ? toneOf(info) : (alp ? 0 : dust * 0.07 * Math.pow(y / H, 4));
			if (t < 0.02) continue;
			var r = cellPx * Math.sqrt(t / Math.PI) * 1.05;
			add(info ? inkOf(info) : INK, 0, x - r, y - r, 2 * r, 2 * r);
		}
	} else if (par.mode === 1) {                            /* FM stipple */
		var b = Math.max(1.5, cellPx / 2.5);
		for (y = 0; y < H; y += b) for (x = 0; x < W; x += b) {
			info = toneAt(x, y);
			var t2 = info ? toneOf(info) : (alp ? 0 : dust * 0.04 * Math.pow(y / H, 4));
			if (t2 * t2 > hash(x / b, y / b) * 0.9) add(info ? inkOf(info) : INK, 1, x, y, b, b);
		}
	} else {                                                /* line screen: dashes along 15 degrees */
		var cs = Math.cos(Math.PI / 12), sn = Math.sin(Math.PI / 12), stepA = Math.max(1.5, cellPx / 3);
		for (var row = -Math.ceil(W * sn / cellPx) - 2; row < Math.ceil(H / cellPx) + 2; row++) {
			for (var along = 0; along < W / cs + cellPx; along += stepA) {
				x = along * cs; y = row * cellPx + along * sn;
				if (y < 0 || y > H) continue;
				info = toneAt(x, y);
				var t3 = info ? toneOf(info) : 0;
				if (t3 < 0.03) continue;
				var th = cellPx * t3 * 0.95;
				add(inkOf(info), 1, x, y - th / 2, stepA + 0.6, th);
			}
		}
	}
	flush();
}

function onresize() { mgraphics.redraw(); }
