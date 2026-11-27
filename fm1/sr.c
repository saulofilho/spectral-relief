/* Spectral Relief, C port. See sr.h for the call order.
 * Fixed point: levels are Q15 (1.0 = 32768), tones and fractions Q8 (1.0 = 256),
 * ridge heights Q4 px. Mirrors assets/spectral-relief.js; where numbers differ the
 * comment says why. */
#include "sr.h"

#if SR_FFT_LOG != 10
#error "the twiddle recurrence below is written for a 1024-point FFT"
#endif

#define FMIN 30u
#define FMAX 14000u
#define Q15 32768
#define CLAMP(v, a, b) ((v) < (a) ? (a) : (v) > (b) ? (b) : (v))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define MIN(a, b) ((a) < (b) ? (a) : (b))

/* ------------------------------------------------------------------ tables (shared) */
static uint8_t tables_ready;
static int16_t NZ[2048];                 /* 1D value noise, Q15 */
static uint16_t ENV[257];                /* sqrt(sin(pi u)), Q15: the range rises from the edges */
static uint16_t P75[257];                /* x^0.75, Q8 (the site uses x^0.8) */
static int16_t TWC[SR_FFT_N / 2], TWS[SR_FFT_N / 2];
static int16_t WIN[SR_FFT_N];            /* Hann, Q15 */
static uint32_t FCOL[SR_COLS];           /* column centre, Hz */

static uint32_t isqrt64(uint64_t v)
{
    uint64_t r = 0, b = (uint64_t)1 << 62;
    while (b > v) b >>= 2;
    while (b) {
        if (v >= r + b) { v -= r + b; r = (r >> 1) + b; }
        else r >>= 1;
        b >>= 2;
    }
    return (uint32_t)r;
}

static inline uint32_t hsh(uint32_t x, uint32_t y, uint32_t k)
{
    uint32_t h = x * 0x27d4eb2du ^ y * 0x165667b1u ^ k * 0x9e3779b9u;
    h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12; h *= 0x297a2d39u; h ^= h >> 15;
    return h;
}

/* log2(x) in Q8 for x > 0: integer part from the leading bit, fraction with a parabolic fix */
static int32_t log2_q8(uint32_t x)
{
    int32_t e = 31 - __builtin_clz(x);
    uint32_t f = e >= 8 ? (x >> (e - 8)) & 0xFFu : (x << (8 - e)) & 0xFFu;
    return e * 256 + (int32_t)f + (int32_t)((f * (256u - f) * 89u) >> 16);
}

static void build_tables(void)
{
    uint32_t seed = 1234567u;             /* same generator as the site */
    for (int i = 0; i < 2048; i++) { seed = seed * 1664525u + 1013904223u; NZ[i] = (int16_t)(seed >> 17); }
    for (int k = 0; k <= 256; k++) {      /* Bhaskara sine, then square root */
        int32_t a = k * (256 - k);
        uint32_t s15 = (uint32_t)((16LL * a * 32768) / (5LL * 65536 - 4LL * a));
        ENV[k] = (uint16_t)MIN(32767u, isqrt64((uint64_t)s15 << 15));
        uint64_t x16 = (uint64_t)k << 8;   /* Q16 */
        uint64_t sq = isqrt64(x16 << 16);  /* x^0.5, Q16 */
        P75[k] = (uint16_t)(isqrt64(((x16 * sq) >> 16) << 16) >> 8);
    }
    /* twiddles: rotate (1, 0) by 2 pi / 1024 in Q30 */
    const int64_t C = 1073721611LL, S = 6588357LL;
    int64_t c = 1LL << 30, s = 0;
    for (uint32_t k = 0; k < SR_FFT_N / 2; k++) {
        TWC[k] = (int16_t)CLAMP((c + (1 << 14)) >> 15, -32767, 32767);
        TWS[k] = (int16_t)CLAMP((s + (1 << 14)) >> 15, -32767, 32767);
        int64_t nc = (c * C - s * S) >> 30, ns = (c * S + s * C) >> 30;
        c = nc; s = ns;
    }
    for (uint32_t n = 0; n < SR_FFT_N; n++) {
        int32_t cs = n < SR_FFT_N / 2 ? TWC[n] : -TWC[n - SR_FFT_N / 2];
        WIN[n] = (int16_t)((32767 - cs) >> 1);
    }
    /* column centres: f = 30 * (14000 / 30)^(c / 95), ratio found by bisection in Q24 */
    const uint64_t target = (uint64_t)FMAX * (1ull << 24) / FMIN;
    uint64_t lo = 1ull << 24, hi = 2ull << 24;
    for (int it = 0; it < 40; it++) {
        uint64_t mid = (lo + hi) / 2, p = 1ull << 24;
        for (uint32_t k = 0; k < SR_COLS - 1; k++) p = (p * mid) >> 24;
        if (p < target) lo = mid; else hi = mid;
    }
    uint64_t f = (uint64_t)FMIN << 24;
    for (uint32_t k = 0; k < SR_COLS; k++) { FCOL[k] = (uint32_t)((f + (1u << 23)) >> 24); f = (f * lo) >> 24; }
    tables_ready = 1;
}

