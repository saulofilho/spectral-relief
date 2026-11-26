/* Host harness for the FM-1 port: plays a small saw synth through the real FFT path,
 * steps the engine at 30 frames a second and writes the last frame as a PPM.
 *
 *   cc -O2 -I.. -DSR_MAXW=1600 -DSR_MAXH=1000 -DSR_MAXP=72 ../sr.c render.c -o render
 *   ./render -w 240 -h 240 -mode am -colour print -o out.ppm
 *
 * Options: -w -h  -mode am|fm|line  -colour print|alpenglow  -dark  -planes N  -cell PX
 *          -height F  -jag F  -shift PX  -pattern arp|pad|acid  -seconds S  -marks  -bench  -o FILE */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include "sr.h"

#define FS 44100
static sr_t S;
static uint32_t PX[SR_MAXW * SR_MAXH];
static uint16_t PX565[SR_MAXW * SR_MAXH];

typedef struct { double f, ph, env, vel, cut, t; int on; } voice_t;
static voice_t V[16];
static double lp1, lp2;

static double mtof(int m) { return 440.0 * pow(2.0, (m - 69) / 12.0); }
static void note(double f, double vel, double cut)
{
    for (int i = 0; i < 16; i++) if (!V[i].on || V[i].env < 0.001) {
        V[i] = (voice_t){f, 0, 1, vel, cut, 0, 1};
        return;
    }
}
static const int CH[4][3] = {{57, 60, 64}, {53, 57, 60}, {48, 52, 55}, {55, 59, 62}};
static const int ACID[16] = {45, 45, 57, 45, 48, 45, 55, 43, 45, 57, 45, 52, 45, 50, 48, 43};

static void step(int i, const char *pat)
{
    if (!strcmp(pat, "pad")) {
        if (i % 32 == 0) { const int *c = CH[(i / 32) % 4]; int ns[5] = {c[0] - 12, c[0], c[1], c[2], c[1] + 12}; for (int k = 0; k < 5; k++) note(mtof(ns[k]), 0.12, 900); }
    } else if (!strcmp(pat, "acid")) {
        note(mtof(ACID[i % 16]), i % 4 == 0 ? 0.32 : 0.22, i % 4 == 0 ? 1600 : 1000);
    } else {
        const int *c = CH[(i / 16) % 4]; static const int seq[16] = {0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3};
        int s = seq[i % 16];
        note(mtof(c[s % 3] + 12 * (s / 3)), 0.22, 1100);
        if (i % 8 == 0) note(mtof(c[0] - 12), 0.24, 700);
    }
}

static void synth(int16_t *out, int n, double *clock, int *stepi, const char *pat)
{
    const double s16 = 60.0 / 112.0 / 4.0;
    for (int k = 0; k < n; k++) {
        if (*clock >= s16) { *clock -= s16; step((*stepi)++, pat); }
        *clock += 1.0 / FS;
        double acc = 0, cut = 300;
        for (int i = 0; i < 16; i++) if (V[i].on) {
            voice_t *v = &V[i];
            v->ph += v->f / FS; if (v->ph >= 1) v->ph -= 1;
            double saw = 2 * v->ph - 1, sq = fmod(v->ph * 0.5, 1) < 0.5 ? 0.3 : -0.3;
            double rel = !strcmp(pat, "pad") ? 0.99997 : 0.99985;
            v->env *= rel; v->t += 1.0 / FS;
            acc += (saw + sq) * v->env * v->vel;
            double c = v->cut * (1 + 2.5 * exp(-v->t / 0.18));
            if (c > cut) cut = c;
            if (v->env < 0.0005) v->on = 0;
        }
        double a = 1 - exp(-2 * M_PI * cut / FS);        /* two one-pole lowpasses */
        lp1 += a * (acc - lp1); lp2 += a * (lp1 - lp2);
        double y = lp2 * 0.9;
        if (y > 1) y = 1; if (y < -1) y = -1;
        out[k] = (int16_t)(y * 32000);
    }
}

