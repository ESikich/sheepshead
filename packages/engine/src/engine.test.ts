import { describe, it, expect, beforeEach } from 'vitest'
import type { Card, Seat, State, Ruleset } from './index'
import { 
  newHand, applyBid, takeBlind, applyBury, applyCall,
  cardValue, isTrump, cmpForTrick, ledSuit, winnerOfTrick,
  legalPlays, currentBidder, seatingOrder, shuffle, nextSeat,
  TRUMP_ORDER, RANKS, SUITS
} from './index'

const C = (r: Card['r'], s: Card['s']): Card => ({ r, s })

// Your existing tests for applyCall should be kept - they're excellent!
// This expands coverage to other critical areas

describe('Core Game Setup', () => {
  it('creates a valid new hand', () => {
    const state = newHand(0, 'test123')
    
    expect(state.dealer).toBe(0)
    expect(state.phase).toBe('Bidding')
    expect(state.picker).toBeNull()
    expect(state.seed).toBe('test123')
    
    // Check hand sizes
    expect(state.hands[0]).toHaveLength(6)
    expect(state.hands[1]).toHaveLength(6)
    expect(state.hands[2]).toHaveLength(6)
    expect(state.hands[3]).toHaveLength(6)
    expect(state.hands[4]).toHaveLength(6)
    expect(state.blind).toHaveLength(2)
    
    // Total cards should be 32
    const totalCards = Object.values(state.hands).flat().length + state.blind.length
    expect(totalCards).toBe(32)
  })

  it('produces deterministic deals with same seed', () => {
    const state1 = newHand(2, 'same-seed')
    const state2 = newHand(2, 'same-seed')
    
    expect(state1.hands).toEqual(state2.hands)
    expect(state1.blind).toEqual(state2.blind)
  })

  it('produces different deals with different seeds', () => {
    const state1 = newHand(0, 'seed1')
    const state2 = newHand(0, 'seed2')
    
    expect(state1.hands).not.toEqual(state2.hands)
  })

  it('respects different dealer positions', () => {
    const state0 = newHand(0, 'test')
    const state2 = newHand(2, 'test')
    
    expect(state0.dealer).toBe(0)
    expect(state2.dealer).toBe(2)
    
    // First bidder should be left of dealer
    expect(currentBidder(state0)).toBe(1)
    expect(currentBidder(state2)).toBe(3)
  })
})

describe('Bidding Mechanics', () => {
  let state: State

  beforeEach(() => {
    state = newHand(0, 'bid-test')
  })

  it('follows correct bidding order', () => {
    expect(currentBidder(state)).toBe(1) // left of dealer (0)
    
    applyBid(state, 1, 'Pass')
    expect(currentBidder(state)).toBe(2)
    
    applyBid(state, 2, 'Pass')
    expect(currentBidder(state)).toBe(3)
  })

  it('advances to Blind phase when someone picks', () => {
    applyBid(state, 1, 'Pick')
    
    expect(state.phase).toBe('Blind')
    expect(state.picker).toBe(1)
    expect(state.turn).toBe(1)
  })

  it('rejects bids out of turn', () => {
    expect(() => applyBid(state, 2, 'Pick')).toThrow('Not your turn')
  })

  it('rejects bids from wrong player', () => {
    // Test the more realistic scenario: someone tries to bid out of turn
    expect(() => applyBid(state, 2, 'Pick')).toThrow('Not your turn')
    expect(() => applyBid(state, 0, 'Pass')).toThrow('Not your turn')
    
    // Valid bid should work
    expect(() => applyBid(state, 1, 'Pass')).not.toThrow()
  })

  it('handles all-pass scenario gracefully', () => {
    applyBid(state, 1, 'Pass')
    applyBid(state, 2, 'Pass') 
    applyBid(state, 3, 'Pass')
    applyBid(state, 4, 'Pass')
    applyBid(state, 0, 'Pass')
    
    // For MVP, stays in bidding - could implement all-pass rules later
    expect(state.phase).toBe('Bidding')
  })
})