uint32_t sr_column_hz(uint32_t c) { return FCOL[MIN(c, SR_COLS - 1)]; }

static inline int32_t vnoise(int64_t pos_q16)
{
    uint32_t i = (uint32_t)(pos_q16 >> 16), f = (uint32_t)(pos_q16 & 0xFFFF);
    int32_t a = NZ[i & 2047], b = NZ[(i + 1) & 2047];
    uint32_t s = (uint32_t)(((uint64_t)f * f >> 16) * (3u * 65536u - 2u * f) >> 16);   /* smoothstep, Q16 */
    return a + (int32_t)(((int64_t)(b - a) * s) >> 16);
}

/* ------------------------------------------------------------------ setup */
void sr_defaults(sr_params_t *p)
{
    p->mode = SR_AM; p->colour = SR_PRINT; p->dark = 0;
    p->planes = 22;              /* the site's 40 x 0.55 */
    p->cell_q4 = 50;             /* 4.5 px x 0.7 */
    p->height_q8 = 123;          /* 0.48 */
    p->jag_q8 = 115;             /* 0.45 */
    p->shift_q8 = 819;           /* 3.2 px per layer */
    p->trails_q8 = 0;            /* needs a full framebuffer, so off by default */
}

void sr_init(sr_t *s, uint32_t w, uint32_t h, uint32_t sample_rate)
{
    if (!tables_ready) build_tables();
    uint8_t *b = (uint8_t *)s;
    for (uint32_t i = 0; i < sizeof(*s); i++) b[i] = 0;
    sr_defaults(&s->p);
    s->W = MIN(w, SR_MAXW); s->H = MIN(h, SR_MAXH); s->fs = sample_rate;
    /* column edges at c +- 0.5 as geometric means of the neighbours, in FFT bins (Q6) */
    for (uint32_t c = 0; c < SR_COLS; c++) {
        uint64_t fc = FCOL[c];
        uint64_t fl = c ? isqrt64((uint64_t)FCOL[c - 1] * fc) : fc * fc / FCOL[1];
        uint64_t fh = c + 1 < SR_COLS ? isqrt64((uint64_t)FCOL[c + 1] * fc) : fc * fc / FCOL[c - 1];
        s->bin0[c] = (uint16_t)MIN(65535u, (uint32_t)((fl * SR_FFT_N * 64) / sample_rate));
        s->bin1[c] = (uint16_t)MIN(65535u, (uint32_t)((fh * SR_FFT_N * 64) / sample_rate));
    }
}

/* ------------------------------------------------------------------ spectrum */
void sr_feed(sr_t *s, const int16_t *x, uint32_t n, uint32_t stride)
{
    if (!stride) stride = 1;
    for (uint32_t i = 0; i < n; i++) { s->in[s->in_pos] = x[i * stride]; s->in_pos = (s->in_pos + 1) & (SR_FFT_N - 1); }
}

static int32_t re_[SR_FFT_N], im_[SR_FFT_N];
static uint16_t lev_[SR_FFT_N / 2 + 1];

static void fft(void)
{
    for (uint32_t i = 1, j = 0; i < SR_FFT_N; i++) {
        uint32_t bit = SR_FFT_N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { int32_t t = re_[i]; re_[i] = re_[j]; re_[j] = t; t = im_[i]; im_[i] = im_[j]; im_[j] = t; }
    }
    for (uint32_t len = 2; len <= SR_FFT_N; len <<= 1) {
        uint32_t half = len >> 1, step = SR_FFT_N / len;
        for (uint32_t i = 0; i < SR_FFT_N; i += len)
            for (uint32_t j = 0; j < half; j++) {
                int32_t wr = TWC[j * step], wi = -TWS[j * step];
                int32_t *ar = &re_[i + j], *ai = &im_[i + j], *br = &re_[i + j + half], *bi = &im_[i + j + half];
                int32_t tr = (int32_t)(((int64_t)*br * wr - (int64_t)*bi * wi + 16384) >> 15);
                int32_t ti = (int32_t)(((int64_t)*br * wi + (int64_t)*bi * wr + 16384) >> 15);
                *br = *ar - tr; *bi = *ai - ti; *ar += tr; *ai += ti;
            }
    }
}

static void box(const uint16_t *src, uint16_t *dst, int r)
{
    int32_t acc = 0, n = 0;
    for (int c = -r; c < (int)SR_COLS + r; c++) {
        if (c + r < (int)SR_COLS) { acc += src[c + r]; n++; }
        if (c - r - 1 >= 0) { acc -= src[c - r - 1]; n--; }
        if (c >= 0 && c < (int)SR_COLS) dst[c] = (uint16_t)(acc / n);
    }
}

/* isolated harmonics read as needles; blending in the blurred spectrum gives the range a body.
 * The site blurs 192 columns with radii 7, 7, 4; at 96 columns the radii halve. */
