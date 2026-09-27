import {
  applyEvent,
  initialGameState,
  type GameCommand,
  type GameEvent,
  type GameState,
} from '../core/game'
import {foldCartridge, type EventCartridge} from './types'

export const footballCartridge: EventCartridge<GameState, GameCommand> = {
  id: 'football',
  version: '1.0.0',
  label: 'Football',
  description: 'Clock, quarter, score, down, distance, field position, possession, captions, drives, and scoring flow.',
  initialState: initialGameState,
  validate(state, command) {
    if (command.type === 'SCORE' && ![1,2,3,6,7,8].includes(command.points)) return {ok:false, message:'Unsupported football score value'}
    if (command.type === 'SET_DOWN' && (command.down < 1 || command.down > 4)) return {ok:false, message:'Down must be 1–4'}
    if (command.type === 'SET_BALL_ON' && (command.ballOn < 1 || command.ballOn > 99)) return {ok:false, message:'Ball position must be 1–99'}
    if (command.type === 'START_CLOCK' && state.clock.running) return {ok:false, message:'Clock is already running'}
    return {ok:true}
  },
  reduce: applyEvent,
  fold(events, slug = 'demo') { return foldCartridge(footballCartridge, events as GameEvent[], slug) },
}
