/* Spectral Relief: the C port of the site's drawing engine, for the FM-1 (240 x 240, RGB565).
 *
 * No framebuffer, no libm, no allocation. Integer math in the per-frame path.
 * The firmware draws the screen in strips (see gfx.c in the FM-1 firmwares), so the
 * renderer fills any band of rows into a caller buffer:
 *
 *   sr_init(&s, 240, 240, 44100);
 *   audio block  -> sr_feed(&s, samples, n, stride)     (copies into a 1024-sample ring)
 *   every frame  -> sr_analyze(&s);                     (FFT -> 96 log columns)
 *                   sr_tick(&s, elapsed_us);            (pushes a layer 12 times a second)
 *                   sr_frame(&s);                       (ridges for this frame)
 *                   for each strip: sr_strip565(&s, y0, rows, px, 1); lcd_blit(...)
 *
 * RAM on the device defaults: 26 KB of state (sr_t), 8 KB FFT work, 15 KB strip scratch,
 * 6 KB of tables. On the host, 240 x 240 takes under 1 ms a frame; the device is not measured yet. */
#ifndef SPECTRAL_RELIEF_H
#define SPECTRAL_RELIEF_H
#include <stdint.h>

#ifndef SR_MAXW
#define SR_MAXW 240u          /* widest surface */
#endif
#ifndef SR_MAXH
#define SR_MAXH 240u
#endif
#ifndef SR_MAXP
#define SR_MAXP 28u           /* most layers drawn at once */
#endif
#define SR_COLS 96u           /* log columns, 30 Hz -> 14 kHz */
#define SR_HMAX 48u           /* layers of history (4 s at 12 layers/s) */
#define SR_FFT_LOG 10u
#define SR_FFT_N (1u << SR_FFT_LOG)
#define SR_PUSH_US 83333u     /* 12 layers per second */

enum { SR_AM = 0, SR_FM = 1, SR_LINE = 2 };       /* print screen */
enum { SR_PRINT = 0, SR_ALPENGLOW = 1 };          /* colour */

typedef struct {
    uint8_t mode;          /* SR_AM / SR_FM / SR_LINE */
    uint8_t colour;        /* SR_PRINT / SR_ALPENGLOW */
    uint8_t planes;        /* layers drawn, 6..SR_MAXP */
    uint8_t dark;          /* print colour on a dark ground (light ink) */
    uint16_t cell_q4;      /* screen cell in px, Q4 (3.0 px = 48) */
    uint16_t height_q8;    /* range height as a fraction of H, Q8 (0.48 = 123) */
    uint16_t jag_q8;       /* roughness, Q8 */
    uint16_t shift_q8;     /* diagonal drift in px per layer, Q8 */
} sr_params_t;

typedef struct {
    sr_params_t p;
    uint32_t W, H, fs;
    /* audio */
    int16_t in[SR_FFT_N];
    uint32_t in_pos;
    uint16_t bin0[SR_COLS], bin1[SR_COLS];   /* column -> FFT bin range, Q6 */
    uint16_t live[SR_COLS];                  /* current spectrum, Q15 */
    uint16_t smooth[SR_COLS];
    uint16_t level_q15;                      /* mean energy, drives the dust */
    uint16_t dust_q15;
    /* history */
    uint16_t ring[SR_HMAX][SR_COLS];
    uint32_t head, since_push_us;
    uint8_t frozen;
    /* frame */
    int16_t ridge[SR_MAXP][SR_MAXW];         /* ridge y per layer and column, Q4 px */
    int32_t base_q8[SR_MAXP], z_q8[SR_MAXP];
    uint16_t fade_q8[SR_MAXP];
    uint16_t expt[SR_MAXH + 1];              /* exp(-t / face fall), Q15 */
    uint32_t P, phase_q8;
} sr_t;

void sr_defaults(sr_params_t *p);
void sr_init(sr_t *s, uint32_t w, uint32_t h, uint32_t sample_rate);
void sr_feed(sr_t *s, const int16_t *x, uint32_t n, uint32_t stride);
void sr_analyze(sr_t *s);
void sr_set_columns(sr_t *s, const uint16_t *cols_q15);  /* bypass the FFT (tests, other sources) */
void sr_tick(sr_t *s, uint32_t elapsed_us);
void sr_frame(sr_t *s);
void sr_strip565(const sr_t *s, uint32_t y0, uint32_t rows, uint16_t *px, int byteswap);
void sr_strip888(const sr_t *s, uint32_t y0, uint32_t rows, uint32_t *px);
/* Non-photo-blue diagram marks (frequency axis, time arrow, peak marker), drawn over a strip. */
void sr_marks888(const sr_t *s, uint32_t y0, uint32_t rows, uint32_t *px);
void sr_marks565(const sr_t *s, uint32_t y0, uint32_t rows, uint16_t *px, int byteswap);
int sr_peak_column(const sr_t *s);           /* loudest column or -1 */
uint32_t sr_column_hz(uint32_t c);

#endif
