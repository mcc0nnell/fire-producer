// SPDX-License-Identifier: Apache-2.0
// Conference-only write gate. Public conference state and WebSocket projections remain read-only.
export async function authorizedConferenceCommand(request:Request,secret?:string):Promise<boolean> {
  if (!secret || secret.length < 24) return false
  const supplied=request.headers.get('authorization')
  if (!supplied?.startsWith('Bearer ')) return false
  const candidate=supplied.slice(7)
  const bytes=new TextEncoder()
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',bytes.encode(secret)),crypto.subtle.digest('SHA-256',bytes.encode(candidate))])
  const left=new Uint8Array(a),right=new Uint8Array(b)
  let diff=0
  for(let i=0;i<left.length;i++) diff|=left[i]^right[i]
  return diff===0
}
