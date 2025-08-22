# Sheepshead Monorepo (MVP)

This is a minimal, **runnable** scaffold:
- `@sheepshead/engine` — pure deterministic engine (deal, card utils)
- `@sheepshead/server` — Fastify + WebSocket, single in-memory table
- `@sheepshead/web` — Vite + React client to connect and view hands

> Goal: get you from zero to "I can deal a hand and see POV-redacted hands" quickly.
> Next: add bidding, blind/bury/call, trick play, scoring, bots, and persistence.

## Prereqs
- Node **20+**
- pnpm: `npm i -g pnpm`

## Install
```bash
pnpm install
```

## Dev (run all)
In one terminal:
```bash
pnpm --filter @sheepshead/engine dev
```
In another:
```bash
pnpm --filter @sheepshead/server dev
```
In another:
```bash
pnpm --filter @sheepshead/web dev
```

Open the web app at http://localhost:5173 and click **Start Hand**.

> Tip: Open the page in multiple tabs to simulate multiple seats; each tab gets assigned a seat automatically and sees redacted hands for others.

## Notes
- The engine currently covers deck, seeded deal, trump ordering, trick winner util, and legal-follow heuristics.
- Server keeps a single hand in memory (MVP). It exposes `/ws` for a WebSocket that accepts `StartHand` and `RequestState`.
- Web shows your hand and redacted others. It's frameworked for future actions.
- To expand, follow the architecture plan we discussed:
  - Add `applyAction` and `legalActions` to the engine.
  - Implement bidding and trick play state machine.
  - Broadcast and persist events (Postgres) from the server.
  - Reuse the engine in the client for optimistic legality checks.
