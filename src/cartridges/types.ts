export type CartridgeValidation = {ok: true} | {ok: false; message: string}

export type CartridgeEvent<C> = C & {
  seq: number
  ts: number
  actorId: string
}

export interface EventCartridge<State, Command extends {type: string; idempotencyKey: string}> {
  id: string
  version: string
  label: string
  description: string
  initialState(slug?: string): State
  validate(state: State, command: Command): CartridgeValidation
  reduce(state: State, event: CartridgeEvent<Command>): State
  fold(events: CartridgeEvent<Command>[], slug?: string): State
}

export function foldCartridge<State, Command extends {type: string; idempotencyKey: string}>(
  cartridge: Pick<EventCartridge<State, Command>, 'initialState' | 'reduce'>,
  events: CartridgeEvent<Command>[],
  slug?: string,
) {
  return events.reduce((state, event) => cartridge.reduce(state, event), cartridge.initialState(slug))
}
