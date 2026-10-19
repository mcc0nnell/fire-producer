#include "fp_services.h"
#include <celix_bundle_activator.h>
#include <celix_bundle_context.h>
#include <celix_properties.h>
#include <stdio.h>
#include <string.h>
typedef struct {long id; fp_cartridge_service_t service;} football_t;
static void initial(void *h, fp_state_t *s) {
    (void)h; memset(s,0,sizeof(*s));
    s->quarter=1;s->down=1;s->distance=10;s->ball_on=25;
    s->clock_remaining_ms=720000;strcpy(s->possession,"home");
    strcpy(s->caption,"Fire Producer live production ready.");
}
static int validate(void *h,const fp_state_t *s,const fp_command_t *c) {
    (void)h;
    if (!strcmp(c->type,"SCORE")) return (!c->team || (strcmp(c->team,"home") && strcmp(c->team,"away")) ||
         (c->value!=1 && c->value!=2 && c->value!=3 && c->value!=6 && c->value!=7 && c->value!=8)) ? -1:0;
    if (!strcmp(c->type,"SET_DOWN")) return (c->value<1 || c->value>4)?-1:0;
    if (!strcmp(c->type,"SET_BALL_ON")) return (c->value<1 || c->value>99)?-1:0;
    if (!strcmp(c->type,"SET_DISTANCE") || !strcmp(c->type,"SET_QUARTER")) return (c->value<1 || c->value>100000)?-1:0;
    if (!strcmp(c->type,"SET_CLOCK")) return (c->value<0 || c->value>86400000)?-1:0;
    if (!strcmp(c->type,"SET_POSSESSION")) return (!c->team || (strcmp(c->team,"home") && strcmp(c->team,"away")))?-1:0;
    if (!strcmp(c->type,"START_CLOCK")) return s->clock_running?-1:0;
    if (!strcmp(c->type,"STOP_CLOCK") || !strcmp(c->type,"RESET")) return 0;
    if (!strcmp(c->type,"CAPTION")) return (!c->text || strlen(c->text)>240)?-1:0;
    return -1;
}
static void apply(void *h,fp_state_t *s,const fp_command_t *c,int64_t seq) {
    (void)h;
    if (!strcmp(c->type,"RESET")) {int64_t rev=s->revision+1;initial(NULL,s);s->last_seq=seq;s->revision=rev;return;}
    s->revision++;s->last_seq=seq;
    if (!strcmp(c->type,"SCORE")) {int *score=!strcmp(c->team,"home")?&s->home_score:&s->away_score;*score+=(int)c->value;}
    else if (!strcmp(c->type,"SET_DOWN"))s->down=(int)c->value;
    else if (!strcmp(c->type,"SET_DISTANCE"))s->distance=(int)c->value;
    else if (!strcmp(c->type,"SET_BALL_ON"))s->ball_on=(int)c->value;
    else if (!strcmp(c->type,"SET_QUARTER"))s->quarter=(int)(c->value>9?9:c->value);
    else if (!strcmp(c->type,"SET_POSSESSION"))snprintf(s->possession,sizeof(s->possession),"%s",c->team);
    else if (!strcmp(c->type,"SET_CLOCK")) {s->clock_running=0;s->clock_remaining_ms=c->value;s->clock_anchor_ms=0;}
    else if (!strcmp(c->type,"START_CLOCK")) {s->clock_running=1;s->clock_anchor_ms=c->ts_ms;}
    else if (!strcmp(c->type,"STOP_CLOCK") && s->clock_running) {
        int64_t elapsed=c->ts_ms-s->clock_anchor_ms;
        if (elapsed<0)elapsed=0;
        s->clock_remaining_ms=elapsed>=s->clock_remaining_ms?0:s->clock_remaining_ms-elapsed;
        s->clock_running=0;s->clock_anchor_ms=0;
    }
    else if (!strcmp(c->type,"CAPTION"))snprintf(s->caption,sizeof(s->caption),"%s",c->text);
}
static celix_status_t start(football_t *x, celix_bundle_context_t *ctx) {
    x->service=(fp_cartridge_service_t){.handle=x,.validate=validate,.apply=apply,.initial=initial};
    celix_properties_t *p=celix_properties_create();
    celix_properties_set(p,"cartridge.id","football");
    celix_service_registration_options_t o=CELIX_EMPTY_SERVICE_REGISTRATION_OPTIONS;
    o.svc=&x->service;o.serviceName=FP_CARTRIDGE_SERVICE;o.serviceVersion=FP_SERVICE_VERSION;o.properties=p;
    x->id=celix_bundleContext_registerServiceWithOptions(ctx,&o);
    return x->id>=0?CELIX_SUCCESS:CELIX_SERVICE_EXCEPTION;
}
static celix_status_t stop(football_t *x,celix_bundle_context_t *ctx) {
    if(x->id>=0)celix_bundleContext_unregisterService(ctx,x->id);
    return CELIX_SUCCESS;
}
CELIX_GEN_BUNDLE_ACTIVATOR(football_t,start,stop)
