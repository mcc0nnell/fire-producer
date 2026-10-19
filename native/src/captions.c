#include "fp_services.h"
#include <celix_bundle_activator.h>
#include <celix_bundle_context.h>
#include <celix_properties.h>
#include <stdio.h>
#include <string.h>
typedef struct {long id;fp_cartridge_service_t service;} captions_t;
static void initial(void *h,fp_state_t *s) {
    (void)h;memset(s,0,sizeof(*s));strcpy(s->language,"en-US");
}
static int validate(void *h,const fp_state_t *s,const fp_command_t *c) {
    (void)h;
    if (!strcmp(c->type,"SET_PARTIAL")||!strcmp(c->type,"COMMIT")) {
        if(!c->text || strlen(c->text)>500 || (c->speaker && strlen(c->speaker)>80))return -1;
        if(!strcmp(c->type,"COMMIT") && strspn(c->text," \n\t\r")==strlen(c->text))return -1;
        return !strcmp(c->type,"SET_PARTIAL") && s->caption_paused?-1:0;
    }
    if(!strcmp(c->type,"SET_STATUS"))return c->value!=0 && c->value!=1?-1:0;
    if(!strcmp(c->type,"SET_LANGUAGE"))return (!c->language || strlen(c->language)>32)?-1:0;
    if(!strcmp(c->type,"CLEAR")||!strcmp(c->type,"RESET"))return 0;
    return -1;
}
static void apply(void *h,fp_state_t *s,const fp_command_t *c,int64_t seq) {
    (void)h;
    if(!strcmp(c->type,"RESET")){int64_t rev=s->revision+1;initial(NULL,s);s->last_seq=seq;s->revision=rev;return;}
    s->last_seq=seq;s->revision++;
    if(!strcmp(c->type,"SET_PARTIAL")||!strcmp(c->type,"COMMIT")) {
        snprintf(s->caption,sizeof(s->caption),"%s",c->text);
        snprintf(s->speaker,sizeof(s->speaker),"%s",c->speaker?c->speaker:"");
        s->caption_final=!strcmp(c->type,"COMMIT");
    } else if(!strcmp(c->type,"CLEAR")){s->caption[0]=0;s->speaker[0]=0;s->caption_final=0;}
    else if(!strcmp(c->type,"SET_STATUS"))s->caption_paused=(int)c->value;
    else if(!strcmp(c->type,"SET_LANGUAGE"))snprintf(s->language,sizeof(s->language),"%s",c->language[0]?c->language:"en-US");
}
static celix_status_t start(captions_t *x,celix_bundle_context_t *ctx) {
    x->service=(fp_cartridge_service_t){.handle=x,.validate=validate,.apply=apply,.initial=initial};
    celix_properties_t *p=celix_properties_create();celix_properties_set(p,"cartridge.id","captions");
    celix_service_registration_options_t o=CELIX_EMPTY_SERVICE_REGISTRATION_OPTIONS;
    o.svc=&x->service;o.serviceName=FP_CARTRIDGE_SERVICE;o.serviceVersion=FP_SERVICE_VERSION;o.properties=p;
    x->id=celix_bundleContext_registerServiceWithOptions(ctx,&o);
    return x->id>=0?CELIX_SUCCESS:CELIX_SERVICE_EXCEPTION;
}
static celix_status_t stop(captions_t *x,celix_bundle_context_t *ctx) {
    if(x->id>=0)celix_bundleContext_unregisterService(ctx,x->id);
    return CELIX_SUCCESS;
}
CELIX_GEN_BUNDLE_ACTIVATOR(captions_t,start,stop)
