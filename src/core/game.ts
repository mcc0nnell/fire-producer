export type TeamId = 'home' | 'away'

export type GameState = {
  slug: string
  revision: number
  lastSeq: number
  home: {name: string; short: string; score: number}
  away: {name: string; short: string; score: number}
  quarter: number
  down: number
  distance: number
  ballOn: number
  possession: TeamId
  clock: {remainingMs: number; running: boolean; anchoredAt: number | null}
  caption: string
  drive: {seq: number; text: string}[]
}

export type GameCommand =
  | {type: 'SCORE'; team: TeamId; points: number; idempotencyKey: string}
  | {type: 'SET_DOWN'; down: number; idempotencyKey: string}
  | {type: 'SET_DISTANCE'; distance: number; idempotencyKey: string}
  | {type: 'SET_BALL_ON'; ballOn: number; idempotencyKey: string}
  | {type: 'SET_QUARTER'; quarter: number; idempotencyKey: string}
  | {type: 'SET_POSSESSION'; team: TeamId; idempotencyKey: string}
  | {type: 'SET_CLOCK'; remainingMs: number; idempotencyKey: string}
  | {type: 'START_CLOCK'; idempotencyKey: string}
  | {type: 'STOP_CLOCK'; idempotencyKey: string}
  | {type: 'CAPTION'; text: string; idempotencyKey: string}
  | {type: 'RESET'; idempotencyKey: string}

export type GameEvent = GameCommand & {seq: number; ts: number; actorId: string}

export function initialGameState(slug = 'demo'): GameState {
  return {
    slug, revision: 0, lastSeq: 0,
    home: {name: 'Baltimore Fire', short: 'BAL', score: 0},
    away: {name: 'Chesapeake Iron', short: 'CHI', score: 0},
    quarter: 1, down: 1, distance: 10, ballOn: 25, possession: 'home',
    clock: {remainingMs: 12 * 60_000, running: false, anchoredAt: null},
    caption: 'Fire Producer live production ready.', drive: [],
  }
}

function addDrive(state: GameState, seq: number, text: string): GameState {
  return {...state, drive: [...state.drive.slice(-11), {seq, text}]}
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  if (event.type === 'RESET') return {...initialGameState(state.slug), revision: state.revision + 1, lastSeq: event.seq}
  let next: GameState = {...state, revision: state.revision + 1, lastSeq: event.seq}
  switch (event.type) {
    case 'SCORE': {
      const side = next[event.team]
      next = {...next, [event.team]: {...side, score: side.score + event.points}}
      return addDrive(next, event.seq, `${side.short} +${event.points}`)
    }
    case 'SET_DOWN': return {...next, down: Math.min(4, Math.max(1, event.down))}
    case 'SET_DISTANCE': return {...next, distance: Math.max(1, event.distance)}
    case 'SET_BALL_ON': return {...next, ballOn: Math.min(99, Math.max(1, event.ballOn))}
    case 'SET_QUARTER': return {...next, quarter: Math.min(9, Math.max(1, event.quarter))}
    case 'SET_POSSESSION': return addDrive({...next, possession: event.team}, event.seq, `${next[event.team].short} possession`)
    case 'SET_CLOCK': return {...next, clock: {remainingMs: Math.max(0, event.remainingMs), running: false, anchoredAt: null}}
    case 'START_CLOCK': return next.clock.running ? next : {...next, clock: {...next.clock, running: true, anchoredAt: event.ts}}
    case 'STOP_CLOCK': {
      if (!next.clock.running || next.clock.anchoredAt === null) return next
      const elapsed = Math.max(0, event.ts - next.clock.anchoredAt)
      return {...next, clock: {remainingMs: Math.max(0, next.clock.remainingMs - elapsed), running: false, anchoredAt: null}}
    }
    case 'CAPTION': return {...next, caption: event.text.slice(0, 240)}
  }
}

export function foldEvents(events: GameEvent[], slug = 'demo') {
  return events.reduce(applyEvent, initialGameState(slug))
}

export function visibleClock(state: GameState, now = Date.now()) {
  if (!state.clock.running || state.clock.anchoredAt === null) return state.clock.remainingMs
  return Math.max(0, state.clock.remainingMs - (now - state.clock.anchoredAt))
}
