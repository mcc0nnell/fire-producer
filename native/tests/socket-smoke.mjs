import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {connect} from 'node:net'
import {existsSync, rmSync} from 'node:fs'

const [exe, socketPath, dbPath, football, captions, authority] = process.argv.slice(2)
assert.ok(exe && socketPath && dbPath && football && captions && authority)
for (const path of [socketPath, dbPath, dbPath+'-wal', dbPath+'-shm']) {
  if (existsSync(path)) rmSync(path)
}
let daemon
async function launch() {
  daemon = spawn(exe,[socketPath,dbPath,football,captions,authority],{stdio:['ignore','pipe','pipe']})
  let output=''
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('daemon not ready: '+output)),8000)
    daemon.stdout.on('data',(chunk)=>{
      output+=chunk.toString()
      if(output.includes('FIRE_PRODUCER_CELIX_READY')){clearTimeout(timeout);resolve()}
    })
    daemon.stderr.on('data',(chunk)=>{output+=chunk.toString()})
    daemon.once('exit',(code)=>{clearTimeout(timeout);reject(new Error('daemon exited '+code+': '+output))})
  })
}
async function stop(){
  if(!daemon || daemon.exitCode!==null)return
  const child=daemon
  const done=new Promise((resolve)=>child.once('exit',resolve))
  child.kill('SIGTERM')
  await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('daemon did not stop')),3000))])
}
function call(msg){
  return new Promise((resolve,reject)=>{
    const socket=connect({path:socketPath})
    let bytes=''
    socket.on('connect',()=>socket.write(typeof msg==='string'?msg+'\n':JSON.stringify(msg)+'\n'))
    socket.on('data',(chunk)=>{bytes+=chunk.toString()})
    socket.on('end',()=>{try{resolve(JSON.parse(bytes))}catch(e){reject(e)}})
    socket.on('error',reject)
  })
}
const footballRequest={action:'command',cartridge:'football',slug:'test',
  command:{type:'SCORE',team:'home',points:7,idempotencyKey:'td-1'}}
try{
  await launch()
  assert.equal((await call({action:'state',cartridge:'football',slug:'test'})).state.homeScore,0)
  let response=await call({...footballRequest,command:{...footballRequest.command,points:13}})
  assert.equal(response.ok,false)
  response=await call(footballRequest)
  assert.equal(response.ok,true);assert.equal(response.applied,true);assert.equal(response.seq,1)
  assert.equal(response.state.homeScore,7)
  response=await call(footballRequest)
  assert.equal(response.ok,true);assert.equal(response.applied,false);assert.equal(response.seq,1)
  response=await call({...footballRequest,slug:'other'})
  assert.equal(response.seq,1);assert.equal(response.state.homeScore,7)
  response=await call({action:'command',cartridge:'captions',slug:'main',
    command:{type:'SET_PARTIAL',idempotencyKey:'p1',text:'Hello',speaker:'Host'}})
  assert.equal(response.seq,1);assert.equal(response.state.final,false)
  response=await call({action:'command',cartridge:'captions',slug:'main',
    command:{type:'SET_STATUS',idempotencyKey:'paused',status:'paused'}})
  assert.equal(response.state.status,'paused')
  response=await call({action:'command',cartridge:'captions',slug:'main',
    command:{type:'COMMIT',idempotencyKey:'final',text:'Good evening.',speaker:'Host'}})
  assert.equal(response.state.currentText,'Good evening.')
  assert.equal(response.state.final,true)
  assert.equal((await call('{"action":"state","action":"state","cartridge":"football","slug":"test"}')).ok,false)
  await stop()
  assert.equal(existsSync(socketPath),false)
  await launch()
  assert.equal((await call({action:'state',cartridge:'football',slug:'test'})).state.homeScore,7)
  response=await call({action:'state',cartridge:'captions',slug:'main'})
  assert.equal(response.state.currentText,'Good evening.')
  assert.equal(response.state.final,true)
  console.log('PASS native JSON socket command, idempotency, captions, and restart')
}finally{
  await stop()
}
