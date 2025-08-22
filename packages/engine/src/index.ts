export type Rank = "A"|"T"|"K"|"Q"|"J"|"9"|"8"|"7";
export type Suit = "C"|"S"|"H"|"D";
export type Seat = 0|1|2|3|4;
export interface Card { r: Rank; s: Suit; }
export interface TrickPlay { seat: Seat; card: Card; }
export interface Trick { leader: Seat; plays: TrickPlay[]; }

export type Action =
  | { t: "BidPick" }
  | { t: "BidPass" }
  | { t: "TakeBlind" }
  | { t: "Bury", cards: Card[] }
  | { t: "Call", card: Card | { solo: true } }
  | { t: "Play", card: Card };

export type Event =
  | { t: "Shuffled", seed: string }
  | { t: "Dealt", hands: Record<Seat, Card[]>, blind: Card[] }
  | { t: "BidDeclared", seat: Seat, bid: "Pick"|"Pass" }
  | { t: "PickerChosen", seat: Seat }
  | { t: "BlindRevealed", cards: Card[] }
  | { t: "Buried", count: number }
  | { t: "PartnerCalled", card?: Card, solo?: boolean }
  | { t: "TrickLed", seat: Seat }
  | { t: "CardPlayed", seat: Seat, card: Card }
  | { t: "TrickTaken", seat: Seat, cards: Card[] }
  | { t: "HandEnded", pickerSidePoints: number, defendersPoints: number };

export interface Ruleset {
  players: 5;
  blindSize: 2;
  buryCount: 2;
  /** Variant: picker must hold at least one fail-suit card of the called suit */
  requirePickerHasSuitToCall?: boolean;
}

function isFailSuitCard(c: Card): boolean {
  // Fail suits: Clubs/Spades/Hearts EXCLUDING all trump (Qs, Js) and all Diamonds.
  return (c.s === "C" || c.s === "S" || c.s === "H") && !isTrump(c);
}

function holdsFailSuit(hand: Card[], s: "C" | "S" | "H"): boolean {
  return hand.some(c => c.s === s && isFailSuitCard(c));
}

function holdsFailRank(hand: Card[], r: "A" | "T", s: "C" | "S" | "H"): boolean {
  return hand.some(c => c.r === r && c.s === s && isFailSuitCard(c));
}

function isCardCall(p: { solo: true } | { card: Card }): p is { card: Card } {
  return (p as any).card != null;
}

export interface State {
  rules: Ruleset;
  dealer: Seat;
  phase: "Bidding"|"Blind"|"Bury"|"Call"|"Play"|"Done";
  seed: string;
  hands: Record<Seat, Card[]>;
  blind: Card[];
  bids: Record<Seat, "Pick"|"Pass"|null>;
  picker: Seat | null;
  partnerCalled: boolean;
  leader: Seat;     // current trick leader
  trick: Trick | null;
  taken: Record<Seat, Card[]>; // won cards
  turn: Seat;       // whose turn
  buried: Card[]; // cards buried by picker (count toward picker side later)
  called: ({ solo: true } | { card: Card }) | null;
}

export const RANKS: Rank[] = ["A","T","K","Q","J","9","8","7"];
export const SUITS: Suit[] = ["C","S","H","D"];

export function cardValue(c: Card): number {
  switch (c.r) {
    case "A": return 11;
    case "T": return 10;
    case "K": return 4;
    case "Q": return 3;
    case "J": return 2;
    default: return 0;
  }
}
export function isTrump(c: Card): boolean {
  return c.r === "Q" || c.r === "J" || c.s === "D";
}
export const TRUMP_ORDER: Card[] = [
  {r:"Q",s:"C"},{r:"Q",s:"S"},{r:"Q",s:"H"},{r:"Q",s:"D"},
  {r:"J",s:"C"},{r:"J",s:"S"},{r:"J",s:"H"},{r:"J",s:"D"},
  {r:"A",s:"D"},{r:"T",s:"D"},{r:"K",s:"D"},{r:"9",s:"D"},{r:"8",s:"D"},{r:"7",s:"D"},
];
const FAIL_ORDER: Rank[] = ["A","T","K","9","8","7"];

export function cmpForTrick(led: "TRUMP"|Suit, a: Card, b: Card): number {
  const ta = isTrump(a), tb = isTrump(b);
  if (led === "TRUMP" || ta || tb) {
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    const ia = TRUMP_ORDER.findIndex(x => x.r===a.r && x.s===a.s);
    const ib = TRUMP_ORDER.findIndex(x => x.r===b.r && x.s===b.s);
    return ia - ib;
  }
  if (a.s === led && b.s !== led) return -1;
  if (a.s !== led && b.s === led) return 1;
  if (a.s === led && b.s === led) {
    return FAIL_ORDER.indexOf(a.r) - FAIL_ORDER.indexOf(b.r);
  }
  return 1;
}

