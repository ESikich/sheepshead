import { describe, it, expect } from 'vitest'
import type { Card, Seat, State, Ruleset } from './index'
import { applyCall } from './index'

function mkState(params: {
  pickerSeat: Seat
  pickerHand: Card[]
  buried?: Card[]
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
    buried: params.buried || [],
    leader: params.pickerSeat,
    trick: null,
    taken: { 0: [], 1: [], 2: [], 3: [], 4: [] },
    turn: params.pickerSeat
  }
}

const C = (r: Card['r'], s: Card['s']): Card => ({ r, s })

describe('Called-Ace Partner System — Complete Rules Validation', () => {
  
  describe('Basic Ace Calling Rules', () => {
    it('allows calling any fail ace with proper hold card', () => {
      // FIXED: Need hold cards in each suit being called
      const st1 = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','H'), C('K','H'), C('7','C'), C('9','S'), C('T','D'), C('Q','D')]
      })
      expect(() => applyCall(st1, 0, { card: C('A','C') })).not.toThrow()
      
      const st2 = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','H'), C('K','H'), C('7','C'), C('9','S'), C('T','D'), C('Q','D')]
      })
      expect(() => applyCall(st2, 0, { card: C('A','S') })).not.toThrow()
    })

    it('rejects calling ace you hold', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','H'), C('K','H'), C('Q','C'), C('J','S'), C('T','D'), C('9','D')]
      })
      expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/ace you hold/i)
    })

    it('rejects calling ace without hold card (bare ace scenario)', () => {
      // Only has A♥ but no other hearts - cannot call A♥, but also cannot call other aces without hold cards
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','H'), C('Q','C'), C('Q','S'), C('J','D'), C('T','D'), C('K','D')]
      })
      
      // Cannot call A♣ because no clubs hold card
      expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/hold card/i)
      
      // Cannot call A♠ because no spades hold card  
      expect(() => applyCall(st, 0, { card: C('A','S') })).toThrow(/hold card/i)
    })

    it('rejects calling buried ace', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('K','H'), C('9','H'), C('Q','C'), C('J','S'), C('T','D'), C('7','D')],
        buried: [C('A','H'), C('8','C')]
      })
      expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/buried/i)
    })
  })

  describe('Hold Card Requirements', () => {
    it('accepts valid hold cards (non-trump, non-ace)', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('K','H'), C('9','H'), C('Q','C'), C('J','S'), C('T','D'), C('7','D')]
      })
      expect(() => applyCall(st, 0, { card: C('A','H') })).not.toThrow()
    })

    it('rejects when only trump cards in suit (J♣, Q♣ do not count as clubs hold cards)', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('J','C'), C('Q','C'), C('A','H'), C('K','H'), C('T','D'), C('9','D')]
      })
      // Has J♣ and Q♣ but these are trump, not clubs fail cards
      expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/hold card/i)
    })

    it('accepts Ten as valid hold card for ace calling', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('T','S'), C('8','S'), C('Q','C'), C('J','H'), C('A','D'), C('K','D')]
      })
      expect(() => applyCall(st, 0, { card: C('A','S') })).not.toThrow()
    })
  })

  describe('Forced Ten Calling (All Aces Scenario)', () => {
    it('forces Ten call when holding all fail aces', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      
      // Cannot call any ace
      expect(() => applyCall(st, 0, { card: C('A','C') })).toThrow(/must call a Ten/i)
      expect(() => applyCall(st, 0, { card: C('A','S') })).toThrow(/must call a Ten/i)
      expect(() => applyCall(st, 0, { card: C('A','H') })).toThrow(/must call a Ten/i)
    })

    it('allows Ten call when holding all aces and corresponding ace', () => {
      const st1 = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      expect(() => applyCall(st1, 0, { card: C('T','C') })).not.toThrow()
      
      const st2 = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      expect(() => applyCall(st2, 0, { card: C('T','S') })).not.toThrow()
      
      const st3 = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      expect(() => applyCall(st3, 0, { card: C('T','H') })).not.toThrow()
    })

    it('rejects Ten call when not holding all aces', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('K','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/cannot call a Ten unless you hold all fail Aces/i)
    })

    it('rejects Ten call when holding the Ten being called', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','H'), C('Q','C'), C('J','D')]
      })
      expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/ten you hold/i)
    })

    it('rejects Ten call when not holding corresponding ace', () => {
      // FIXED: This player only has 2 aces (A♣, A♠), so the "all aces" check should fail first
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('Q','C'), C('Q','S'), C('J','D'), C('T','D')],
        buried: [C('A','H'), C('K','H')]
      })
      // Should fail with "don't have all aces" message, not "missing specific ace"
      expect(() => applyCall(st, 0, { card: C('T','H') })).toThrow(/cannot call a Ten unless you hold all fail Aces/i)
    })
  })

  describe('Forced Solo Scenarios', () => {
    it('forces solo when holding all aces and all tens', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('T','C'), C('T','S'), C('T','H')]
      })
      
      applyCall(st, 0, { card: C('T','H') })
      expect(st.called).toEqual({ solo: true })
      expect(st.partnerCalled).toBe(false)
    })

    it('allows explicit solo declaration regardless of hand', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('7','C'), C('8','S'), C('9','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      
      expect(() => applyCall(st, 0, { solo: true })).not.toThrow()
      expect(st.called).toEqual({ solo: true })
      expect(st.partnerCalled).toBe(false)
    })
  })

  describe('Invalid Cards and Edge Cases', () => {
    it('rejects calling trump cards', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('K','H'), C('9','H'), C('Q','C'), C('J','S'), C('T','D'), C('7','D')]
      })
      
      expect(() => applyCall(st, 0, { card: C('Q','H') })).toThrow(/fail Ace or.*fail Ten/i)
      expect(() => applyCall(st, 0, { card: C('J','C') })).toThrow(/fail Ace or.*fail Ten/i)
      expect(() => applyCall(st, 0, { card: C('A','D') })).toThrow(/fail Ace or.*fail Ten/i)
    })

    it('rejects calling non-ace, non-ten fail cards', () => {
      const st = mkState({
        pickerSeat: 0,
        pickerHand: [C('K','H'), C('9','H'), C('Q','C'), C('J','S'), C('T','D'), C('7','D')]
      })
      
      expect(() => applyCall(st, 0, { card: C('K','C') })).toThrow(/fail Ace or.*fail Ten/i)
      expect(() => applyCall(st, 0, { card: C('9','S') })).toThrow(/fail Ace or.*fail Ten/i)
    })
  })

  describe('Game State Transitions', () => {
    it('advances to Play phase after valid ace call', () => {
      const st = mkState({
        pickerSeat: 2,
        pickerHand: [C('K','H'), C('9','H'), C('Q','C'), C('J','S'), C('T','D'), C('7','D')]
      })
      
      applyCall(st, 2, { card: C('A','H') })
      
      expect(st.phase).toBe('Play')
      expect(st.called).toEqual({ card: C('A','H') })
      expect(st.partnerCalled).toBe(true)
      expect(st.leader).toBe(2)
      expect(st.turn).toBe(2)
      expect(st.trick).toEqual({ leader: 2, plays: [] })
    })

    it('advances to Play phase after valid ten call', () => {
      const st = mkState({
        pickerSeat: 1,
        pickerHand: [C('A','C'), C('A','S'), C('A','H'), C('Q','C'), C('J','D'), C('T','D')]
      })
      
      applyCall(st, 1, { card: C('T','S') })
      
      expect(st.phase).toBe('Play')
      expect(st.called).toEqual({ card: C('T','S') })
      expect(st.partnerCalled).toBe(true)
      expect(st.leader).toBe(1)
      expect(st.turn).toBe(1)
    })

    it('advances to Play phase after solo declaration', () => {
      const st = mkState({
        pickerSeat: 4,
        pickerHand: [C('Q','C'), C('Q','S'), C('Q','H'), C('J','C'), C('J','S'), C('A','D')]
      })
      
      applyCall(st, 4, { solo: true })
      
      expect(st.phase).toBe('Play')
      expect(st.called).toEqual({ solo: true })
      expect(st.partnerCalled).toBe(false)
      expect(st.leader).toBe(4)
      expect(st.turn).toBe(4)
    })
  })
})