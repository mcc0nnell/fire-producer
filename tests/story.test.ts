import {describe, expect, it} from 'vitest'
import {replayGameStory} from '../src/core/story'
import type {GameEvent} from '../src/core/game'

const event = (seq: number, partial: Record<string, unknown>): GameEvent => ({
  seq, ts: seq * 1000, actorId: 'test', idempotencyKey: `k${seq}`, ...partial,
} as GameEvent)

describe('game story replay', () => {
  it('reconstructs field position and scoring from the durable log', () => {
    const story = replayGameStory([
      event(1, {type:'SET_BALL_ON', ballOn:34}),
      event(2, {type:'SET_BALL_ON', ballOn:47}),
      event(3, {type:'SCORE', team:'home', points:7}),
      event(4, {type:'SET_POSSESSION', team:'away'}),
      event(5, {type:'SET_BALL_ON', ballOn:31}),
      event(6, {type:'SCORE', team:'away', points:3}),
    ])
    expect(story.at(-1)).toMatchObject({ballOn:31, possession:'away', homeScore:7, awayScore:3, drive:1})
  })

  it('uses only events after the most recent reset', () => {
    const story = replayGameStory([
      event(1, {type:'SCORE', team:'home', points:7}),
      event(2, {type:'RESET'}),
      event(3, {type:'SCORE', team:'away', points:3}),
    ])
    expect(story.at(-1)).toMatchObject({homeScore:0, awayScore:3})
    expect(story).toHaveLength(2)
    expect(story.at(-1)?.drive).toBe(0)
  })
})
