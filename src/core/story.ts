import type {GameEvent, TeamId} from './game'

export type GameStoryPoint = {
  seq: number
  ballOn: number
  possession: TeamId
  homeScore: number
  awayScore: number
  label: string
  drive: number
}

export function activeGameEvents(events: GameEvent[]) {
  const resetIndex = events.map((event) => event.type).lastIndexOf('RESET')
  return resetIndex >= 0 ? events.slice(resetIndex + 1) : events
}

export function replayGameStory(events: GameEvent[]): GameStoryPoint[] {
  let ballOn = 25
  let possession: TeamId = 'home'
  let homeScore = 0
  let awayScore = 0
  let drive = 0
  const snapshots: GameStoryPoint[] = [{seq: 0, ballOn, possession, homeScore, awayScore, label: 'Kickoff', drive}]

  for (const event of activeGameEvents(events)) {
    let label = `#${event.seq}`
    let relevant = false

    if (event.type === 'SET_BALL_ON') {
      ballOn = event.ballOn
      label = `Ball ${ballOn}`
      relevant = true
    } else if (event.type === 'SET_POSSESSION') {
      if (event.team !== possession) drive += 1
      possession = event.team
      label = 'Possession'
      relevant = true
    } else if (event.type === 'SCORE') {
      if (event.team === 'home') homeScore += event.points
      else awayScore += event.points
      label = `${event.team === 'home' ? 'HOME' : 'AWAY'} +${event.points}`
      relevant = true
    }

    if (relevant) snapshots.push({seq: event.seq, ballOn, possession, homeScore, awayScore, label, drive})
  }

  return snapshots
}