export function ledSuit(card: Card): "TRUMP"|Suit {
  return isTrump(card) ? "TRUMP" : card.s;
}

export function winnerOfTrick(trick: Trick): Seat {
  const led = ledSuit(trick.plays[0].card);
  let best = trick.plays[0];
  for (let i=1;i<trick.plays.length;i++) {
    const p = trick.plays[i];
    if (cmpForTrick(led, p.card, best.card) < 0) best = p;
  }
  return best.seat;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({r, s});
  return deck;
}

// PRNG (xorshift32) + seeded shuffle
function xorshift(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}
function seedToInt(seed: string): number {
  let h = 2166136261;
  for (let i=0;i<seed.length;i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function shuffle<T>(arr: T[], seed: string): T[] {
  const rnd = xorshift(seedToInt(seed));
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(rnd()* (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextSeat(s: Seat): Seat { return ((s+1)%5) as Seat; }

export function newHand(dealer: Seat, seed: string, rules: Ruleset = {players:5, blindSize:2, buryCount:2}): State {
  const deck = shuffle(buildDeck(), seed);
  const hands: Record<Seat, Card[]> = {0:[],1:[],2:[],3:[],4:[]};
  const blind: Card[] = [];

  // seats order starting left of dealer
  const order: Seat[] = [nextSeat(dealer), nextSeat(dealer+1 as Seat), nextSeat(dealer+2 as Seat), nextSeat(dealer+3 as Seat), nextSeat(dealer+4 as Seat)];

  let idx = 0;

  // First round: 3 to each; insert blind of 2 after second player's 3
  for (let i=0;i<5;i++) {
    const seat = order[i];
    for (let k=0;k<3;k++) hands[seat].push(deck[idx++]);
    if (i===1) { // after two players have 3 each
      for (let b=0;b<rules.blindSize;b++) blind.push(deck[idx++]);
    }
  }
  // Second round: 2 to each
  for (let i=0;i<5;i++) {
    const seat = order[i];
    for (let k=0;k<2;k++) hands[seat].push(deck[idx++]);
  }
  // Third round: 1 to each
  for (let i=0;i<5;i++) {
    const seat = order[i];
    hands[seat].push(deck[idx++]);
  }

  if (idx != 32) throw new Error("Deal consumed incorrect number of cards");

  const bids: Record<Seat, "Pick"|"Pass"|null> = {0:null,1:null,2:null,3:null,4:null};
  const state: State = {
    rules, dealer, seed,
    phase: "Bidding",
    hands, blind, bids,
    picker: null, partnerCalled: false,
    called: null,
    buried: [],
    leader: order[0], trick: null, taken: {0:[],1:[],2:[],3:[],4:[]},
    turn: order[0]
  };
  return state;
}

// Very small legality helpers (expand later)
export function legalPlays(state: State, seat: Seat): Card[] {
  if (state.phase !== "Play") return [];
  const hand = state.hands[seat];
  if (!state.trick || state.trick.plays.length === 0) return hand.slice();
  const led = ledSuit(state.trick.plays[0].card);
  const hasLed = hand.some(c => led==="TRUMP" ? isTrump(c) : (!isTrump(c) && c.s===led));
  if (!hasLed) return hand.slice();
  return hand.filter(c => led==="TRUMP" ? isTrump(c) : (!isTrump(c) && c.s===led));
}

/** --- BIDDING HELPERS --- */

// order starting left of dealer
export function seatingOrder(dealer: Seat): Seat[] {
  return [((dealer+1)%5) as Seat, ((dealer+2)%5) as Seat, ((dealer+3)%5) as Seat, ((dealer+4)%5) as Seat, (dealer % 5) as Seat];
}

// whose turn to bid (first seat with null bid in the seating order)
export function currentBidder(state: State): Seat | null {
  if (state.phase !== "Bidding") return null;
  const order = seatingOrder(state.dealer);
  for (const s of order) if (state.bids[s] === null) return s;
  return null; // everyone bid
}

export function legalBids(state: State, seat: Seat): Array<"Pick"|"Pass"> {
  const turn = currentBidder(state);
  if (turn !== seat) return [];
  return ["Pick", "Pass"];
}

// Apply a bid. If first "Pick", picker is chosen and phase advances to "Blind".
export function applyBid(state: State, seat: Seat, bid: "Pick"|"Pass"): State {
  if (state.phase !== "Bidding") throw new Error("Not in bidding");
  const turn = currentBidder(state);
  if (turn !== seat) throw new Error("Not your turn to bid");
  if (state.bids[seat] !== null) throw new Error("Already bid");
  state.bids[seat] = bid;

  if (bid === "Pick") {
    state.picker = seat;
    state.phase = "Blind";
    state.turn = seat; // picker acts next (take blind / bury later)
  } else {
    // if all passed, we could branch to all-pass mode; for MVP just stay at Bidding until someone picks
    const stillNull = [0,1,2,3,4].some((s) => state.bids[s as Seat] === null);
    if (!stillNull) {
      // Everyone passed: soft-reset bidding to forehand again (temporary) or keep phase Bidding.
      // For MVP do nothing; later implement All-Pass branch.
    }
  }
  return state;
}

/** --- BLIND / BURY / CALL --- */

export function takeBlind(state: State, seat: Seat) {
  if (state.phase !== "Blind") throw new Error("Not in Blind phase");
  if (state.picker !== seat) throw new Error("Only picker can take blind");
  state.hands[seat].push(...state.blind);
  state.blind = [];
  state.phase = "Bury";
  state.turn = seat;
}

export function applyBury(state: State, seat: Seat, cards: Card[]) {
  if (state.phase !== "Bury") throw new Error("Not in Bury phase");
  if (state.picker !== seat) throw new Error("Only picker can bury");
  if (cards.length !== state.rules.buryCount) throw new Error(`Must bury ${state.rules.buryCount}`);
  // Verify picker actually has the cards
  for (const c of cards) {
    const i = state.hands[seat].findIndex(h => h.r===c.r && h.s===c.s);
    if (i < 0) throw new Error("Bury card not in hand");
    state.hands[seat].splice(i,1);
  }
  state.buried.push(...cards);
  state.phase = "Call";
  state.turn = seat;
}

export function applyCall(
  state: State,
  seat: Seat,
  payload: { solo: true } | { card: Card }
) {
  if (state.phase !== "Call") throw new Error("Not in Call phase");
  if (state.picker !== seat) throw new Error("Only picker can call");

  // Solo is always allowed
  if (!isCardCall(payload)) {
    state.called = { solo: true };
    state.partnerCalled = false;
    state.phase = "Play";
    state.leader = seat;
    state.turn = seat;
    state.trick = { leader: seat, plays: [] };
    return;
  }

  const card = payload.card;
  const pickerHand = state.hands[seat];

  const isFailAce = card.r === "A" && (card.s === "C" || card.s === "S" || card.s === "H");
  const isFailTen = card.r === "T" && (card.s === "C" || card.s === "S" || card.s === "H");
  if (!isFailAce && !isFailTen) {
    throw new Error("Must call a fail Ace or (if forced) a fail Ten");
  }

  // Suit-holding variant (fail cards only; J/Q/D don't count)
  if (state.rules.requirePickerHasSuitToCall) {
    if (!holdsFailSuit(pickerHand, card.s as "C" | "S" | "H")) {
      throw new Error("You must hold at least one fail card in the called suit");
    }
  }

  // Compute "all-aces" and "all-aces + all-tens"
  const suits = ["C","S","H"] as const;
  const hasAllFailAces = suits.every(s => holdsFailRank(pickerHand, "A", s));
  const hasAllFailTens = suits.every(s => holdsFailRank(pickerHand, "T", s));

  // NEW GUARD: A Ten may be called only in the all-aces scenario
  if (isFailTen && !hasAllFailAces) {
    throw new Error("Cannot call a Ten unless you hold all fail Aces");
  }

  // Forced solo if all aces + all tens
  if (hasAllFailAces && hasAllFailTens) {
    state.called = { solo: true };
    state.partnerCalled = false;
    state.phase = "Play";
    state.leader = seat;
    state.turn = seat;
    state.trick = { leader: seat, plays: [] };
    return;
  }

  // If all aces but not all tens → must call a Ten (so calling an Ace is illegal)
  if (hasAllFailAces && isFailAce) {
    throw new Error("Picker holds all fail aces; must call a Ten instead");
  }

  // Can't call the exact fail Ace/Ten you hold
  if (holdsFailRank(pickerHand, card.r as "A" | "T", card.s as "C" | "S" | "H")) {
    if (card.r === "A") throw new Error("Cannot call a fail Ace you hold");
    if (card.r === "T") throw new Error("Cannot call a fail Ten you hold");
  }

  // (Optional) disallow bury-then-call (keep if you added earlier)
  const buried = state.buried.some(b => b.r === card.r && b.s === card.s);
  if (buried) throw new Error("Cannot call a card you buried");

  // Valid call → advance to Play
  state.called = { card };
  state.partnerCalled = true;
  state.phase = "Play";
  state.leader = seat;
  state.turn = seat;
  state.trick = { leader: seat, plays: [] };
}
