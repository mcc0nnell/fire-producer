#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Bounded, read-only Tronix scheduler probe -> conference readiness event.
// Does NOT issue playout commands, control devices, or create an authority.
import {pathToFileURL} from 'node:url'
import path from 'node:path'

const env=process.env
const interval=Number(env.TRONIX_POLL_MS||15000)
const once=process.argv.includes('--once')
if (!env.TRONIX_SOCKET?.startsWith('/') || !env.TRONIX_CLIENT_PATH?.startsWith('/') ||
    !env.PRODUCER_TOKEN || env.PRODUCER_TOKEN.length<24 ||
    !env.FIRE_PRODUCER_URL || !Number.isInteger(interval)||interval<5000) {
  console.error('Configure TRONIX_SOCKET, TRONIX_CLIENT_PATH, PRODUCER_TOKEN (24+ chars), FIRE_PRODUCER_URL and optional TRONIX_POLL_MS (>=5000)')
  process.exit(2)
}
const endpoint=new URL(env.FIRE_PRODUCER_URL)
if(endpoint.username||endpoint.password||endpoint.hash||endpoint.search||
   !(endpoint.protocol==='https:' || (endpoint.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))) {
  console.error('FIRE_PRODUCER_URL must be HTTPS or loopback HTTP with no credentials/query/hash')
  process.exit(2)
}
const clientFile=path.resolve(env.TRONIX_CLIENT_PATH)
const {TronixClient}=await import(pathToFileURL(clientFile).href)
const client=new TronixClient(env.TRONIX_SOCKET)
const slug=env.CONFERENCE_SLUG||'dc27'
if(!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) throw Error('Invalid conference slug')
const target=new URL(`/api/events/conference/${slug}/command`,endpoint)
let lastStatus=''
let lastNote=''

async function publish(status,note) {
  if(status===lastStatus && note===lastNote)return
  const response=await fetch(target,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${env.PRODUCER_TOKEN}`},
    body:JSON.stringify({type:'SET_SIGNAL',roomId:'show',signal:'tronix',status,note,idempotencyKey:crypto.randomUUID()}),
    signal:AbortSignal.timeout(5000),
  })
  if(!response.ok) throw Error(`Conference signal rejected: HTTP ${response.status}`)
  lastStatus=status;lastNote=note
  console.log(`tronix scheduler: ${status}; ${note}`)
}
async function tick(){
  let status='fault'
  let note='Tronix IPC unavailable'
  try{
    const ping=await client.ping()
    if(!ping || ping.ok!==true) throw Error('ping rejected')
    const snapshot=await client.snapshot()
    if(!snapshot || snapshot.ok!==true) throw Error('snapshot rejected')
    status='ok'
    // No unbounded counters/queue fields published and no false hardware health claim.
    note='Tronix scheduler reachable (not AV equipment telemetry)'
  }catch(e){console.error('Tronix probe failed:',e instanceof Error?e.message:String(e))}
  await publish(status,note)
}
if(once){await tick()}
else{
  while(true){
    try{await tick()}catch(e){console.error('Status publish failed:',e instanceof Error?e.message:String(e))}
    await new Promise(resolve=>setTimeout(resolve,interval))
  }
}