static void massif(uint16_t *live)
{
    static uint16_t a[SR_COLS], b[SR_COLS];
    box(live, a, 4); box(a, b, 3); box(b, a, 2);
    for (uint32_t c = 0; c < SR_COLS; c++) live[c] = (uint16_t)MIN(32767u, ((uint32_t)a[c] * 1206u + (uint32_t)live[c] * 389u) >> 10);
}

static void finish_columns(sr_t *s, const uint16_t *tmp)
{
    uint32_t sum = 0;
    for (uint32_t c = 0; c < SR_COLS; c++) {
        uint32_t l = tmp[c ? c - 1 : 0], m = tmp[c], r = tmp[MIN(c + 1, SR_COLS - 1)];
        s->live[c] = (uint16_t)((l * 51u + m * 154u + r * 51u) >> 8);
        sum += tmp[c];
    }
    massif(s->live);
    s->level_q15 = (uint16_t)(sum / SR_COLS);
    int32_t target = MIN(32767, s->level_q15 * 4);
    s->dust_q15 = (uint16_t)(s->dust_q15 + (((target - s->dust_q15) * 20) >> 8));
}

void sr_analyze(sr_t *s)
{
    if (s->frozen) return;
    for (uint32_t n = 0; n < SR_FFT_N; n++) {
        re_[n] = ((int32_t)s->in[(s->in_pos + n) & (SR_FFT_N - 1)] * WIN[n] + 16384) >> 15;
        im_[n] = 0;
    }
    fft();
    /* level = (dB + 96) / 78 like the site's analyser */
    const int32_t ref = log2_q8(32767u * (SR_FFT_N / 4));
    for (uint32_t k = 0; k <= SR_FFT_N / 2; k++) {
        uint32_t ar = (uint32_t)(re_[k] < 0 ? -re_[k] : re_[k]), ai = (uint32_t)(im_[k] < 0 ? -im_[k] : im_[k]);
        uint32_t mx = MAX(ar, ai), mn = MIN(ar, ai);
        uint32_t mag = (uint32_t)(((uint64_t)mx * 983u + (uint64_t)mn * 407u) >> 10);   /* alpha max + beta min */
        if (!mag) { lev_[k] = 0; continue; }
        /* Web Audio's analyser reads a full-scale sine near -13.5 dB (|X| / N, Blackman): match it */
        int32_t db_q8 = (((log2_q8(mag) - ref) * 1541) >> 8) - 3456;                  /* 6.02 dB per octave */
        lev_[k] = (uint16_t)CLAMP(((db_q8 + 96 * 256) * 420) >> 8, 0, 32767);
    }
    uint16_t tmp[SR_COLS];
    for (uint32_t c = 0; c < SR_COLS; c++) {
        uint32_t b0 = s->bin0[c], b1 = s->bin1[c], v = 0;
        if (b1 - b0 < 64) {
            uint32_t b = MAX((b0 + b1) >> 1, 64u), i = MIN(b >> 6, SR_FFT_N / 2 - 1), f = b & 63;   /* never the DC bin */
            v = (lev_[i] * (64 - f) + lev_[i + 1] * f) >> 6;
        } else {
            for (uint32_t i = (b0 + 63) >> 6; i <= MIN(b1 >> 6, SR_FFT_N / 2); i++) v = MAX(v, lev_[i]);
        }
        s->smooth[c] = (uint16_t)((s->smooth[c] * 141u + v * 115u) >> 8);            /* 0.55 / 0.45 */
        tmp[c] = (uint16_t)(((uint32_t)s->smooth[c] * s->smooth[c]) >> 15);           /* gamma 2 */
    }
    finish_columns(s, tmp);
}

void sr_set_columns(sr_t *s, const uint16_t *cols_q15)
{
    uint16_t tmp[SR_COLS];
    for (uint32_t c = 0; c < SR_COLS; c++) tmp[c] = cols_q15[c];
    uint32_t sum = 0;
    for (uint32_t c = 0; c < SR_COLS; c++) { s->live[c] = tmp[c]; sum += tmp[c]; }
    massif(s->live);
    s->level_q15 = (uint16_t)(sum / SR_COLS);
    int32_t target = MIN(32767, s->level_q15 * 4);
    s->dust_q15 = (uint16_t)(s->dust_q15 + (((target - s->dust_q15) * 20) >> 8));
}

void sr_tick(sr_t *s, uint32_t us)
{
    if (s->frozen) return;
    s->since_push_us += us;
    if (s->since_push_us > 1000000u) s->since_push_us = SR_PUSH_US;
    while (s->since_push_us >= SR_PUSH_US) {
        s->head = (s->head + 1) % SR_HMAX;
        for (uint32_t c = 0; c < SR_COLS; c++) s->ring[s->head][c] = s->live[c];
        s->since_push_us -= SR_PUSH_US;
    }
    s->phase_q8 = s->since_push_us * 256u / SR_PUSH_US;
}

int sr_peak_column(const sr_t *s)
{
    int best = -1; uint32_t bv = 3932;   /* 0.12 */
    for (uint32_t c = 2; c < SR_COLS - 2; c++) if (s->live[c] > bv) { bv = s->live[c]; best = (int)c; }
    return best;
}

