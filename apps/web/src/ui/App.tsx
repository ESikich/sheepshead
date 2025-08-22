import React, { useEffect, useState } from 'react'

type Seat = 0|1|2|3|4
type Suit = 'C'|'S'|'H'|'D'
type Card = { r: 'A'|'T'|'K'|'Q'|'J'|'9'|'8'|'7', s: Suit }
type Phase = "Bidding"|"Blind"|"Bury"|"Call"|"Play"|"Done"

type StatePOV = {
  hands: Record<Seat, Card[]>
  blind: Card[]
  dealer: Seat
  phase: Phase
  bids: Record<Seat, "Pick"|"Pass"|null>
  picker: Seat | null
  bidTurn: Seat | null
  buried?: Card[]
  called?: any
  rules?: { requirePickerHasSuitToCall?: boolean }
}

export default function App() {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [state, setState] = useState<StatePOV | null>(null)
  const [burySel, setBurySel] = useState<number[]>([]) // indices in my hand
  const [announcement, setAnnouncement] = useState<string>("")

  useEffect(() => {
    const socket = new WebSocket(`ws://localhost:4000/ws`)
    socket.onopen = () => console.log('connected')
    socket.onmessage = ev => {
      const msg = JSON.parse(ev.data)
      if (msg.t === 'Hello') setSeat(msg.seat)
      if (['Dealt','State','BiddingUpdated','BlindTaken','BuryDone','Called'].includes(msg.t)) {
        setState(msg.statePOV)
        setBurySel([]) // reset bury selections on state changes
        if (msg.t === 'Called' && msg.announcement) setAnnouncement(msg.announcement)
      }
      if (msg.t === 'Error') alert(msg.message)
    }
    setWs(socket)
    return () => socket.close()
  }, [])

  const myHand: Card[] = seat != null && state ? state.hands[seat] : []
  const canBid = !!state && state.phase === 'Bidding' && seat != null && state.bidTurn === seat
  const iAmPicker = !!state && seat !== null && state.picker === seat

  // --- Trump / suit helpers for UI (mirror engine logic) ---
  function isTrump(c: Card): boolean {
    if (c.r === 'J') return true
    if (c.r === 'Q') return true
    if (c.s === 'D') return true
    return false
  }
  function holdsFailSuitUI(hand: Card[], s: 'C'|'S'|'H'): boolean {
    // must hold at least one *fail* card of that suit (J/Q/D don't count)
    return hand.some(c => c.s === s && !isTrump(c))
  }
  const holds = (r: 'A'|'T', s: 'C'|'S'|'H') =>
    myHand.some(c => c.r === r && c.s === s && !isTrump(c))

  const holdsAllFailAces = (['C','S','H'] as const).every(s => holds('A', s))
  const holdsAllFailTens = (['C','S','H'] as const).every(s => holds('T', s))

  const requireHasSuit = !!state?.rules?.requirePickerHasSuitToCall
  const canCallAceSuit = (s: 'C'|'S'|'H') =>
    (!holds('A', s)) && (!requireHasSuit || holdsFailSuitUI(myHand, s))
  const canCallTenSuit = (s: 'C'|'S'|'H') =>
    (!holds('T', s)) && (!requireHasSuit || holdsFailSuitUI(myHand, s))

  const aceButtons = (['C','S','H'] as const).filter(canCallAceSuit)
  const tenButtons = (['C','S','H'] as const).filter(canCallTenSuit)

  const toggleBury = (idx: number) => {
    if (!state || state.phase !== 'Bury' || !iAmPicker) return
    setBurySel(prev => prev.includes(idx)
      ? prev.filter(i => i !== idx)
      : prev.length < 2 ? [...prev, idx] : prev)
  }

  const buryCards = () => {
    if (!state || seat == null) return
    if (burySel.length !== 2) return alert('Select exactly 2 cards to bury')
    const cards = burySel.map(i => myHand[i])
    ws?.send(JSON.stringify({ t: 'Bury', cards }))
  }

  const callSolo = () => ws?.send(JSON.stringify({ t: 'Call', payload: { solo: true } }))
  const callAce = (suit: 'C'|'S'|'H') =>
    ws?.send(JSON.stringify({ t: 'Call', payload: { card: { r: 'A', s: suit } } }))
  const callTen = (suit: 'C'|'S'|'H') =>
    ws?.send(JSON.stringify({ t: 'Call', payload: { card: { r: 'T', s: suit } } }))

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', padding: 16 }}>
      <h1>Sheepshead MVP</h1>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => ws?.send(JSON.stringify({ t: 'StartHand'}))}>Start Hand</button>
        <button onClick={() => ws?.send(JSON.stringify({ t: 'RequestState'}))} style={{ marginLeft: 8 }}>Request State</button>
      </div>

      <div>Seat: <b>{seat ?? '...'}</b></div>

      {announcement && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
          {announcement}
        </div>
      )}

      {state && (
        <>
          <p>Phase: <b>{state.phase}</b></p>

          {state.phase === 'Bidding' && (
            <BiddingPanel state={state} seat={seat} canBid={canBid} ws={ws} />
          )}

          {state.phase === 'Blind' && iAmPicker && (
            <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
              <h3>Blind</h3>
              <p>You are the picker. Take the blind.</p>
              <button onClick={() => ws?.send(JSON.stringify({ t: 'TakeBlind' }))}>Take Blind</button>
            </div>
          )}

          {state.phase === 'Bury' && iAmPicker && (
            <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
              <h3>Bury</h3>
              <p>Select exactly 2 cards to bury, then click Bury.</p>
              <button onClick={buryCards} disabled={burySel.length !== 2}>Bury ({burySel.length}/2)</button>
            </div>
          )}

          {state.phase === 'Call' && iAmPicker && (
            <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
              <h3>Call Partner</h3>
              <p>
                Call a fail Ace you do not hold{requireHasSuit ? ' and you must hold that suit' : ''}.
                If you hold all fail aces, you must call a fail Ten you do not hold{requireHasSuit ? ' and you hold that suit' : ''}.
                If you hold all aces and tens, you are forced Solo.
              </p>
              <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
                <button onClick={callSolo}>Go Solo</button>

                {holdsAllFailAces ? (
                  tenButtons.length === 0 ? (
                    <span style={{ marginLeft: 8 }}>Forced Solo (you hold all aces & tens or lack suit)</span>
                  ) : (
                    tenButtons.map(s => (
                      <button key={`T-${s}`} onClick={() => callTen(s)} style={{ marginLeft:8 }}>
                        Call T{s === 'C' ? '♣' : s === 'S' ? '♠' : '♥'}
                      </button>
                    ))
                  )
                ) : (
                  aceButtons.length === 0 ? (
                    <span style={{ marginLeft: 8 }}>No legal ace to call (you hold it or lack suit)</span>
                  ) : (
                    aceButtons.map(s => (
                      <button key={`A-${s}`} onClick={() => callAce(s)} style={{ marginLeft:8 }}>
                        Call A{s === 'C' ? '♣' : s === 'S' ? '♠' : '♥'}
                      </button>
                    ))
                  )
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <h3>Your Hand</h3>
              <Cards
                cards={myHand}
                selectable={Boolean(state?.phase==='Bury' && iAmPicker)}
                selectedIdx={burySel}
                onClickCard={toggleBury}
              />
            </div>
            <div>
              <h3>Blind</h3>
              <Cards cards={state.blind}/>
            </div>
            <div style={{ gridColumn: '1 / span 2' }}>
              <h3>All Hands (POV redacted)</h3>
              <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
                {[0,1,2,3,4].map((s:any) => (
                  <div key={s}>
                    <b>Seat {s}</b>
                    <Cards cards={state.hands[s as Seat]} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {!state && <p>Click "Start Hand" to deal a seeded game.</p>}
    </div>
  )
}

function BiddingPanel({ state, seat, canBid, ws }:{
  state: StatePOV, seat: Seat|null, canBid: boolean, ws: WebSocket | null
}) {
  return (
    <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
      <h3>Bidding</h3>
      <p>Turn: <b>{state.bidTurn ?? '—'}</b></p>
      <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
        {[0,1,2,3,4].map((s:any) => (
          <div key={s}>Seat {s}: {state.bids[s as Seat] ?? '—'}</div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button disabled={!canBid} onClick={() => ws?.send(JSON.stringify({ t: 'Bid', bid: 'Pick' }))}>Pick</button>
        <button disabled={!canBid} onClick={() => ws?.send(JSON.stringify({ t: 'Bid', bid: 'Pass' }))} style={{ marginLeft: 8 }}>Pass</button>
      </div>
    </div>
  )
}

function Cards({ cards, selectable=false, selectedIdx=[], onClickCard }:{
  cards: Card[], selectable?: boolean, selectedIdx?: number[], onClickCard?: (idx:number)=>void
}) {
  return (
    <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
      {cards.map((c, i) => {
        const sel = selectedIdx?.includes(i)
        return (
          <div
            key={i}
            onClick={() => selectable && onClickCard?.(i)}
            style={{
              border:'1px solid #ddd',
              borderRadius:8,
              padding:'8px 10px',
              minWidth:40,
              textAlign:'center',
              boxShadow: sel ? '0 0 0 2px #2563eb' : '0 1px 2px rgba(0,0,0,0.05)',
              cursor: selectable ? 'pointer' : 'default',
              userSelect: 'none'
            }}
          >
            {c.r}{c.s}
          </div>
        )
      })}
    </div>
  )
}
