import Fastify from "fastify";
import WebSocket, { WebSocketServer } from "ws";
import {
  newHand, type Seat, type State,
  currentBidder, applyBid,
  takeBlind, applyBury, applyCall
} from "@sheepshead/engine";

function suitGlyph(s: "C"|"S"|"H"|"D") {
  return s === "C" ? "♣" : s === "S" ? "♠" : s === "H" ? "♥" : "♦";
}
function cardLabel(card: { r: string; s: "C"|"S"|"H"|"D" }) {
  const rank = card.r === "T" ? "Ten" :
               card.r === "A" ? "Ace" :
               card.r;
  return `${rank} of ${card.s === "C" ? "Clubs" : card.s === "S" ? "Spades" : card.s === "H" ? "Hearts" : "Diamonds"} ${suitGlyph(card.s)}`;
}

const fastify = Fastify({ logger: false });
// Simple health route
fastify.get("/health", async () => ({ ok: true }));

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

const server = fastify.listen({ port, host: "0.0.0.0" }).then((address) => {
  console.log("HTTP listening at", address);
});

// In-memory single table (MVP)
type Client = { ws: WebSocket; seat: Seat };
const clients: Client[] = [];
let dealer: Seat = 0;
let state: State | null = null;

const wss = new WebSocketServer({ noServer: true });

fastify.server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

function broadcast(msg: any) {
  const s = JSON.stringify(msg);
  for (const c of clients) c.ws.send(s);
}

wss.on("connection", (ws) => {
  // Assign first open seat 0..4
  const used = new Set(clients.map(c => c.seat));
  let seat: Seat = 0;
  for (let i = 0; i < 5; i++) {
    if (!used.has(i as Seat)) {
      seat = i as Seat;
      break;
    }
  }

  const client: Client = { ws, seat };
  clients.push(client);

  // Let the client know its seat
  ws.send(JSON.stringify({ t: "Hello", seat }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data));

      if (msg.t === "StartHand") {
        const seed = msg.seed ?? String(Date.now());
        state = newHand(dealer, seed, {
          players: 5,
          blindSize: 2,
          buryCount: 2,
          requirePickerHasSuitToCall: true,  // <-- your house rule
        });

        // Send each client their own POV
        for (const c of clients) {
          c.ws.send(JSON.stringify({
            t: "Dealt",
            statePOV: pov(state, c.seat)
          }));
        }

      } else if (msg.t === "RequestState") {
        if (state) {
          ws.send(JSON.stringify({
            t: "State",
            statePOV: pov(state, client.seat)
          }));
        }

      } else if (msg.t === "Bid") {
        if (!state) return;
        const { bid } = msg as { bid: "Pick" | "Pass" };
        try {
          applyBid(state, client.seat, bid);
          for (const c of clients) {
            c.ws.send(JSON.stringify({
              t: "BiddingUpdated",
              statePOV: pov(state, c.seat)
            }));
          }
        } catch (e: any) {
          ws.send(JSON.stringify({
            t: "Error",
            message: e?.message ?? "Invalid bid"
          }));
        }

      } else if (msg.t === "TakeBlind") {
        if (!state) return;
        try {
          takeBlind(state, client.seat);
          for (const c of clients) {
            c.ws.send(JSON.stringify({
              t: "BlindTaken",
              statePOV: pov(state, c.seat)
            }));
          }
        } catch (e: any) {
          ws.send(JSON.stringify({
            t: "Error",
            message: e?.message ?? "Cannot take blind"
          }));
        }

      } else if (msg.t === "Bury") {
        if (!state) return;
        try {
          const cards = msg.cards as { r: string; s: string }[];
          applyBury(state, client.seat, cards as any);
          for (const c of clients) {
            c.ws.send(JSON.stringify({
              t: "BuryDone",
              statePOV: pov(state, c.seat)
            }));
          }
        } catch (e: any) {
          ws.send(JSON.stringify({
            t: "Error",
            message: e?.message ?? "Invalid bury"
          }));
        }
      } else if (msg.t === "Call") {
        if (!state) return;
        try {
          const payload = msg.payload as ({ solo: true } | { card: { r: "A"|"T"; s: "C"|"S"|"H" } });

          // Apply the call in the engine (this sets state.called and advances to Play)
          applyCall(state, client.seat, payload as any);

          // Build an announcement string for the table
          let announcement = "";
          if ("solo" in payload && payload.solo) {
            announcement = "Picker declared Solo.";
          } else if ("card" in payload) {
            const lbl = cardLabel(payload.card);
            if (payload.card.r === "T") {
              announcement = `Picker called the ${lbl} (forced Ten).`;
            } else {
              announcement = `Picker called the ${lbl}.`;
            }
          }

          // Broadcast updated POVs + the announcement
          for (const c of clients) {
            c.ws.send(JSON.stringify({
              t: "Called",
              statePOV: pov(state, c.seat),
              announcement
            }));
          }
        } catch (e: any) {
          ws.send(JSON.stringify({ t: "Error", message: e?.message ?? "Invalid call" }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

function pov(state: State, seat: Seat | null) {
  const hands: any = {};
  ([0,1,2,3,4] as Seat[]).forEach((s) => {
    if (seat === null || s === seat) hands[s] = state.hands[s];
    else hands[s] = state.hands[s].map(() => ({ r: "?", s: "?" }));
  });

  const blindVisibleTo =
    (state.phase === "Blind" || state.phase === "Bury" || state.phase === "Call")
      && state.picker !== null ? state.picker : null;

  const blind =
    seat === null || (blindVisibleTo !== null && seat === blindVisibleTo)
      ? state.blind
      : state.blind.map(() => ({ r: "?", s: "?" }));

  const bidTurn = state.phase === "Bidding" ? currentBidder(state) : null;
  return { ...state, hands, blind, bidTurn };
}

console.log("WebSocket at ws://localhost:%d/ws", port);