/* ------------------------------------------------------------------ geometry */
typedef struct {
    int32_t sc_q8, offx_q8, front_q8, stepy_q8, ml_q8, span_q8, fog_q8, crease_q4, face_px;
} geo_t;

static void geometry(const sr_t *s, geo_t *g)
{
    uint32_t W = s->W, H = s->H, P = s->P;
    g->sc_q8 = (int32_t)(W * 256u / 900u);
    g->offx_q8 = (int32_t)((s->p.shift_q8 * (uint32_t)MAX(g->sc_q8, 90)) >> 8);
    g->front_q8 = (int32_t)(H * 243u);                 /* 0.95 H */
    g->stepy_q8 = (int32_t)(H * 128u / P);              /* 0.5 H over P layers */
    g->ml_q8 = (int32_t)(W * 1536u / 100u);             /* 0.06 W */
    g->span_q8 = (int32_t)(W * 22528u / 100u) - (int32_t)P * g->offx_q8;   /* 0.88 W minus the drift */
    g->fog_q8 = MAX(g->stepy_q8 * 22 / 10, (int32_t)(H * 1024u / 100u));
    g->crease_q4 = 24 * MAX(256, g->sc_q8) / 256;       /* 1.5 px */
    g->face_px = 40 * MAX(154, g->sc_q8) / 256;
}

void sr_frame(sr_t *s)
{
    uint32_t W = s->W, H = s->H;
    uint32_t P = CLAMP(s->p.planes, 6u, MIN(SR_MAXP, SR_HMAX - 1));
    s->P = P;
    geo_t g; geometry(s, &g);
    const int32_t phase = s->frozen ? 0 : (int32_t)s->phase_q8;
    const int64_t amp_q8 = (int64_t)H * s->p.height_q8;
    const int32_t nsc = MAX(g.sc_q8, 179);                  /* the site uses 0.4; below 0.7 the ridge turns to hair */
    /* rock undulation every ~16 px and a fine serration every ~2.2 px. The site uses 7 px for the
     * first; on a spectrum from a real FFT (taller, denser than the site's simulation) that reads as hair. */
    const int64_t kn1 = (65536LL * 256) / (16LL * nsc), kn2 = (65536LL * 2560) / (22LL * nsc);
    const int64_t ksp = ((int64_t)(SR_COLS - 1) << 32) / g.span_q8;   /* Q8 px -> Q16 column, scaled 2^16 */
    const int32_t jag = s->p.jag_q8;

    /* exp(-t / face fall) for t in whole pixels */
    {
        int64_t r = 65536 - 65536 / g.face_px + 65536 / (2 * g.face_px * g.face_px), e = 1LL << 30;
        for (uint32_t t = 0; t <= H; t++) { s->expt[t] = (uint16_t)MIN(32767, e >> 15); e = (e * r) >> 16; }
    }
    for (uint32_t p = 0; p < P; p++) {
        uint32_t idx = p == 0 ? (s->head + 1) % SR_HMAX : (s->head + SR_HMAX - (p - 1)) % SR_HMAX;
        const uint16_t *row = p == 0 ? s->live : s->ring[idx];
        int32_t z = p == 0 ? 0 : (int32_t)(p - 1) * 256 + phase;
        int32_t base = g.front_q8 - (int32_t)(((int64_t)z * g.stepy_q8) >> 8);
        s->z_q8[p] = z; s->base_q8[p] = base;
        s->fade_q8[p] = (uint16_t)(p == P - 1 ? 256 - phase : 256);
        int64_t ampP = (amp_q8 * (256 - z * 2 / (5 * (int32_t)P))) >> 8;     /* 1 - 0.4 z / P */
        int32_t xshift = (int32_t)(((int64_t)z * g.offx_q8) >> 8);
        int64_t seed1 = ((int64_t)idx * 4043571) & ((2048LL << 16) - 1);   /* idx x 61.7 */
        int64_t seed2 = (seed1 * 17 / 10) & ((2048LL << 16) - 1);
        for (uint32_t x = 0; x < W; x++) {
            int32_t xs = (int32_t)(x << 8) - xshift, num = xs - g.ml_q8;
            int64_t h = 0;
            if (num > 0 && num < g.span_q8) {
                int64_t cp = ((int64_t)num * ksp) >> 16;             /* Q16 */
                uint32_t i = (uint32_t)(cp >> 16), f = (uint32_t)(cp & 0xFFFF);
                uint32_t i1 = MIN(i + 1, SR_COLS - 1);
                h = ((int64_t)row[i] * (65536 - f) + (int64_t)row[i1] * f) >> 16;
                uint32_t u = (uint32_t)(cp / (SR_COLS - 1));          /* Q16 */
                uint32_t ui = u >> 8, uf = u & 255;
                int32_t env = (ENV[MIN(ui, 256u)] * (256 - (int32_t)uf) + ENV[MIN(ui + 1, 256u)] * (int32_t)uf) >> 8;
                h = ((h + 819) * env) >> 15;
                if (jag) {
                    int32_t n1 = vnoise(((xs * kn1) >> 8) + seed1) - 16384;
                    int32_t n2 = vnoise(((xs * kn2) >> 8) + seed2) - 16384;
                    int32_t mul = 32768 + ((jag * ((n1 * 307 >> 8) + (n2 * 90 >> 8))) >> 8);
                    h = (h * mul) >> 15;
                }
            }
            int64_t r = base - ((ampP * h) >> 15);
            s->ridge[p][x] = (int16_t)CLAMP(r >> 4, -32000, 32000);
        }
    }
}