static void write_ppm(const char *path, const uint32_t *px, uint32_t w, uint32_t h)
{
    FILE *f = fopen(path, "wb");
    if (!f) { perror(path); exit(1); }
    fprintf(f, "P6\n%u %u\n255\n", w, h);
    for (uint32_t i = 0; i < w * h; i++) { unsigned char c[3] = {px[i] >> 16, px[i] >> 8, px[i]}; fwrite(c, 1, 3, f); }
    fclose(f);
}

int main(int argc, char **argv)
{
    uint32_t w = 240, h = 240; int marks = 0, bench = 0; double seconds = 6;
    const char *out = "out.ppm", *pat = "arp";
    sr_params_t p; sr_defaults(&p);
    for (int i = 1; i < argc; i++) {
        const char *a = argv[i], *v = i + 1 < argc ? argv[i + 1] : "";
        if (!strcmp(a, "-w")) { w = atoi(v); i++; }
        else if (!strcmp(a, "-h")) { h = atoi(v); i++; }
        else if (!strcmp(a, "-mode")) { p.mode = !strcmp(v, "fm") ? SR_FM : !strcmp(v, "line") ? SR_LINE : SR_AM; i++; }
        else if (!strcmp(a, "-colour")) { p.colour = !strcmp(v, "alpenglow") ? SR_ALPENGLOW : SR_PRINT; i++; }
        else if (!strcmp(a, "-dark")) p.dark = 1;
        else if (!strcmp(a, "-planes")) { p.planes = atoi(v); i++; }
        else if (!strcmp(a, "-cell")) { p.cell_q4 = (uint16_t)(atof(v) * 16); i++; }
        else if (!strcmp(a, "-height")) { p.height_q8 = (uint16_t)(atof(v) * 256); i++; }
        else if (!strcmp(a, "-jag")) { p.jag_q8 = (uint16_t)(atof(v) * 256); i++; }
        else if (!strcmp(a, "-shift")) { p.shift_q8 = (uint16_t)(atof(v) * 256); i++; }
        else if (!strcmp(a, "-pattern")) { pat = v; i++; }
        else if (!strcmp(a, "-seconds")) { seconds = atof(v); i++; }
        else if (!strcmp(a, "-marks")) marks = 1;
        else if (!strcmp(a, "-bench")) bench = 1;
        else if (!strcmp(a, "-o")) { out = v; i++; }
        else { fprintf(stderr, "unknown option %s\n", a); return 2; }
    }
    if (w > SR_MAXW || h > SR_MAXH) { fprintf(stderr, "max %ux%u in this build\n", SR_MAXW, SR_MAXH); return 2; }
    sr_init(&S, w, h, FS);
    S.p = p;
    int16_t blk[FS / 30];
    double clk = 1, cpu = 0; int stepi = 0, frames = (int)(seconds * 30);
    for (int fr = 0; fr < frames; fr++) {
        synth(blk, FS / 30, &clk, &stepi, pat);
        clock_t t0 = clock();
        sr_feed(&S, blk, FS / 30, 1);
        sr_analyze(&S);
        sr_tick(&S, 33333);
        sr_frame(&S);
        if (bench || fr == frames - 1) {
            for (uint32_t y = 0; y < h; y += 40) {         /* strips, like the firmware */
                uint32_t n = h - y < 40 ? h - y : 40;
                sr_strip565(&S, y, n, PX565 + y * w, 1);
            }
        }
        cpu += (double)(clock() - t0) / CLOCKS_PER_SEC;
    }
    for (uint32_t y = 0; y < h; y += 40) {
        uint32_t n = h - y < 40 ? h - y : 40;
        sr_strip888(&S, y, n, PX + y * w);
        if (marks) sr_marks888(&S, y, n, PX + y * w);
    }
    write_ppm(out, PX, w, h);
    int pk = sr_peak_column(&S);
    printf("%s: %ux%u, %u layers, peak %u Hz, level %.3f", out, w, h, S.P, pk >= 0 ? sr_column_hz(pk) : 0, S.level_q15 / 32768.0);
    if (bench) printf(", host %.2f ms per frame", cpu * 1000 / frames);
    printf("\n");
    return 0;
}
