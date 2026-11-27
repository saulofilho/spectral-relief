// Builds the Max for Live device from plain JSON, so the patch stays reviewable in git.
//   node m4l/build.mjs
// Writes m4l/Spectral Relief.amxd (Audio Effect) and m4l/sr.fft~.maxpat (the pfft~ subpatch).
// The .amxd needs spectral-relief-v8.js and sr.fft~.maxpat next to it until it is frozen in Live.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appversion = { major: 8, minor: 6, revision: 0, architecture: "x64", modernui: 1 };

let n = 0;
const boxes = [], lines = [];
function obj(text, rect, extra = {}) {
  const id = `obj-${++n}`;
  boxes.push({ box: { id, maxclass: "newobj", text, patching_rect: rect, ...extra } });
  return id;
}
function box(maxclass, rect, extra = {}) {
  const id = `obj-${++n}`;
  boxes.push({ box: { id, maxclass, patching_rect: rect, ...extra } });
  return id;
}
const wire = (a, ao, b, bi) => lines.push({ patchline: { source: [a, ao], destination: [b, bi] } });
const sig = k => Array(k).fill("signal");

// ------------------------------------------------------------------ pfft~ subpatch
function fftPatch() {
  const bx = [], ln = [];
  const add = (id, text, rect, ni, no, ot) => bx.push({ box: { id, maxclass: "newobj", text, patching_rect: rect, numinlets: ni, numoutlets: no, outlettype: ot } });
  add("f-1", "fftin~ 1 hanning", [20, 20, 110, 22], 1, 3, ["signal", "signal", "signal"]);
  add("f-2", "cartopol~", [20, 60, 70, 22], 2, 2, ["signal", "signal"]);
  add("f-3", "in 2", [180, 20, 40, 22], 0, 1, [""]);
  add("f-4", "poke~ sr_unset", [20, 110, 120, 22], 3, 0, []);
  ln.push({ patchline: { source: ["f-1", 0], destination: ["f-2", 0] } });
  ln.push({ patchline: { source: ["f-1", 1], destination: ["f-2", 1] } });
  ln.push({ patchline: { source: ["f-2", 0], destination: ["f-4", 0] } });
  ln.push({ patchline: { source: ["f-1", 2], destination: ["f-4", 1] } });
  ln.push({ patchline: { source: ["f-3", 0], destination: ["f-4", 0] } });   // "set <buffer>"
  return { patcher: { fileversion: 1, appversion, classnamespace: "box", rect: [100, 100, 400, 200], boxes: bx, lines: ln } };
}

// ------------------------------------------------------------------ device
const W = 560, H = 169;
const inL = obj("plugin~ 2", [20, 20, 70, 22], { numinlets: 2, numoutlets: 2, outlettype: sig(2) });
const out = obj("plugout~ 2", [20, 330, 70, 22], { numinlets: 2, numoutlets: 0 });
wire(inL, 0, out, 0); wire(inL, 1, out, 1);                     // the audio passes untouched
const sum = obj("+~", [120, 60, 30, 22], { numinlets: 2, numoutlets: 1, outlettype: sig(1) });
const half = obj("*~ 0.5", [120, 90, 45, 22], { numinlets: 2, numoutlets: 1, outlettype: sig(1) });
wire(inL, 0, sum, 0); wire(inL, 1, sum, 1); wire(sum, 0, half, 0);
const pfft = obj("pfft~ sr.fft~ 2048 2", [120, 150, 130, 22], { numinlets: 2, numoutlets: 0 });
wire(half, 0, pfft, 0);
obj("buffer~ ---srspec @samps 1024 1", [300, 150, 190, 22], { numinlets: 1, numoutlets: 2, outlettype: ["float", "bang"] });

const lb = obj("loadbang", [300, 20, 60, 22], { numinlets: 1, numoutlets: 1, outlettype: ["bang"] });
const tb = obj("t b b b", [300, 50, 60, 22], { numinlets: 1, numoutlets: 3, outlettype: ["bang", "bang", "bang"] });
const setPoke = box("message", [300, 110, 120, 22], { text: "set ---srspec", numinlets: 2, numoutlets: 1, outlettype: [""] });
const setJs = box("message", [430, 110, 130, 22], { text: "setbuf ---srspec", numinlets: 2, numoutlets: 1, outlettype: [""] });
const dsp = obj("dspstate~", [580, 80, 70, 22], { numinlets: 1, numoutlets: 4, outlettype: ["int", "float", "int", "int"] });
const psr = obj("prepend sr", [580, 110, 70, 22], { numinlets: 1, numoutlets: 1, outlettype: [""] });
wire(lb, 0, tb, 0); wire(tb, 2, setPoke, 0); wire(tb, 1, setJs, 0); wire(tb, 0, dsp, 0);
wire(setPoke, 0, pfft, 1); wire(dsp, 1, psr, 0);