/* ------------------------------------------------------------------ colour */
typedef struct { uint8_t r, g, b; } rgb_t;
#define HEX(v) {(uint8_t)((v) >> 16), (uint8_t)((v) >> 8), (uint8_t)(v)}
static const rgb_t PAPER = HEX(0xE5E4E0), INK = HEX(0x26282D);
static const rgb_t PAPER_D = HEX(0x242528), INK_D = HEX(0xD6D5D0);
static const rgb_t NONPHOTO = HEX(0x3F7FB5), WHITE = HEX(0xF2F4FF);
/* Alpenglow Neon: everything blue, cut by one low warm light */
static const rgb_t SKY[4] = {HEX(0x044185), HEX(0x3595F6), HEX(0x6B8DEE), HEX(0xAF83E9)};
static const rgb_t BODY[4] = {HEX(0x044A87), HEX(0x0656A4), HEX(0x7476E2), HEX(0xB177D8)};
static const rgb_t LIT[4] = {HEX(0xE39E64), HEX(0xE28868), HEX(0xD37C92), HEX(0xE193A3)};
static const rgb_t DOT[3] = {HEX(0x002732), HEX(0x044A87), HEX(0x6B8DEE)};
static const rgb_t FOG[2] = {HEX(0x1A8BEB), HEX(0x5D8DED)};

static inline rgb_t mix(rgb_t a, rgb_t b, int32_t t)   /* t in Q8 */
{
    t = CLAMP(t, 0, 256);
    rgb_t o = {(uint8_t)(a.r + (((b.r - a.r) * t) >> 8)), (uint8_t)(a.g + (((b.g - a.g) * t) >> 8)), (uint8_t)(a.b + (((b.b - a.b) * t) >> 8))};
    return o;
}
static inline rgb_t ramp(const rgb_t *c, int n, int32_t t)
{
    t = CLAMP(t, 0, 256);
    int32_t pos = t * (n - 1), i = MIN(pos >> 8, n - 2);
    return mix(c[i], c[i + 1], pos - i * 256);
}
static inline rgb_t jitter(rgb_t c, int32_t n)
{
    rgb_t o = {(uint8_t)CLAMP(c.r + n, 0, 255), (uint8_t)CLAMP(c.g + n, 0, 255), (uint8_t)CLAMP(c.b + n, 0, 255)};
    return o;
}

/* screen: alpha of ink (Q8) from tone t (Q8) at a pixel */
typedef struct { int32_t mode, p2, inv_am, k, ca, cb, fb; } screen_t;

static void screen_setup(const sr_t *s, screen_t *sc)
{
    int32_t c4 = MAX(32, s->p.cell_q4);
    sc->mode = s->p.mode;
    sc->p2 = MAX(2, (c4 * 181 / 128 + 8) >> 4);          /* the 45 degree lattice repeats every cell x sqrt 2 */
    sc->inv_am = (65536 * 128) / (sc->p2 * sc->p2);
    sc->k = s->p.mode == SR_AM ? c4 * 11 / 10 : c4 * 9 / 10;   /* Q4 */
    sc->ca = -271360 / c4; sc->cb = 1012941 / c4;           /* 15 degree lines */
    sc->fb = MAX(1, (c4 + 24) / 48);
}

static inline int32_t ink_alpha(const screen_t *sc, int32_t t, uint32_t x, uint32_t y)
{
    int32_t th;
    if (sc->mode == SR_FM) {
        th = (int32_t)(hsh(x / sc->fb, y / sc->fb, 3) >> 24);
        return (t * t >> 8) > th * 9 / 10 ? 256 : 0;
    }
    if (sc->mode == SR_AM) {
        int32_t a = (int32_t)((x + y) % (uint32_t)sc->p2) * 2 - sc->p2 + 1;
        int32_t b = (int32_t)((y + 65536u - x) % (uint32_t)sc->p2) * 2 - sc->p2 + 1;
        th = ((a * a + b * b) * sc->inv_am) >> 16;
    } else {
        int32_t v = (sc->ca * (int32_t)x + sc->cb * (int32_t)y) >> 8;
        th = 2 * (v & 255) - 256; if (th < 0) th = -th;
    }
    int32_t al = ((t - th) * sc->k) >> 4;
    return CLAMP(al, 0, 256);
}

/* Normal: the direction the surface faces, as RGB like p5's normalMaterial (+x red, up green, toward
 * the viewer blue, negatives clipped), brightest channel at full. Same formula as the site. */
