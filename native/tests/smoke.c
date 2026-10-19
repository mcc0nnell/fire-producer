#define _POSIX_C_SOURCE 200809L
#include "fp_services.h"
#include <celix_bundle_context.h>
#include <celix_framework.h>
#include <celix_framework_factory.h>
#include <celix_properties.h>
#include <celix_constants.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
typedef struct {fp_command_t *c;int64_t seq;int rc;} call_t;
typedef struct {const char *cartridge,*slug;fp_state_t state;int rc;} snap_t;
static void apply(void *h,void *s){
    call_t *v=h;fp_authority_service_t *a=s;
    v->rc=a->command(a->handle,v->c,&v->seq);
}
static void snap(void *h,void *s){
    snap_t *v=h;fp_authority_service_t *a=s;
    v->rc=a->snapshot(a->handle,v->cartridge,v->slug,&v->state);
}
static int use(celix_bundle_context_t *ctx,void *handle,void (*fn)(void *,void *)){
    celix_service_use_options_t o={0};
    o.filter.serviceName=FP_AUTHORITY_SERVICE;
    o.filter.versionRange="[1.0.0,2.0.0)";
    o.callbackHandle=handle;o.use=fn;
    return celix_bundleContext_useServiceWithOptions(ctx,&o);
}
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x);return 1;}}while(0)
static int test(celix_bundle_context_t *ctx,int phase){
    fp_command_t c={.cartridge="football",.slug="demo",.type="SCORE",.idempotency_key="score-1",
       .actor_id="director",.team="home",.value=7,.ts_ms=10000};
    call_t v={.c=&c,.rc=-99};
    snap_t f={.cartridge="football",.slug="demo",.rc=-99};
    CHECK(use(ctx,&f,snap)&&f.rc==0);
    if(phase==1){
        CHECK(f.state.last_seq==0 && f.state.home_score==0);
        c.value=13;CHECK(use(ctx,&v,apply)&&v.rc==-2); /* fail closed */
        c.value=7;CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==1);
        CHECK(use(ctx,&v,apply)&&v.rc==1&&v.seq==1);
        CHECK(use(ctx,&f,snap)&&f.rc==0 && f.state.home_score==7 && f.state.last_seq==1);
        c.slug="another";c.idempotency_key="score-1";
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==1); /* production-scoped keys */
        c.slug="demo";c.type="START_CLOCK";c.idempotency_key="clock-start";c.ts_ms=10000;
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==2);
        CHECK(use(ctx,&v,apply)&&v.rc==1);
        c.type="STOP_CLOCK";c.idempotency_key="clock-stop";c.ts_ms=11500;
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==3);
        CHECK(use(ctx,&f,snap)&&f.rc==0 && f.state.clock_remaining_ms==718500);
        c.cartridge="captions";c.slug="main";c.type="SET_PARTIAL";
        c.idempotency_key="partial-1";c.text="hello";c.speaker="Alice";c.ts_ms=12000;
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==1);
        c.type="SET_STATUS";c.idempotency_key="pause";c.value=1;
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==2);
        c.type="SET_PARTIAL";c.idempotency_key="partial-rejected";
        CHECK(use(ctx,&v,apply)&&v.rc==-2);
        c.type="COMMIT";c.idempotency_key="final";c.text="Hello, Baltimore.";
        CHECK(use(ctx,&v,apply)&&v.rc==0&&v.seq==3);
    }else {
        CHECK(f.state.last_seq==3 && f.state.home_score==7 &&
              f.state.clock_remaining_ms==718500 && !f.state.clock_running);
        CHECK(use(ctx,&v,apply)&&v.rc==1&&v.seq==1);
        snap_t a={.cartridge="football",.slug="another",.rc=-99};
        CHECK(use(ctx,&a,snap)&&a.rc==0&&a.state.home_score==7);
        snap_t s={.cartridge="captions",.slug="main",.rc=-99};
        CHECK(use(ctx,&s,snap)&&s.rc==0 && s.state.last_seq==3 &&
              s.state.caption_paused && s.state.caption_final &&
              strcmp(s.state.caption,"Hello, Baltimore.")==0 &&
              strcmp(s.state.speaker,"Alice")==0);
        c.cartridge="unknown";c.slug="demo";c.type="RESET";c.idempotency_key="unknown";
        CHECK(use(ctx,&v,apply)&&v.rc==-3);
        CHECK(use(ctx,&f,snap)&&f.rc==0&&f.state.last_seq==3);
    }
    printf("PASS native phase %d\n",phase);return 0;
}
static int phase(const char *f,const char *cap,const char *auth,int n) {
    char cache[]="/tmp/fp-celix-XXXXXX";
    if(!mkdtemp(cache))return 1;
    celix_properties_t *p=celix_properties_create();
    celix_properties_set(p,CELIX_FRAMEWORK_CACHE_DIR,cache);
    celix_properties_setBool(p,CELIX_FRAMEWORK_CLEAN_CACHE_DIR_ON_CREATE,true);
    celix_framework_t *framework=celix_frameworkFactory_createFramework(p);
    if(!framework)return 1;
    celix_bundle_context_t *ctx=celix_framework_getFrameworkContext(framework);
    int ok=celix_bundleContext_installBundle(ctx,f,true)>=0 &&
           celix_bundleContext_installBundle(ctx,cap,true)>=0 &&
           celix_bundleContext_installBundle(ctx,auth,true)>=0;
    int rc=ok?test(ctx,n):1;
    celix_frameworkFactory_destroyFramework(framework);
    rmdir(cache);
    return rc;
}
int main(int argc,char **argv) {
    if(argc!=5){fprintf(stderr,"usage: fp_native_smoke DB football.zip captions.zip authority.zip\n");return 2;}
    unlink(argv[1]);
    char wal[2048],shm[2048];
    snprintf(wal,sizeof(wal),"%s-wal",argv[1]);snprintf(shm,sizeof(shm),"%s-shm",argv[1]);
    unlink(wal);unlink(shm);
    if(setenv("FP_DB_PATH",argv[1],1)!=0)return 2;
    int rc=phase(argv[2],argv[3],argv[4],1);
    if(!rc)rc=phase(argv[2],argv[3],argv[4],2);
    if(!rc)puts("PASS native Celix authority/replay/idempotency/validation/captions");
    return rc;
}
