import {describe, expect, it} from 'vitest'
import {applyEvent, foldEvents, initialGameState, type GameEvent} from '../src/core/game'

const event = (partial: Record<string, unknown>, seq = 1): GameEvent => ({...partial, seq, ts: 1000, actorId:'test', idempotencyKey:`k${seq}`} as GameEvent)

describe('football state', () => {
  it('folds scoring deterministically', () => {
    const state = foldEvents([event({type:'SCORE',team:'home',points:7}), event({type:'SCORE',team:'away',points:3},2)])
    expect(state.home.score).toBe(7); expect(state.away.score).toBe(3); expect(state.lastSeq).toBe(2)
  })
  it('stops a running clock from the event timestamp', () => {
    let s = initialGameState(); s = applyEvent(s, event({type:'START_CLOCK'}))
    const stopped = applyEvent(s, {...event({type:'STOP_CLOCK'},2),ts:11_000})
    expect(stopped.clock.remainingMs).toBe(710_000); expect(stopped.clock.running).toBe(false)
  })
})