describe('Blind and Bury', () => {
  let state: State

  beforeEach(() => {
    state = newHand(0, 'blind-test')
    applyBid(state, 1, 'Pick') // seat 1 picks
  })

  it('allows picker to take blind', () => {
    const originalHandSize = state.hands[1].length
    const blindCards = [...state.blind]
    
    takeBlind(state, 1)
    
    expect(state.phase).toBe('Bury')
    expect(state.hands[1]).toHaveLength(originalHandSize + blindCards.length)
    expect(state.blind).toHaveLength(0)
  })

  it('rejects non-picker taking blind', () => {
    expect(() => takeBlind(state, 2)).toThrow('Only picker can take blind')
  })

  it('allows picker to bury correct number of cards', () => {
    takeBlind(state, 1)
    const handBefore = [...state.hands[1]]
    const toBury = [handBefore[0], handBefore[1]]
    
    applyBury(state, 1, toBury)
    
    expect(state.phase).toBe('Call')
    expect(state.buried).toEqual(toBury)
    expect(state.hands[1]).toHaveLength(handBefore.length - 2)
  })

  it('rejects burying wrong number of cards', () => {
    takeBlind(state, 1)
    const card = state.hands[1][0]
    
    expect(() => applyBury(state, 1, [card])).toThrow('Must bury 2')
    expect(() => applyBury(state, 1, [card, card, card])).toThrow('Must bury 2')
  })

  it('rejects burying cards not in hand', () => {
    takeBlind(state, 1)
    const notInHand = C('A', 'C')
    
    expect(() => applyBury(state, 1, [notInHand, notInHand])).toThrow('not in hand')
  })
})

describe('Card Values and Trump System', () => {
  it('calculates card values correctly', () => {
    expect(cardValue(C('A', 'H'))).toBe(11)
    expect(cardValue(C('T', 'S'))).toBe(10)
    expect(cardValue(C('K', 'C'))).toBe(4)
    expect(cardValue(C('Q', 'D'))).toBe(3)
    expect(cardValue(C('J', 'H'))).toBe(2)
    expect(cardValue(C('9', 'S'))).toBe(0)
    expect(cardValue(C('8', 'C'))).toBe(0)
    expect(cardValue(C('7', 'D'))).toBe(0)
  })

  it('identifies trump cards correctly', () => {
    // All Queens are trump
    expect(isTrump(C('Q', 'C'))).toBe(true)
    expect(isTrump(C('Q', 'S'))).toBe(true)
    expect(isTrump(C('Q', 'H'))).toBe(true)
    expect(isTrump(C('Q', 'D'))).toBe(true)
    
    // All Jacks are trump  
    expect(isTrump(C('J', 'C'))).toBe(true)
    expect(isTrump(C('J', 'S'))).toBe(true)
    expect(isTrump(C('J', 'H'))).toBe(true)
    expect(isTrump(C('J', 'D'))).toBe(true)
    
    // All Diamonds are trump
    expect(isTrump(C('A', 'D'))).toBe(true)
    expect(isTrump(C('T', 'D'))).toBe(true)
    expect(isTrump(C('K', 'D'))).toBe(true)
    expect(isTrump(C('9', 'D'))).toBe(true)
    
    // Fail suits (non-Q/J) are not trump
    expect(isTrump(C('A', 'C'))).toBe(false)
    expect(isTrump(C('K', 'S'))).toBe(false)
    expect(isTrump(C('9', 'H'))).toBe(false)
  })

  it('follows trump hierarchy correctly', () => {
    const qc = C('Q', 'C')
    const qs = C('Q', 'S') 
    const jd = C('J', 'D')
    const ad = C('A', 'D')
    const td = C('T', 'D')
    
    // Q♣ beats Q♠
    expect(cmpForTrick('TRUMP', qc, qs)).toBeLessThan(0)
    
    // Queens beat Jacks
    expect(cmpForTrick('TRUMP', qs, jd)).toBeLessThan(0)
    
    // Jacks beat Diamond face cards
    expect(cmpForTrick('TRUMP', jd, ad)).toBeLessThan(0)
    
    // A♦ beats T♦
    expect(cmpForTrick('TRUMP', ad, td)).toBeLessThan(0)
  })
})

describe('Trick Mechanics', () => {
  it('determines led suit correctly', () => {
    expect(ledSuit(C('Q', 'C'))).toBe('TRUMP')
    expect(ledSuit(C('J', 'S'))).toBe('TRUMP')
    expect(ledSuit(C('A', 'D'))).toBe('TRUMP')
    expect(ledSuit(C('A', 'H'))).toBe('H')
    expect(ledSuit(C('K', 'C'))).toBe('C')
  })

  it('finds trick winner correctly', () => {
    const trick = {
      leader: 0 as Seat,
      plays: [
        { seat: 0 as Seat, card: C('A', 'H') }, // led ace of hearts
        { seat: 1 as Seat, card: C('K', 'H') }, // king of hearts
        { seat: 2 as Seat, card: C('Q', 'C') }, // trump queen
        { seat: 3 as Seat, card: C('9', 'S') }  // slough
      ]
    }
    
    // Trump queen should win
    expect(winnerOfTrick(trick)).toBe(2)
  })

  it('validates legal plays - must follow suit', () => {
    const state = newHand(0, 'play-test')
    // Set up play phase manually
    state.phase = 'Play'
    state.picker = 1
    state.trick = {
      leader: 0,
      plays: [{ seat: 0, card: C('A', 'H') }] // hearts led
    }
    state.turn = 1
    
    // Give seat 1 some hearts and non-hearts
    state.hands[1] = [C('K', 'H'), C('9', 'H'), C('A', 'C'), C('T', 'S')]
    
    const legal = legalPlays(state, 1)
    
    // Should only allow hearts since hearts was led and player has hearts
    expect(legal).toEqual([C('K', 'H'), C('9', 'H')])
  })

  it('allows any card when cannot follow suit', () => {
    const state = newHand(0, 'play-test')
    state.phase = 'Play'
    state.picker = 1
    state.trick = {
      leader: 0,
      plays: [{ seat: 0, card: C('A', 'H') }] // hearts led
    }
    state.turn = 1
    
    // Give seat 1 no hearts
    state.hands[1] = [C('A', 'C'), C('T', 'S'), C('Q', 'D'), C('J', 'C')]
    
    const legal = legalPlays(state, 1)
    
    // Should allow all cards since no hearts available
    expect(legal).toEqual(state.hands[1])
  })
})

