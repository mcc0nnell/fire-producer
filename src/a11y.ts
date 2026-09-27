let statusToken = 0
let alertToken = 0

function region(id:string) { return document.getElementById(id) }

function speak(id:string, message:string, kind:'status'|'alert') {
  const el=region(id)
  if(!el||!message.trim()) return
  const token=kind==='status'?++statusToken:++alertToken
  el.textContent=''
  queueMicrotask(()=>{
    if((kind==='status'?statusToken:alertToken)!==token)return
    el.textContent=message
  })
}

export function announceStatus(message:string){speak('sr-status',message,'status')}
export function announceAlert(message:string){speak('sr-alert',message,'alert')}
export function announceCaption(speaker:string,text:string){announceStatus(`${speaker?`${speaker}: `:''}${text}`)}
