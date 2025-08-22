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
    requirePickerHasSuitToCall: true,
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

describe('Called-Ace Partner System — requirePickerHasSuitToCall', () => {
  it('rejects calling a suit you do NOT hold (fail suit) when flag is ON', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('9','H'), C('8','H'), C('T','D'), C('T','H'), C('K','D'), C('7','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/hold at least one fail card/i)
    expect(() => applyCall(st, 0, { card: C('A','S') })).toThrow(/hold at least one fail card/i)
    expect(() => applyCall(st, 0, { card: C('A','H') })).not.toThrow()
  })

  it('does NOT count J/Q/D as holding a fail suit', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('J','C'), C('Q','S'), C('A','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/hold at least one fail card/i)
    expect(() => applyCall(st, 0, { card: C('A','S') })).toThrow(/hold at least one fail card/i)
    expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/ace you hold/i)
  })

  it('when flag is OFF, allows calling a suit you don’t hold (subject to "don’t hold the ace")', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('9','H'), C('8','H'), C('T','D'), C('T','H'), C('K','D'), C('7','H')],
      rules: { requirePickerHasSuitToCall: false }
    })
    expect(() => applyCall(st, 0, { card: C('A','C') })).not.toThrow()
  })

  it('forces Ten call if holding all fail aces, and forces Solo if also holding all fail tens', () => {
    let st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('9','H'), C('8','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/must call a Ten/i)
    expect(() => applyCall(st, 0, { card: C('T','H') })).not.toThrow()

    st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','C'), C('T','S'), C('T','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    applyCall(st, 0, { card: C('T','H') })
    expect(st.called).toEqual({ solo: true })
  })

  it('rejects calling a buried ace/ten (cannot bury then call it)', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('9','H'), C('8','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    st.buried = [C('A','H')]
    expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/cannot call a card you buried/i)
  })

  it('with require-has-suit ON: J/Q/D do not satisfy the “must hold suit” gate for Ten calls', () => {
    const st = mkState({
      pickerSeat: 0,
      pickerHand: [C('J','C'), C('Q','S'), C('A','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('T','C') })).toThrow(/hold at least one fail card/i)
    expect(() => applyCall(st, 0, { card: C('T','S') })).toThrow(/hold at least one fail card/i)
  })

  it('with require-has-suit ON: when holding all fail aces, Ten calls are allowed (and required)', () => {
    // Build a fresh Call-phase state for each Ten we try, since applyCall advances to Play on success.
    const baseHand: Card[] = [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('Q','S'), C('Q','H')]
    {
      const stC = mkState({ pickerSeat: 0, pickerHand: baseHand, rules: { requirePickerHasSuitToCall: true } })
      expect(() => applyCall(stC, 0, { card: C('T','C') })).not.toThrow()
    }
    {
      const stS = mkState({ pickerSeat: 0, pickerHand: baseHand, rules: { requirePickerHasSuitToCall: true } })
      expect(() => applyCall(stS, 0, { card: C('T','S') })).not.toThrow()
    }
    {
      const stH = mkState({ pickerSeat: 0, pickerHand: baseHand, rules: { requirePickerHasSuitToCall: true } })
      expect(() => applyCall(stH, 0, { card: C('T','H') })).not.toThrow()
    }
    {
      const stAce = mkState({ pickerSeat: 0, pickerHand: baseHand, rules: { requirePickerHasSuitToCall: true } })
      expect(() => applyCall(stAce, 0, { card: C('A','C') })).toThrow(/must call a Ten/i)
    }
  })

  it('with require-has-suit OFF: Ten is only legal in all-aces case', () => {
    let st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','H'), C('9','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: false }
    })
    expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/cannot call a Ten unless you hold all fail Aces/i)

    st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('9','H'), C('8','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: false }
    })
    expect(() => applyCall(st, 0, { card: C('T','H') })).not.toThrow()
  })

  it('cannot call the exact fail Ace or Ten you hold (independent of require-has-suit)', () => {
    let st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','H'), C('9','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/ace you hold/i)

    st = mkState({
      pickerSeat: 0,
      pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','H'), C('9','H'), C('7','H')],
      rules: { requirePickerHasSuitToCall: true }
    })
    expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/ten you hold/i)
  })
})