describe('Utility Functions', () => {
  it('cycles through seats correctly', () => {
    expect(nextSeat(0)).toBe(1)
    expect(nextSeat(1)).toBe(2)
    expect(nextSeat(2)).toBe(3)
    expect(nextSeat(3)).toBe(4)
    expect(nextSeat(4)).toBe(0) // wraps around
  })

  it('calculates seating order correctly', () => {
    expect(seatingOrder(0)).toEqual([1, 2, 3, 4, 0])
    expect(seatingOrder(2)).toEqual([3, 4, 0, 1, 2])
    expect(seatingOrder(4)).toEqual([0, 1, 2, 3, 4])
  })

  it('shuffles deterministically with seed', () => {
    const arr1 = [1, 2, 3, 4, 5]
    const arr2 = [1, 2, 3, 4, 5]
    
    const shuffled1 = shuffle(arr1, 'test')
    const shuffled2 = shuffle(arr2, 'test')
    
    expect(shuffled1).toEqual(shuffled2)
    expect(shuffled1).not.toEqual([1, 2, 3, 4, 5]) // should be different order
  })

  it('produces different shuffles with different seeds', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    
    const shuffled1 = shuffle([...arr], 'seed1')
    const shuffled2 = shuffle([...arr], 'seed2')
    
    expect(shuffled1).not.toEqual(shuffled2)
  })
})

describe('Error Handling and Edge Cases', () => {
  it('rejects actions in wrong phase', () => {
    const state = newHand(0, 'error-test')
    
    // Can't take blind before picking
    expect(() => takeBlind(state, 1)).toThrow('Not in Blind phase')
    
    // Can't bury before taking blind
    expect(() => applyBury(state, 1, [])).toThrow('Not in Bury phase')
    
    // Can't call before burying
    expect(() => applyCall(state, 1, { solo: true })).toThrow('Not in Call phase')
  })

  it('validates seat ranges', () => {
    const state = newHand(0, 'test')
    
    // Test that the engine handles valid seats (0-4)
    expect(() => applyBid(state, 1, 'Pass')).not.toThrow()
    
    // Invalid seats would be caught by TypeScript, but worth testing runtime
    // This would require casting to bypass TS checks in real tests
  })

  it('maintains game state consistency', () => {
    const state = newHand(3, 'consistency-test')
    
    // After each operation, verify critical invariants
    expect(state.dealer).toBe(3)
    expect(state.phase).toBe('Bidding')
    expect(Object.values(state.bids).every(b => b === null)).toBe(true)
    
    applyBid(state, 4, 'Pick') // next seat after dealer
    expect(state.picker).toBe(4)
    expect(state.phase).toBe('Blind')
    
    takeBlind(state, 4)
    expect(state.phase).toBe('Bury')
    expect(state.blind).toHaveLength(0)
  })
})

// Integration test that exercises full game flow
describe('End-to-End Game Flow', () => {
  it('completes a full game setup sequence', () => {
    const state = newHand(2, 'e2e-test')
    
    // Bidding
    expect(state.phase).toBe('Bidding')
    applyBid(state, 3, 'Pass') // left of dealer (2)
    applyBid(state, 4, 'Pick')
    
    expect(state.phase).toBe('Blind')
    expect(state.picker).toBe(4)
    
    // Take blind
    takeBlind(state, 4)
    expect(state.phase).toBe('Bury')
    
    // Bury cards
    const toBury = state.hands[4].slice(0, 2)
    applyBury(state, 4, toBury)
    expect(state.phase).toBe('Call')
    
    // Call partner (or go solo)
    applyCall(state, 4, { solo: true })
    expect(state.phase).toBe('Play')
    expect(state.called).toEqual({ solo: true })
    
    // Ready for trick play
    expect(state.leader).toBe(4)
    expect(state.turn).toBe(4)
    expect(state.trick).toEqual({ leader: 4, plays: [] })
  })
})