static inline rgb_t normal_rgb(int32_t sl, int32_t e, int32_t dz)
{
    int32_t nx = CLAMP(sl * 256 / 72, -256, 256) * (77 + (179 * e >> 15)) >> 8;        /* Q8 */
    int32_t e3 = (int32_t)(((int64_t)e * e >> 15) * e >> 15);                          /* ~exp(-t / (0.35 fall)) */
    int32_t ny = (205 * e3 >> 15) + (38 * dz >> 8);
    int32_t l2 = nx * nx + ny * ny, nz = (int32_t)isqrt64((uint64_t)MAX(65536 - l2, 2621));
    int32_t r = MAX(nx, 0), g = MAX(ny, 0), mx = MAX(MAX(r, g), MAX(nz, 1));
    rgb_t c = {(uint8_t)(r * 255 / mx), (uint8_t)(g * 255 / mx), (uint8_t)(nz * 255 / mx)};
    return c;
}

/* trails: keep the brighter of the new pixel and the old one faded */
static inline uint32_t trail(uint32_t nw, uint32_t old, int32_t dec)
{
    uint32_t o = 0;
    for (int sh = 0; sh <= 16; sh += 8) {
        uint32_t a = (nw >> sh) & 255, b = (((old >> sh) & 255) * (uint32_t)dec) >> 8;
        o |= (a > b ? a : b) << sh;
    }
    return o;
}

/* fill one strip as 0xRRGGBB, front to back per column (the site's render(), step 2).
 * With blend set, Normal trails mix with what out[] already holds. */
static void fill(const sr_t *s, uint32_t y0, uint32_t rows, uint32_t *out, int blend)
{
    const uint32_t W = s->W, H = s->H, P = s->P, y1 = MIN(y0 + rows, H);
    geo_t g; geometry(s, &g);
    screen_t sc; screen_setup(s, &sc);
    const int alp = s->p.colour == SR_ALPENGLOW, nrm = s->p.colour == SR_NORMAL;
    const int trails = nrm && blend && s->p.trails_q8;
    const int32_t dec = 205 + (49 * s->p.trails_q8 >> 8);
    const rgb_t paper = s->p.dark ? PAPER_D : PAPER, ink = s->p.dark ? INK_D : INK;
    const int32_t sw = MAX(1, (5 * MAX(g.sc_q8, 128) + 128) >> 8);
    const int32_t inv_fog = (int32_t)((65536LL * 256) / g.fog_q8);
    const int32_t dust = s->dust_q15;
    rgb_t skyrow[SR_MAXH];
    if (alp) for (uint32_t y = y0; y < y1; y++) skyrow[y - y0] = ramp(SKY, 4, (int32_t)(y * 256u / H));

    for (uint32_t x = 0; x < W; x++) {
        int32_t top = (int32_t)H;
        for (uint32_t p = 0; p < P && top > (int32_t)y0; p++) {
            int32_t r = s->ridge[p][x];
            int32_t ry = MAX(0, (r + 15) >> 4);
            if (ry >= top) continue;
            int32_t diff = s->ridge[p][MIN(x + (uint32_t)sw, W - 1)] - s->ridge[p][x >= (uint32_t)sw ? x - (uint32_t)sw : 0];
            int32_t slope = diff * 16 / (5 * sw);                         /* Q8 px, x 0.4 */
            int32_t sl = CLAMP(-slope * 35 / 100, -72, 72);
            int32_t dz = s->z_q8[p] / (int32_t)P;                          /* Q8 */
            int32_t dark = 205 - (159 * P75[CLAMP(dz, 0, 256)] >> 8);
            int32_t crease_d = 61 * (256 - dz) >> 8;
            int32_t fogtop = s->base_q8[p] - g.fog_q8, fade = s->fade_q8[p];
            rgb_t body = paper, litc = paper, dot = ink, fogc = paper;
            if (alp) { body = ramp(BODY, 4, dz); litc = ramp(LIT, 4, dz); dot = ramp(DOT, 3, dz); fogc = ramp(FOG, 2, dz); }
            int32_t face = sl < 0 ? -sl * 256 / 72 : 0;                     /* faces turned to the sun */
            int32_t ya = MAX(ry, (int32_t)y0), yb = MIN(top, (int32_t)y1);
            for (int32_t y = ya; y < yb; y++) {
                int32_t t4 = y * 16 - r, tt = CLAMP(t4 >> 4, 0, (int32_t)H);
                int32_t e = s->expt[tt];
                int32_t d = dark + ((sl * e) >> 15);
                if (t4 < g.crease_q4) d += alp ? 0 : crease_d;
                int32_t m = CLAMP((int32_t)(((int64_t)(y * 256 - fogtop) * inv_fog) >> 16), 0, 256), m2 = m * m >> 8;
                d = d * (256 - (230 * m2 >> 8)) >> 8;
                uint32_t hh = hsh(x, (uint32_t)y, 7);
                d += ((int32_t)(hh & 255) - 128) * 36 >> 8;
                d = d * fade >> 8;
                rgb_t c;
                if (nrm) {
                    rgb_t n = normal_rgb(sl, e, dz);
                    int32_t a = ink_alpha(&sc, CLAMP(d, 0, 256), x, (uint32_t)y);
                    a = (int32_t)(((int64_t)a * (256 - (154 * dz >> 8)) * (256 - m2) * fade) >> 24);
                    c.r = (uint8_t)(n.r * a >> 8); c.g = (uint8_t)(n.g * a >> 8); c.b = (uint8_t)(n.b * a >> 8);
                } else if (alp) {
                    int32_t L = face * e >> 15;
                    if (t4 < 2 * g.crease_q4 + 16) L = MAX(L, 96 + face / 2);  /* rim light on the crest */
                    L = L * (256 - dz / 2) >> 8;
                    /* the mist at each base melts into the sky behind, more so far back: no hard horizon */
                    rgb_t mist = mix(fogc, skyrow[y - (int32_t)y0], 96 + dz * 5 / 8);
                    rgb_t b = mix(mix(body, litc, L), mist, m2);
                    int32_t a = ink_alpha(&sc, CLAMP(d * (256 - (L * 180 >> 8)) >> 8, 0, 256), x, (uint32_t)y);
                    c = jitter(mix(b, dot, a), (int32_t)((hh >> 8) & 7) - 3);
                } else {
                    int32_t a = ink_alpha(&sc, CLAMP(d, 0, 256), x, (uint32_t)y);
                    c = jitter(mix(paper, ink, a), (int32_t)((hh >> 8) & 7) - 4);
                }
                uint32_t i = (uint32_t)(y - (int32_t)y0) * W + x, v = ((uint32_t)c.r << 16) | ((uint32_t)c.g << 8) | c.b;
                out[i] = trails ? trail(v, out[i], dec) : v;
            }
            top = ry;
        }
        /* sky: print dust thickens toward the ridges; Alpenglow keeps it smooth with a few stars */
        int32_t yb = MIN(top, (int32_t)y1);
        for (int32_t y = (int32_t)y0; y < yb; y++) {
            uint32_t hh = hsh(x, (uint32_t)y, 11);
            rgb_t c;
            if (nrm) {
                uint32_t i = (uint32_t)(y - (int32_t)y0) * W + x;
                out[i] = trails ? trail(0, out[i], dec) : 0;
                continue;
            }
            if (alp) {
                c = skyrow[y - (int32_t)y0];
                if ((hh & 0xFFFF) > 65400u && y < (int32_t)(H * 40u / 100u)) c = mix(c, WHITE, 150);
            } else {
                int32_t q = y * 256 / MAX(top, 1), q4 = (q * q >> 8) * (q * q >> 8) >> 8;
                int32_t d = ((dust * 18) >> 15) * q4 >> 8;                 /* 0.07 x dust x q^4, Q8 */
                int32_t a = 0;
                if (d > 1) a = ink_alpha(&sc, sc.mode == SR_FM ? (int32_t)(isqrt64((uint64_t)d << 8) * 141 >> 8) : d, x, (uint32_t)y);
                c = jitter(mix(paper, ink, a), (int32_t)((hh >> 8) & 7) - 4);
            }
            out[(uint32_t)(y - (int32_t)y0) * W + x] = ((uint32_t)c.r << 16) | ((uint32_t)c.g << 8) | c.b;
        }
    }
}

