#define _POSIX_C_SOURCE 200809L
#include "fp_services.h"
#include <celix_bundle_context.h>
#include <celix_framework.h>
#include <celix_framework_factory.h>
#include <celix_constants.h>
#include <celix_properties.h>
#include <jansson.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <sys/types.h>
#include <signal.h>
#include <errno.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define FP_MAX_REQUEST 16384
static volatile sig_atomic_t stopping=0;
static void signal_stop(int sig){(void)sig;stopping=1;}
static json_t *error(const char *message){return json_pack("{s:b,s:s}","ok",0,"error",message);}
static const char *string(json_t *obj,const char *key){
    json_t *v=json_object_get(obj,key);
    return json_is_string(v)?json_string_value(v):NULL;
}
static int64_t integer(json_t *obj,const char *key,int64_t default_value) {
    json_t *v=json_object_get(obj,key);
    return json_is_integer(v)?(int64_t)json_integer_value(v):default_value;
}
static int64_t unix_ms(void) {
    struct timespec ts;clock_gettime(CLOCK_REALTIME,&ts);
    return (int64_t)ts.tv_sec*1000+ts.tv_nsec/1000000;
}
static json_t *state_json(const char *cartridge,const char *slug,const fp_state_t *s){
    json_t *out=json_pack("{s:s,s:s,s:I,s:I}",
       "cartridge",cartridge,"slug",slug,"revision",(json_int_t)s->revision,
       "lastSeq",(json_int_t)s->last_seq);
    if(!strcmp(cartridge,"football")) {
        json_object_set_new(out,"homeScore",json_integer(s->home_score));
        json_object_set_new(out,"awayScore",json_integer(s->away_score));
        json_object_set_new(out,"quarter",json_integer(s->quarter));
        json_object_set_new(out,"down",json_integer(s->down));
        json_object_set_new(out,"distance",json_integer(s->distance));
        json_object_set_new(out,"ballOn",json_integer(s->ball_on));
        json_object_set_new(out,"possession",json_string(s->possession));
        json_object_set_new(out,"clockRemainingMs",json_integer(s->clock_remaining_ms));
        json_object_set_new(out,"clockRunning",json_boolean(s->clock_running));
        json_object_set_new(out,"clockAnchoredAt",s->clock_running?json_integer(s->clock_anchor_ms):json_null());
        json_object_set_new(out,"caption",json_string(s->caption));
    } else if(!strcmp(cartridge,"captions")){
        json_object_set_new(out,"status",json_string(s->caption_paused?"paused":"live"));
        json_object_set_new(out,"language",json_string(s->language));
        json_object_set_new(out,"currentText",json_string(s->caption));
        json_object_set_new(out,"speaker",json_string(s->speaker));
        json_object_set_new(out,"final",json_boolean(s->caption_final));
    }
    return out;
}
typedef struct {
    const fp_command_t *command;
    const char *cartridge,*slug;
    int state_only, rc, command_rc;
    int64_t seq;
    fp_state_t snapshot;
} action_t;
static void use_authority(void *handle,void *svc){
    action_t *a=handle;
    fp_authority_service_t *fp=svc;
    if(!a->state_only){
        a->command_rc=fp->command(fp->handle,a->command,&a->seq);
        if(a->command_rc!=0 && a->command_rc!=1){a->rc=a->command_rc;return;}
    }
    a->rc=a->state_only?fp->snapshot(fp->handle,a->cartridge,a->slug,&a->snapshot):
         fp->snapshot(fp->handle,a->command->cartridge,a->command->slug,&a->snapshot);
}
static json_t *handle_request(celix_bundle_context_t *ctx,json_t *req){
    if(!json_is_object(req))return error("request must be a JSON object");
    const char *op=string(req,"action");
    const char *cartridge=string(req,"cartridge");
    const char *slug=string(req,"slug");
    if(!op || !cartridge || !slug)return error("action, cartridge, slug are required");
    if(strcmp(op,"state") && strcmp(op,"command"))return error("unsupported action");
    if(strcmp(cartridge,"football") && strcmp(cartridge,"captions"))return error("unsupported native cartridge");
    fp_command_t c={0};
    action_t a={.state_only=!strcmp(op,"state"),.cartridge=cartridge,.slug=slug,.rc=-3};
    if(!a.state_only) {
        json_t *body=json_object_get(req,"command");
        if(!json_is_object(body))return error("command object required");
        c.cartridge=cartridge;c.slug=slug;c.type=string(body,"type");
        c.idempotency_key=string(body,"idempotencyKey");
        c.actor_id=string(req,"actorId");
        if(!c.actor_id)c.actor_id="local-operator";
        c.team=string(body,"team");c.text=string(body,"text");
        c.speaker=string(body,"speaker");c.language=string(body,"language");
        c.ts_ms=unix_ms();
        const char *type=c.type;
        if(!type || !c.idempotency_key)return error("command type and idempotencyKey required");
        if(!strcmp(type,"SCORE"))c.value=integer(body,"points",INT64_MIN);
        else if(!strcmp(type,"SET_DOWN"))c.value=integer(body,"down",INT64_MIN);
        else if(!strcmp(type,"SET_BALL_ON"))c.value=integer(body,"ballOn",INT64_MIN);
        else if(!strcmp(type,"SET_DISTANCE"))c.value=integer(body,"distance",INT64_MIN);
        else if(!strcmp(type,"SET_QUARTER"))c.value=integer(body,"quarter",INT64_MIN);
        else if(!strcmp(type,"SET_CLOCK"))c.value=integer(body,"remainingMs",INT64_MIN);
        else if(!strcmp(type,"SET_STATUS")) {
            const char *status=string(body,"status");
            if(!status|| (strcmp(status,"live") && strcmp(status,"paused")))return error("invalid caption status");
            c.value=!strcmp(status,"paused");
        }
        a.command=&c;
    }
    celix_service_use_options_t o={0};
    o.filter.serviceName=FP_AUTHORITY_SERVICE;
    o.filter.versionRange="[1.0.0,2.0.0)";
    o.callbackHandle=&a;o.use=use_authority;
    if(!celix_bundleContext_useServiceWithOptions(ctx,&o))return error("native authority unavailable");
    if(a.rc<0){
        const char *message=a.rc==-1?"invalid command/identity":a.rc==-2?"rejected transition":
                            a.rc==-3?"cartridge not installed":"journal failure";
        return json_pack("{s:b,s:s,s:i}","ok",0,"error",message,"code",a.rc);
    }
    json_t *res=json_pack("{s:b,s:o}","ok",1,"state",state_json(cartridge,slug,&a.snapshot));
    if(!a.state_only) {
        json_object_set_new(res,"seq",json_integer(a.seq));
        json_object_set_new(res,"applied",json_boolean(a.command_rc==0));
    }
    return res;
}
static int receive_line(int fd,char *buf,size_t cap){
    size_t pos=0;
    while(pos+1<cap){
        ssize_t n=recv(fd,buf+pos,1,0);
        if(n<0 && errno==EINTR)continue;
        if(n<=0)return -1;
        if(buf[pos]=='\n'){buf[pos]=0;return 0;}
        pos++;
    }
    return -1;
}
static void client(int fd,celix_bundle_context_t *ctx){
    struct timeval timeout={.tv_sec=3,.tv_usec=0};
    setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
    setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
    char buf[FP_MAX_REQUEST];
    json_t *reply=NULL;
    if(receive_line(fd,buf,sizeof(buf))!=0)reply=error("invalid, incomplete or oversized frame");
    else {
        json_error_t parse;
        json_t *req=json_loads(buf,JSON_REJECT_DUPLICATES,&parse);
        if(!req)reply=error("invalid JSON or duplicate key");
        else {reply=handle_request(ctx,req);json_decref(req);}
    }
    if(!reply)reply=error("internal error");
    char *wire=json_dumps(reply,JSON_COMPACT);
    if(wire){size_t size=strlen(wire);size_t pos=0;
        while(pos<size){
            ssize_t n=send(fd,wire+pos,size-pos,MSG_NOSIGNAL);
            if(n<0 && errno==EINTR)continue;
            if(n<=0)break;
            pos+=(size_t)n;
        }
        send(fd,"\n",1,MSG_NOSIGNAL);
        free(wire);
    }
    json_decref(reply);
}
int main(int argc,char **argv){
    if(argc!=6){fprintf(stderr,"usage: fire-producerd SOCKET SQLITE football.zip captions.zip authority.zip\n");return 2;}
    const char *path=argv[1];
    if(path[0]!='/' || strlen(path)>=sizeof(((struct sockaddr_un*)0)->sun_path)){
        fprintf(stderr,"socket path must be absolute and fit sockaddr_un\n");return 2;
    }
    struct stat existing;
    if(lstat(path,&existing)==0){fprintf(stderr,"refusing to replace existing socket/path\n");return 2;}
    if(setenv("FP_DB_PATH",argv[2],1)!=0)return 2;
    char cache[]="/tmp/fire-producer-celix-XXXXXX";
    if(!mkdtemp(cache))return 3;
    celix_properties_t *p=celix_properties_create();
    celix_properties_set(p,CELIX_FRAMEWORK_CACHE_DIR,cache);
    celix_properties_setBool(p,CELIX_FRAMEWORK_CLEAN_CACHE_DIR_ON_CREATE,true);
    celix_framework_t *framework=celix_frameworkFactory_createFramework(p);
    if(!framework){rmdir(cache);return 3;}
    celix_bundle_context_t *ctx=celix_framework_getFrameworkContext(framework);
    if(celix_bundleContext_installBundle(ctx,argv[3],true)<0 ||
       celix_bundleContext_installBundle(ctx,argv[4],true)<0 ||
       celix_bundleContext_installBundle(ctx,argv[5],true)<0){
        fprintf(stderr,"failed to load required bundles\n");
        celix_frameworkFactory_destroyFramework(framework);rmdir(cache);return 3;
    }
    int fd=socket(AF_UNIX,SOCK_STREAM|SOCK_CLOEXEC,0);
    struct sockaddr_un addr={0};addr.sun_family=AF_UNIX;strcpy(addr.sun_path,path);
    mode_t old=umask(0077);
    int bound=fd>=0 && bind(fd,(struct sockaddr *)&addr,sizeof(addr))==0;
    umask(old);
    if(bound && listen(fd,16)!=0)bound=0;
    if(bound){
        chmod(path,0600);
        struct sigaction sa={0};sa.sa_handler=signal_stop;sigemptyset(&sa.sa_mask);
        sigaction(SIGINT,&sa,NULL);sigaction(SIGTERM,&sa,NULL);
        puts("FIRE_PRODUCER_CELIX_READY");fflush(stdout);
        while(!stopping){
            int conn=accept(fd,NULL,NULL);
            if(conn<0){if(errno==EINTR)continue;break;}
            client(conn,ctx);close(conn);
        }
    }else fprintf(stderr,"failed to open local control socket\n");
    if(fd>=0)close(fd);
    if(bound)unlink(path);
    celix_frameworkFactory_destroyFramework(framework);
    rmdir(cache);
    return bound?0:4;
}
