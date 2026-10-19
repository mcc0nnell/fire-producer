#include "fp_services.h"
#include <celix_bundle_activator.h>
#include <celix_bundle_context.h>
#include <pthread.h>
#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
    celix_bundle_context_t *ctx;
    sqlite3 *db;
    pthread_mutex_t lock;
    long service_id;
    fp_authority_service_t service;
} authority_t;
typedef struct {
    authority_t *owner;
    const char *cartridge, *slug;
    const fp_command_t *command;
    fp_state_t *state;
    int64_t seq;
    int result;
    int mode; /* 0 snapshot, 1 validate */
} invocation_t;
static int bounded(const char *s,size_t max) {return s && *s && strnlen(s,max+1)<=max;}
static int valid_identity(const char *s) {
    if(!bounded(s,64))return 0;
    for(const unsigned char *p=(const unsigned char*)s;*p;p++)
        if(!((*p>='a'&&*p<='z')||(*p>='0'&&*p<='9')||*p=='-'||*p=='_'))return 0;
    return 1;
}
static int exec_sql(sqlite3 *db,const char *sql) {
    return sqlite3_exec(db,sql,NULL,NULL,NULL)==SQLITE_OK?0:-4;
}
static void bind_text(sqlite3_stmt *st,int col,const char *v) {
    sqlite3_bind_text(st,col,v?v:"",-1,SQLITE_TRANSIENT);
}
static const char *column(sqlite3_stmt *st,int idx) {
    const unsigned char *v=sqlite3_column_text(st,idx);
    return v?(const char*)v:"";
}
static int project(authority_t *x,const char *cartridge,const char *slug,
                   fp_cartridge_service_t *reducer,fp_state_t *state) {
    reducer->initial(reducer->handle,state);
    sqlite3_stmt *st=NULL;
    const char *sql="SELECT seq,type,actor,team,text,speaker,language,ts,value "
                    "FROM production_event WHERE cartridge=? AND slug=? ORDER BY seq";
    if(sqlite3_prepare_v2(x->db,sql,-1,&st,NULL)!=SQLITE_OK)return -4;
    bind_text(st,1,cartridge);bind_text(st,2,slug);
    int rc,result=0;int64_t expected=1;
    while((rc=sqlite3_step(st))==SQLITE_ROW) {
        int64_t seq=sqlite3_column_int64(st,0);
        if(seq!=expected++){result=-4;break;}
        fp_command_t e={0};
        e.cartridge=cartridge;e.slug=slug;e.type=column(st,1);
        e.actor_id=column(st,2);e.team=column(st,3);e.text=column(st,4);
        e.speaker=column(st,5);e.language=column(st,6);
        e.ts_ms=sqlite3_column_int64(st,7);e.value=sqlite3_column_int64(st,8);
        reducer->apply(reducer->handle,state,&e,seq);
    }
    if(rc!=SQLITE_DONE && result==0)result=-4;
    sqlite3_finalize(st);
    return result;
}
static void with_reducer(void *handle,void *svc) {
    invocation_t *i=handle;
    fp_cartridge_service_t *r=svc;
    i->result=project(i->owner,i->cartridge,i->slug,r,i->state);
    if(i->result==0 && i->mode==1)
        i->result=r->validate(r->handle,i->state,i->command)==0?0:-2;
}
static int dispatch(invocation_t *i) {
    char filter[128];
    int n=snprintf(filter,sizeof(filter),"(cartridge.id=%s)",i->cartridge);
    if(n<=0 || (size_t)n>=sizeof(filter))return -1;
    celix_service_use_options_t o={0};
    o.filter.serviceName=FP_CARTRIDGE_SERVICE;
    o.filter.versionRange="[1.0.0,2.0.0)";
    o.filter.filter=filter;o.callbackHandle=i;o.use=with_reducer;
    i->result=-3;
    return celix_bundleContext_useServiceWithOptions(i->owner->ctx,&o)?i->result:-3;
}
static int state_locked(authority_t *x,const char *cartridge,const char *slug,fp_state_t *out) {
    invocation_t i={.owner=x,.cartridge=cartridge,.slug=slug,.state=out,.mode=0,.result=-3};
    return dispatch(&i);
}
static int snapshot(void *handle,const char *cartridge,const char *slug,fp_state_t *out) {
    authority_t *x=handle;
    if(!out || !valid_identity(cartridge) || !valid_identity(slug))return -1;
    pthread_mutex_lock(&x->lock);
    int result=state_locked(x,cartridge,slug,out);
    pthread_mutex_unlock(&x->lock);
    return result;
}
static int command(void *handle,const fp_command_t *c,int64_t *seq) {
    authority_t *x=handle;
    if(!c || !seq || !valid_identity(c->cartridge) || !valid_identity(c->slug) ||
       !bounded(c->type,32) || !bounded(c->idempotency_key,128) ||
       !bounded(c->actor_id,64) || c->ts_ms<0 ||
       (c->team && strlen(c->team)>16) || (c->text && strlen(c->text)>500) ||
       (c->speaker && strlen(c->speaker)>80) ||
       (c->language && strlen(c->language)>32))return -1;
    *seq=0;
    pthread_mutex_lock(&x->lock);
    int result=exec_sql(x->db,"BEGIN IMMEDIATE");
    if(result!=0)goto done;
    sqlite3_stmt *st=NULL;
    const char *dupe="SELECT seq FROM production_event WHERE cartridge=? AND slug=? AND dedupe_key=?";
    if(sqlite3_prepare_v2(x->db,dupe,-1,&st,NULL)!=SQLITE_OK) {result=-4;goto rollback;}
    bind_text(st,1,c->cartridge);bind_text(st,2,c->slug);bind_text(st,3,c->idempotency_key);
    int step=sqlite3_step(st);
    if(step==SQLITE_ROW){*seq=sqlite3_column_int64(st,0);result=1;}
    else if(step!=SQLITE_DONE)result=-4;
    sqlite3_finalize(st);st=NULL;
    if(result!=0)goto rollback;
    fp_state_t state={0};
    invocation_t i={.owner=x,.cartridge=c->cartridge,.slug=c->slug,
                    .command=c,.state=&state,.mode=1,.result=-3};
    result=dispatch(&i);
    if(result!=0)goto rollback;
    *seq=state.last_seq+1;
    const char *insert="INSERT INTO production_event "
        "(cartridge,slug,seq,dedupe_key,type,actor,team,text,speaker,language,ts,value)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
    if(sqlite3_prepare_v2(x->db,insert,-1,&st,NULL)!=SQLITE_OK){result=-4;goto rollback;}
    bind_text(st,1,c->cartridge);bind_text(st,2,c->slug);
    sqlite3_bind_int64(st,3,*seq);bind_text(st,4,c->idempotency_key);
    bind_text(st,5,c->type);bind_text(st,6,c->actor_id);
    bind_text(st,7,c->team);bind_text(st,8,c->text);
    bind_text(st,9,c->speaker);bind_text(st,10,c->language);
    sqlite3_bind_int64(st,11,c->ts_ms);sqlite3_bind_int64(st,12,c->value);
    result=sqlite3_step(st)==SQLITE_DONE?0:-4;
    sqlite3_finalize(st);st=NULL;
    if(result!=0)goto rollback;
    result=exec_sql(x->db,"COMMIT");
    if(result==0)goto done;
rollback:
    exec_sql(x->db,"ROLLBACK");
done:
    pthread_mutex_unlock(&x->lock);
    return result;
}
static celix_status_t start(authority_t *x,celix_bundle_context_t *ctx) {
    x->ctx=ctx;x->service_id=-1;
    if(pthread_mutex_init(&x->lock,NULL)!=0)return CELIX_SERVICE_EXCEPTION;
    const char *path=getenv("FP_DB_PATH");
    if(!path||!*path)path="fire-producer.sqlite";
    if(sqlite3_open_v2(path,&x->db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,NULL)!=SQLITE_OK)
        goto fail;
    sqlite3_busy_timeout(x->db,5000);
    if(exec_sql(x->db,"PRAGMA journal_mode=WAL") || exec_sql(x->db,"PRAGMA synchronous=FULL") ||
       exec_sql(x->db,"CREATE TABLE IF NOT EXISTS production_event ("
          "cartridge TEXT NOT NULL, slug TEXT NOT NULL, seq INTEGER NOT NULL,"
          "dedupe_key TEXT NOT NULL, type TEXT NOT NULL, actor TEXT NOT NULL,"
          "team TEXT, text TEXT, speaker TEXT, language TEXT, ts INTEGER NOT NULL,"
          "value INTEGER NOT NULL, PRIMARY KEY(cartridge,slug,seq),"
          "UNIQUE(cartridge,slug,dedupe_key))"))goto fail;
    x->service=(fp_authority_service_t){.handle=x,.command=command,.snapshot=snapshot};
    celix_service_registration_options_t o=CELIX_EMPTY_SERVICE_REGISTRATION_OPTIONS;
    o.svc=&x->service;o.serviceName=FP_AUTHORITY_SERVICE;o.serviceVersion=FP_SERVICE_VERSION;
    x->service_id=celix_bundleContext_registerServiceWithOptions(ctx,&o);
    if(x->service_id>=0)return CELIX_SUCCESS;
fail:
    if(x->db)sqlite3_close(x->db);
    pthread_mutex_destroy(&x->lock);
    return CELIX_SERVICE_EXCEPTION;
}
static celix_status_t stop(authority_t *x,celix_bundle_context_t *ctx) {
    if(x->service_id>=0)celix_bundleContext_unregisterService(ctx,x->service_id);
    sqlite3_close(x->db);
    pthread_mutex_destroy(&x->lock);
    return CELIX_SUCCESS;
}
CELIX_GEN_BUNDLE_ACTIVATOR(authority_t,start,stop)
