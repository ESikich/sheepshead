import { describe, it, expect } from 'vitest'
import type { Card, Seat, State, Ruleset } from './index'
import { applyCall } from './index'

function mkState(params: {
  pickerSeat: Seat
  pickerHand: Card[]
  rules?: Partial<Ruleset>
}): State {
  const rules: Ruleset = {
    players: 5,
    blindSize: 2,
    buryCount: 2,
    ...params.rules
  } as Ruleset

  const hands: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] }
  hands[params.pickerSeat] = params.pickerHand.slice()

  return {
    rules,
    dealer: 0,
    phase: 'Call',
    seed: 'test',
    hands,
    blind: [],
    bids: { 0: 'Pick', 1: 'Pass', 2: 'Pass', 3: 'Pass', 4: 'Pass' },
    picker: params.pickerSeat,
    partnerCalled: false,
    called: null,
    buried: [],
    leader: params.pickerSeat,
    trick: null,
    taken: { 0: [], 1: [], 2: [], 3: [], 4: [] },
    turn: params.pickerSeat
  }
}

const C = (r: Card['r'], s: Card['s']): Card => ({ r, s })

describe('Called-Ace Partner System — Standard Rules', () => {
  it('allows calling any fail ace you do not hold', () => {
    // Create fresh state for each call since applyCall advances the phase
    const baseHand = [C('9','H'), C('8','H'), C('T','D'), C('T','H'), C('K','D'), C('7','H')]
    
    const st1 = mkState({ pickerSeat: 0, pickerHand: baseHand })
    expect(() => applyCall(st1, 0, { card: C('A','C') })).not.toThrow()
    
    const st2 = mkState({ pickerSeat: 0, pickerHand: baseHand })
    expect(() => applyCall(st2, 0, { card: C('A','S') })).not.toThrow()
    
    const st3 = mkState({ pickerSeat: 0, pickerHand: baseHand })
    expect(() => applyCall(st3, 0, { card: C('A','H') })).not.toThrow()
  })

  it('does NOT count J/Q/D as fail suit cards for ace calling', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('J','C'), C('Q','S'), C('A','H')]
    })
    // Can call aces in C and S even though we only hold trump cards (J♣, Q♠) in those suits
    expect(() => applyCall(st, 0, { card: C('A','C') })).not.toThrow()
    
    const st2 = mkState({
      pickerSeat: 0,
      pickerHand: [C('J','C'), C('Q','S'), C('A','H')]
    })
    expect(() => applyCall(st2, 0, { card: C('A','S') })).not.toThrow()
    
    // Cannot call A♥ because we hold it
    const st3 = mkState({
      pickerSeat: 0,
      pickerHand: [C('J','C'), C('Q','S'), C('A','H')]
    })
    expect(() => applyCall(st3, 0, { card: C('A','H') })).toThrow(/ace you hold/i)
  })

  it('forces Ten call if holding all fail aces, and forces Solo if also holding all fail tens', () => {
    let st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('9','H'), C('8','H'), C('7','H')]
    })
    expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/must call a Ten/i)
    expect(() => applyCall(st, 0, { card: C('T','H') })).not.toThrow()

    st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','C'), C('T','S'), C('T','H')]
    })
    applyCall(st, 0, { card: C('T','H') })
    expect(st.called).toEqual({ solo: true })
  })

  it('rejects calling a buried ace/ten (cannot bury then call it)', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('9','H'), C('8','H'), C('7','H')]
    })
    st.buried = [C('A','H')]
    expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/cannot call a card you buried/i)
  })

  it('allows Ten calls only when holding all fail aces', () => {
    // Cannot call Ten without holding all aces
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','H'), C('9','H'), C('7','H')]
    })
    expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/cannot call a Ten unless you hold all fail Aces/i)

    // Can call Ten when holding all aces
    const st2 = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('9','H'), C('8','H'), C('7','H')]
    })
    expect(() => applyCall(st2, 0, { card: C('T','H') })).not.toThrow()
  })

  it('when holding all fail aces, Ten calls are allowed (and required)', () => {
    // Build a fresh Call-phase state for each Ten we try, since applyCall advances to Play on success.
    const baseHand: Card[] = [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('Q','S'), C('Q','H')]
    {
      const stC = mkState({ pickerSeat: 0, pickerHand: baseHand })
      expect(() => applyCall(stC, 0, { card: C('T','C') })).not.toThrow()
    }
    {
      const stS = mkState({ pickerSeat: 0, pickerHand: baseHand })
      expect(() => applyCall(stS, 0, { card: C('T','S') })).not.toThrow()
    }
    {
      const stH = mkState({ pickerSeat: 0, pickerHand: baseHand })
      expect(() => applyCall(stH, 0, { card: C('T','H') })).not.toThrow()
    }
    {
      const stAce = mkState({ pickerSeat: 0, pickerHand: baseHand })
      expect(() => applyCall(stAce, 0, { card: C('A','C') })).toThrow(/must call a Ten/i)
    }
  })

  it('cannot call the exact fail Ace or Ten you hold', () => {
    let st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','H'), C('9','H'), C('7','H')]
    })
    expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/ace you hold/i)

    st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','H'), C('9','H'), C('7','H')]
    })
    expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/ten you hold/i)
  })

  it('allows solo declaration at any time', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('9','H'), C('8','H'), C('T','D'), C('T','H'), C('K','D'), C('7','H')]
    })
    expect(() => applyCall(st, 0, { solo: true })).not.toThrow()
    expect(st.called).toEqual({ solo: true })
    expect(st.partnerCalled).toBe(false)
    expect(st.phase).toBe('Play')
  })
})