#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define FP_CARTRIDGE_SERVICE "org.fireproducer.cartridge"
#define FP_AUTHORITY_SERVICE "org.fireproducer.authority"
#define FP_SERVICE_VERSION "1.0.0"
typedef struct {
    const char *cartridge, *slug, *type, *idempotency_key, *actor_id;
    const char *team, *text, *speaker, *language;
    int64_t ts_ms, value;
} fp_command_t;
typedef struct {
    int64_t last_seq, revision;
    int home_score, away_score, quarter, down, distance, ball_on;
    int64_t clock_remaining_ms, clock_anchor_ms;
    int clock_running, caption_paused, caption_final;
    char possession[8], caption[501], speaker[81], language[33];
} fp_state_t;
typedef struct {
    void *handle;
    int (*validate)(void *, const fp_state_t *, const fp_command_t *);
    void (*apply)(void *, fp_state_t *, const fp_command_t *, int64_t);
    void (*initial)(void *, fp_state_t *);
} fp_cartridge_service_t;
typedef struct {
    void *handle;
    /* 0 accepted, 1 duplicate; -1 invalid request; -2 rejected by cartridge;
       -3 cartridge not installed; -4 SQLite error. */
    int (*command)(void *, const fp_command_t *, int64_t *);
    int (*snapshot)(void *, const char *cartridge, const char *slug, fp_state_t *);
} fp_authority_service_t;
#ifdef __cplusplus
}
#endif