void sr_strip888(const sr_t *s, uint32_t y0, uint32_t rows, uint32_t *px) { fill(s, y0, rows, px, 1); }

#define SR_BAND 16u
static uint32_t strip_tmp[SR_MAXW * SR_BAND];

static inline uint16_t to565(uint32_t c, int swap)
{
    uint16_t v = (uint16_t)(((c >> 8) & 0xF800u) | ((c >> 5) & 0x07E0u) | ((c >> 3) & 0x001Fu));
    return swap ? (uint16_t)((v >> 8) | (v << 8)) : v;
}

void sr_strip565(const sr_t *s, uint32_t y0, uint32_t rows, uint16_t *px, int swap)
{
    /* in bands of 16 rows so the RGB888 scratch stays small (15 KB at 240 px) */
    for (uint32_t done = 0; done < rows; done += SR_BAND) {
        uint32_t n = MIN(SR_BAND, rows - done);
        fill(s, y0 + done, n, strip_tmp, 0);
        const int trails = s->p.colour == SR_NORMAL && s->p.trails_q8;
        const int32_t dec = 205 + (49 * s->p.trails_q8 >> 8);
        for (uint32_t i = 0; i < n * s->W; i++) {
            uint16_t *o = &px[done * s->W + i];
            uint32_t v = strip_tmp[i];
            if (trails) {                    /* decode the pixel already there, fade it, keep the brighter */
                uint16_t q = swap ? (uint16_t)((*o >> 8) | (*o << 8)) : *o;
                uint32_t old = ((uint32_t)((q >> 11) << 3) << 16) | ((uint32_t)(((q >> 5) & 63) << 2) << 8) | (uint32_t)((q & 31) << 3);
                v = trail(v, old, dec);
            }
            *o = to565(v, swap);
        }
    }
}

