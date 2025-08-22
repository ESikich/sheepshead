# Sheepshead Engine & Web App

This repository contains a **monorepo** implementation of the card game *Sheepshead*, including:
- **Engine** — pure TypeScript game logic, rules, and tests
- **Server** — WebSocket + HTTP backend for multiplayer
- **Web** — React + Vite frontend client

---

## Getting Started

### Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (package manager)

Install pnpm globally if you haven’t yet:
```bash
npm install -g pnpm
```

### Install dependencies
At the repo root:
```bash
pnpm install
```

### Run the server
```bash
pnpm --filter @sheepshead/server dev
```
Server runs at:
- WebSocket: `ws://localhost:4000/ws`
- HTTP: `http://localhost:4000`

### Run the web client
```bash
pnpm --filter @sheepshead/web dev
```
Web client runs at [http://localhost:5173](http://localhost:5173).

---

## Testing

The **engine** is fully unit tested with [Vitest](https://vitest.dev/).

```bash
pnpm --filter @sheepshead/engine test
```

Test files live alongside source (`*.test.ts`) and cover:
- Bidding & picking
- Called-Ace partner system
- Corner cases (forced Ten, forced Solo, buried card rules)

---

## Repository Structure

```
apps/
  server/   # WebSocket/HTTP API
  web/      # React frontend
packages/
  engine/   # Game logic, rules, state machine
```

---

## Development Notes

- TypeScript strict mode is enabled.
- pnpm workspaces manage shared dependencies.
- `.gitignore` excludes build artifacts, logs, IDE files, coverage.

---

## Roadmap

- ✅ Base engine + rules (including Called-Ace partner system)
- ✅ Multiplayer via WebSocket server
- ✅ Basic React frontend
- 🔲 Scoring system
- 🔲 AI opponents
- 🔲 Mobile build (React Native / Expo)

---

## License

MIT License © 2025