const view = box("v8ui", [300, 200, 388, 161], {
  filename: "spectral-relief-v8.js", numinlets: 1, numoutlets: 1, outlettype: [""],
  presentation: 1, presentation_rect: [4, 4, 388, 161], border: 0, parameter_enable: 0,
});
wire(setJs, 0, view, 0); wire(psr, 0, view, 0);

// controls: live.* objects so Live saves them with the set and can map them
const ctl = [];
function tab(name, items, msg, y) {
  const id = box("live.tab", [880, 200 + ctl.length * 40, 100, 20], {
    numinlets: 1, numoutlets: 3, outlettype: ["", "", "float"], parameter_enable: 1,
    num_lines_patching: 1, num_lines_presentation: 1, presentation: 1, presentation_rect: [398, y, 158, 17],
    varname: name, fontsize: 9,
    saved_attribute_attributes: { valueof: { parameter_enum: items, parameter_longname: name, parameter_shortname: name, parameter_type: 2, parameter_mmax: items.length - 1, parameter_initial: [0], parameter_initial_enable: 1 } },
  });
  const pre = obj(`prepend ${msg}`, [880, 222 + ctl.length * 40, 90, 22], { numinlets: 1, numoutlets: 1, outlettype: [""] });
  wire(id, 0, pre, 0); wire(pre, 0, view, 0); ctl.push(id);
}
function dial(name, msg, min, max, init, x, y, unit) {
  const id = box("live.dial", [1000, 200 + ctl.length * 40, 44, 48], {
    numinlets: 1, numoutlets: 2, outlettype: ["", "float"], parameter_enable: 1,
    presentation: 1, presentation_rect: [x, y, 44, 48], varname: name, fontsize: 9,
    saved_attribute_attributes: { valueof: { parameter_longname: name, parameter_shortname: name, parameter_type: 0, parameter_mmin: min, parameter_mmax: max, parameter_initial: [init], parameter_initial_enable: 1, parameter_unitstyle: unit } },
  });
  const pre = obj(`prepend ${msg}`, [1060, 222 + ctl.length * 40, 90, 22], { numinlets: 1, numoutlets: 1, outlettype: [""] });
  wire(id, 0, pre, 0); wire(pre, 0, view, 0); ctl.push(id);
}
tab("Ink", ["dots", "stipple", "lines"], "mode", 4);
tab("Colour", ["print", "alpenglow", "normal"], "colour", 24);
dial("Depth", "planes", 8, 48, 24, 398, 44, 0);            // 0 = int
dial("Height", "height", 0.15, 0.75, 0.48, 455, 44, 5);     // 5 = percent
dial("Rough", "jag", 0, 1, 0.45, 512, 44, 5);
dial("Screen", "cell", 2.5, 8, 4, 398, 98, 1);             // 1 = float
dial("Trails", "trails", 0, 1, 0.6, 455, 98, 5);           // Normal only
const frz = box("live.text", [1000, 600, 44, 18], {
  numinlets: 1, numoutlets: 2, outlettype: ["", ""], parameter_enable: 1, mode: 0, text: "freeze", texton: "frozen",
  presentation: 1, presentation_rect: [512, 116, 44, 15], varname: "Freeze",
  saved_attribute_attributes: { valueof: { parameter_enum: ["val1", "val2"], parameter_longname: "Freeze", parameter_shortname: "Freeze", parameter_type: 2, parameter_mmax: 1 } },
});
const pf = obj("prepend freeze", [1000, 630, 90, 22], { numinlets: 1, numoutlets: 1, outlettype: [""] });
wire(frz, 0, pf, 0); wire(pf, 0, view, 0);

const device = {
  patcher: {
    fileversion: 1, appversion, classnamespace: "box", rect: [80, 80, 1200, 700],
    openinpresentation: 1, default_fontsize: 10, default_fontname: "Arial",
    devicewidth: W, description: "Spectral Relief: the spectrum as a printed mountain range",
    boxes, lines, dependency_cache: [
      { name: "spectral-relief-v8.js", bootpath: ".", type: "TEXT", implicit: 1 },
      { name: "sr.fft~.maxpat", bootpath: ".", type: "JSON", implicit: 1 },
    ],
  },
};

// .amxd: "ampf" header, device type "aaaa" (Audio Effect), an empty meta chunk, then the patch
function amxd(json) {
  const body = Buffer.from(JSON.stringify(json, null, "\t") + "\n\0", "utf8");
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  return Buffer.concat([Buffer.from("ampf"), u32(4), Buffer.from("aaaa"), Buffer.from("meta"), u32(4), u32(0), Buffer.from("ptch"), u32(body.length), body]);
}

writeFileSync(join(here, "sr.fft~.maxpat"), JSON.stringify(fftPatch(), null, "\t") + "\n");
writeFileSync(join(here, "Spectral Relief.maxpat"), JSON.stringify(device, null, "\t") + "\n");
writeFileSync(join(here, "Spectral Relief.amxd"), amxd(device));
console.log(`device: ${boxes.length} boxes, ${lines.length} lines, ${W} x ${H}`);