/* ------------------------------------------------------------------ marks */
typedef struct { uint32_t y0, y1, W; uint32_t *p888; uint16_t *p565; int swap; uint32_t col; int th; } pen_t;

static void dot_(pen_t *pn, int32_t x, int32_t y)
{
    for (int32_t dy = 0; dy < pn->th; dy++) for (int32_t dx = 0; dx < pn->th; dx++) {
        int32_t X = x + dx, Y = y + dy;
        if (X < 0 || X >= (int32_t)pn->W || Y < (int32_t)pn->y0 || Y >= (int32_t)pn->y1) continue;
        uint32_t i = (uint32_t)(Y - (int32_t)pn->y0) * pn->W + (uint32_t)X;
        if (pn->p888) pn->p888[i] = pn->col; else pn->p565[i] = to565(pn->col, pn->swap);
    }
}
static void line_(pen_t *pn, int32_t x0, int32_t y0, int32_t x1, int32_t y1)
{
    int32_t dx = x1 > x0 ? x1 - x0 : x0 - x1, dy = y1 > y0 ? y0 - y1 : y1 - y0;
    int32_t sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
        dot_(pn, x0, y0);
        if (x0 == x1 && y0 == y1) break;
        int32_t e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}
static void arrow_(pen_t *pn, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t L)
{
    line_(pn, x0, y0, x1, y1);
    int32_t dx = x1 - x0, dy = y1 - y0, n = (int32_t)isqrt64((uint64_t)(dx * dx + dy * dy));
    if (!n) return;
    for (int k = -1; k <= 1; k += 2) {           /* rotate the back vector by +-0.4 rad */
        int32_t rx = (-dx * 236 - k * -dy * 100) / 256, ry = (-dy * 236 + k * -dx * 100) / 256;
        line_(pn, x1, y1, x1 + rx * L / n, y1 + ry * L / n);
    }
}

static void marks(const sr_t *s, pen_t *pn)
{
    geo_t g; geometry(s, &g);
    int32_t sc = CLAMP(g.sc_q8, 205, 333);       /* 0.8 .. 1.3 */
    int32_t W = (int32_t)s->W, H = (int32_t)s->H, P = (int32_t)s->P;
    pn->col = s->p.colour != SR_PRINT ? ((uint32_t)WHITE.r << 16 | (uint32_t)WHITE.g << 8 | WHITE.b)
                                         : ((uint32_t)NONPHOTO.r << 16 | (uint32_t)NONPHOTO.g << 8 | NONPHOTO.b);
    pn->th = MAX(1, (int32_t)((s->W * 256u / 900u + 128) >> 8));
    int32_t ml = g.ml_q8 >> 8, span = g.span_q8 >> 8, ya = H * 985 / 1000 - pn->th;
    arrow_(pn, ml, ya, ml + span + 10 * sc / 256, ya, 7 * sc / 256);
    static const int32_t TICK_Q8[3] = {4764, 13878, 22989};     /* columns of 100 Hz, 1 kHz, 10 kHz, Q8 */
    for (int k = 0; k < 3; k++) {
        int32_t x = ml + span * TICK_Q8[k] / ((SR_COLS - 1) * 256);
        line_(pn, x, ya, x, ya - 4 * sc / 256);
    }
    int32_t x0 = ml * 45 / 100, y0 = (g.front_q8 >> 8) - 8 * sc / 256;
    int32_t x1 = x0 + ((P - 1) * g.offx_q8 >> 8), y1 = (g.front_q8 - (P - 1) * g.stepy_q8) >> 8;
    arrow_(pn, x0, y0, x1, y1, 7 * sc / 256);
    int best = sr_peak_column(s);
    if (best >= 0) {
        int32_t x = ml + span * best / (int32_t)(SR_COLS - 1);
        int32_t ry = s->ridge[0][CLAMP(x, 0, W - 1)] >> 4, rad = 3 * sc / 256;
        for (int a = 0; a < 32; a++) {            /* small circle from a 32-step table */
            static const int8_t C32[32] = {64,63,59,53,45,36,24,12,0,-12,-24,-36,-45,-53,-59,-63,-64,-63,-59,-53,-45,-36,-24,-12,0,12,24,36,45,53,59,63};
            dot_(pn, x + C32[a] * rad / 64, ry + C32[(a + 8) & 31] * rad / 64);
        }
        line_(pn, x, ry - rad - 1, x, ry - 22 * sc / 256);
    }
}

void sr_marks888(const sr_t *s, uint32_t y0, uint32_t rows, uint32_t *px)
{
    pen_t pn = {y0, MIN(y0 + rows, s->H), s->W, px, 0, 0, 0, 1};
    marks(s, &pn);
}
void sr_marks565(const sr_t *s, uint32_t y0, uint32_t rows, uint16_t *px, int swap)
{
    pen_t pn = {y0, MIN(y0 + rows, s->H), s->W, 0, px, swap, 0, 1};
    marks(s, &pn);
}
