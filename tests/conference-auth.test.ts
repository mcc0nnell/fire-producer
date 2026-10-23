import {describe,expect,it} from 'vitest'
import {authorizedConferenceCommand} from '../worker/conference-auth'
const valid='this-is-a-local-dummy-token-1234567890'
const request=(token?:string)=>new Request('https://local.invalid/api/events/conference/dc27/command',{
  method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},
})
describe('conference operator write gate',()=>{
  it('accepts only an exact bearer secret',async()=>{
    expect(await authorizedConferenceCommand(request(valid),valid)).toBe(true)
    expect(await authorizedConferenceCommand(request('wrong'),valid)).toBe(false)
    expect(await authorizedConferenceCommand(request(),valid)).toBe(false)
  })
  it('fails closed on missing or weak secret',async()=>{
    expect(await authorizedConferenceCommand(request(valid))).toBe(false)
    expect(await authorizedConferenceCommand(request('short'),'short')).toBe(false)
  })
})
