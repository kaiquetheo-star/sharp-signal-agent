# 🎯 Sharp Signal Agent

[![Track 1](https://img.shields.io/badge/Track%201-Autonomous%20Agents%20%26%20Data-0A7CFF?style=for-the-badge)](https://github.com/kaiquetheo-star/sharp-signal-agent)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat-square&logo=solana&logoColor=white)](https://explorer.solana.com/?cluster=devnet)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TxLINE](https://img.shields.io/badge/API-TxLINE%20World%20Cup%20Free%20Tier-E11D48?style=flat-square)](https://txodds.com/)
[![Coverage](https://img.shields.io/badge/Detector%20Lines-100%25-brightgreen?style=flat-square)](#-testing)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

> **Track 1: Autonomous Agents and Data — TxLINE Hackathon 2026**

An autonomous trading agent that monitors sports odds in real time via the **TxLINE API**, detects *Sharp Money* market shocks with a sliding-window deviation engine, and **immutably registers each signal on Solana** via the Memo Program — creating cryptographic proof that the agent saw the move *before* the market corrected.

**Repository:** [github.com/kaiquetheo-star/sharp-signal-agent](https://github.com/kaiquetheo-star/sharp-signal-agent)

---

## 🎬 Demo Video

>  **▶ Watch the demo** [https://youtu.be/6bTAqIjj0KA]

## 🚀 Overview

**Sharp Signal Agent** is a production-ready, three-layer autonomous system built for the TxLINE Hackathon (Track 1). It ingests live World Cup odds over a low-latency **Server-Sent Events (SSE)** stream (&lt;1s), runs a statistical anomaly detector over a sliding window of prices, and — on every confirmed sharp move — writes a compact JSON memo on-chain so the detection timestamp is publicly verifiable forever.

Unlike traditional sports-betting bots that *claim* they called the market early, this agent produces **cryptographic proof**. Each signal becomes a Solana transaction. Anyone can open Solana Explorer, read the Memo instruction, and verify: *“This agent recorded a 50%+ deviation on France vs Spain under goals at timestamp T — before the bookmakers fully adjusted.”*

### Key features

- ⚡ **Real-time SSE stream** from TxLINE (`/odds/stream`) — not polling-first
- 📈 **Sliding-window anomaly detection** — window of 10, min 5 samples, **3%** threshold, **60s** per-market cooldown
- ⛓️ **On-chain signal registration** via Solana **Memo Program** (Devnet)
- 🖥️ **Live web dashboard** — React 18 + Vite + Tailwind (feed, stats, charts, Explorer links)
- 🧪 **100% line coverage** on the core `SharpDetector` module (15 unit tests, Vitest)
- 🔐 **Hybrid authentication** — guest JWT + on-chain Free Tier subscription + signed token activation

---

## 🏗️ Architecture

```text
  TxLINE API (SSE)          Sharp Detector           Solana Memo Program
  ─────────────────         ──────────────           ───────────────────
  Real-time odds      →     Deviation > 3%     →     On-chain proof
  (<1s latency)             sliding window           immutable timestamp
        │                         │                         │
        ▼                         ▼                         ▼
  /odds/stream              Z-style % deviation       MemoSq4gqABAX...
  /fixtures/snapshot        window=10 · cool=60s      Explorer-verifiable
        │
        └──────────────────► Dashboard (React)
                             WS + REST · :5173 / :3001
```

| Layer | Role |
| --- | --- |
| **1. Data ingestion** | `OddsStream` connects to TxLINE SSE with `Last-Event-ID` resume and exponential reconnect. Fallbacks / helpers use fixtures + odds snapshots. |
| **2. Detection engine** | `SharpDetector` maintains per-`(fixture, market, outcome)` price history and emits `SHARP_MOVEMENT` when absolute percentage deviation from the moving average exceeds 3%. |
| **3. On-chain proof** | Confirmed signals are serialized to a compact JSON memo and submitted via Solana’s Memo Program. Signatures + Explorer URLs are persisted and pushed to the dashboard. |

---

## 🛠️ Tech Stack

| Area | Stack |
| --- | --- |
| **Runtime** | Node.js 22 + TypeScript 5.4 (`tsx`) |
| **Blockchain** | Solana Devnet + Anchor / `@coral-xyz/anchor` + `@solana/web3.js` |
| **API** | TxLINE (World Cup Free Tier — Service Level 1) |
| **Frontend** | React 18 + Vite + Tailwind CSS + Recharts |
| **Testing** | Vitest + `@vitest/coverage-v8` (100% lines on detector) |
| **Libraries** | `axios`, `eventsource`, `bs58`, `tweetnacl`, `ws`, `dotenv` |

---

## ⚡ Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/kaiquetheo-star/sharp-signal-agent.git
cd sharp-signal-agent
```

### 2. Install dependencies

```bash
npm install
cd dashboard && npm install && cd ..
# or: npm run dashboard:install
```

### 3. Configure environment

Copy the template and fill in your wallet key:

```bash
cp .env.example .env
```

`.env` template:

```env
NETWORK=devnet
WALLET_PRIVATE_KEY=your_base58_private_key_here
TXLINE_JWT=will_be_generated
TXLINE_API_TOKEN=will_be_generated
# Optional:
# SOLANA_RPC_URL=https://api.devnet.solana.com
# USE_SSE=true
```

### 4. Generate a wallet and fund Devnet SOL

```bash
# Example: create a keypair, export base58 secret to WALLET_PRIVATE_KEY
# then airdrop Devnet SOL for memo fees
solana config set --url devnet
solana airdrop 2
```

### 5. Authenticate with TxLINE (hybrid JWT + on-chain)

```bash
npm run auth
```

This runs the full Free Tier flow:

1. `POST /auth/guest/start` → guest JWT  
2. On-chain subscribe to the **txoracle** program (Level 1)  
3. Sign the activation message (ed25519 / `tweetnacl`)  
4. `POST /api/token/activate` → `X-Api-Token` written back into `.env`

### 6. Start the agent

```bash
npm run start
```

Starts the detector loop + dashboard API (default `http://localhost:3001`).

### 7. Start the dashboard

```bash
cd dashboard && npm run dev
# or from root: npm run dashboard:dev
```

Open **http://localhost:5173**.

---

## 📖 Usage

| Command | Description |
| --- | --- |
| `npm run auth` | Hybrid TxLINE authentication (JWT + on-chain activation) |
| `npm run start` | Run the agent + dashboard API (`:3001`) |
| `npm run dashboard:dev` | Vite UI at `http://localhost:5173` |
| `npm run test` / `npm run test:run` | Vitest (watch / single run) |
| `npm run test:coverage` | Coverage report (detector thresholds enforced) |
| `npm run backtest` | Local backtest analysis against recorded odds |

### Agent console output (example)

```text
🤖 Starting Sharp Signal Agent (Track 1 - TxLINE Hackathon)...
🔑 Agent Wallet: 5k9xj14xw3RCipeuv9XFWdd1o4ZpwMBjc55gRvEP1vvU
📋 Fixtures loaded · SSE connected

🚨 SHARP SIGNAL DETECTED!
   🏟️  Match: France vs Spain
   📊 Market: OVERUNDER_PARTICIPANT_GOALS
   🎯 Outcome: under
   💰 Current Price: 1.13
   📈 Average: 2.2736
   ⚡ Deviation: 50.30%

🔗 SIGNAL REGISTERED ON-CHAIN!
   📝 Memo: {"agent":"SharpSignalAgent","f":"18237038",...}
   🔍 Explorer: https://explorer.solana.com/tx/3MDGoZDo...?cluster=devnet
```

---

## 🌐 TxLINE API Integration

Base origin (Devnet): `https://txline-dev.txodds.com`

| Endpoint | Method | Description |
| --- | --- | --- |
| `/auth/guest/start` | `POST` | Obtain guest JWT |
| `/api/token/activate` | `POST` | Activate API token with on-chain proof |
| `/fixtures/snapshot` | `GET` | List all active fixtures |
| `/odds/snapshot/{fixtureId}` | `GET` | Get odds for a specific fixture |
| `/odds/stream` | **SSE** | Real-time odds stream (&lt;1s latency) |

The agent prefers **SSE** (`USE_SSE=true` by default) with reconnect + credential refresh on `401`/`403`. Snapshot endpoints seed fixture names and support tooling / fallback paths.

---

## 🔍 On-Chain Proof Example

Every detected signal is written to Solana via the Memo Program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`).

**Live Devnet transaction:**  
[https://explorer.solana.com/tx/3MDGoZDo1yb7QAQs2j6hu3N3fyj4fdEwPZbtYXGEbXGCWbHDjFEmhpyeD5ebbPuzDQwzKpDv7LuKURjv9DqkBHef?cluster=devnet](https://explorer.solana.com/tx/3MDGoZDo1yb7QAQs2j6hu3N3fyj4fdEwPZbtYXGEbXGCWbHDjFEmhpyeD5ebbPuzDQwzKpDv7LuKURjv9DqkBHef?cluster=devnet)

**Memo payload (compact JSON):**

```json
{
  "agent": "SharpSignalAgent",
  "f": "18193785",
  "m": "OVERUNDER_PARTICIPANT_GOALS",
  "o": "under",
  "p": 4.769,
  "avg": "2.3565",
  "d": "102.38",
  "t": 1783379788214
}
```

| Field | Meaning |
| --- | --- |
| `f` | Fixture ID |
| `m` | Market / super-odds type |
| `o` | Outcome (`over` / `under` / …) |
| `p` | Current price at detection |
| `avg` | Sliding-window moving average |
| `d` | Deviation % |
| `t` | Unix ms timestamp (agent clock → on-chain order) |

### How anyone can verify

1. Open the Explorer link (cluster = **devnet**).  
2. Expand **Instruction Details** → **Memo Program**.  
3. Read the UTF-8 memo JSON.  
4. Compare `t`, `p`, and `d` with later market / match events — the chain proves the agent logged the move at that height/time.

Additional recent proofs: see `signals.json` (`txSignature` + `explorerUrl` for each event).

---

## 🧮 Detection Algorithm

The engine is a **sliding-window percentage deviation** detector (sharp-money shock vs. recent baseline) — simple, fast, and fully unit-tested.

| Parameter | Default | Purpose |
| --- | --- | --- |
| `windowSize` | `10` | Keep last N prices per market key |
| `minSamples` | `5` | Warm-up before scoring |
| `threshold` | `0.03` (3%) | Fire when `\|price − avg\| / avg` exceeds this |
| `cooldownMs` | `60_000` | One signal per market key per minute |

Key = `` `${fixtureId}_${market}_${outcome}` `` — markets stay isolated.

### Pseudocode (TypeScript)

```typescript
function analyze(key: string, currentPrice: number): SharpSignal | null {
  if (Date.now() - lastSignalAt(key) < 60_000) {
    push(key, currentPrice);
    return null;
  }

  push(key, currentPrice); // sliding window of 10
  const prices = history.get(key)!;
  if (prices.length < 5) return null;

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (avg === 0 || !Number.isFinite(avg)) return null;

  const deviation = Math.abs(currentPrice - avg) / avg;
  if (deviation > 0.03) {
    markCooldown(key);
    return emitSharpMovement({ currentPrice, avg, deviation });
  }
  return null;
}
```

Implementation: [`src/agent/detector.ts`](./src/agent/detector.ts).

---

## 🖥️ Dashboard Features

The dashboard is a first-class part of the product — not an afterthought.

- 🔴 **Live / Offline** status + agent wallet short address  
- 📡 **Real-time signal feed** via WebSocket (`/ws`) with REST backfill  
- 📊 **Stats cards** — total signals, max deviation, network, etc.  
- 📈 **Charts** — signals by market and deviation over time (Recharts)  
- 🔗 **Solana Explorer** deep-links on every card  
- 💾 Persistence via `signals.json` + in-process broadcast from the agent

**Ports:** API `http://localhost:3001` · UI `http://localhost:5173`

---

## 🧪 Testing

**15 unit tests** cover the detector end-to-end:

| Area | What is asserted |
| --- | --- |
| Minimum window | No signal before 5 readings; analysis starts at 5 |
| Anomalies | Quiet &lt;3% moves ignored; spikes up **and** down fire |
| Cooldown | No duplicate signals within 60s; allowed after |
| Isolation | Separate fixture/market/outcome keys do not interfere |
| Sliding window | Oldest readings drop past `windowSize` |
| Edge cases | Zero prices, zero mean, NaN, extreme values |
| Fixtures | Sharp move from `tests/fixtures/sample-odds.json` |

```bash
npm run test:run        # 15/15 passing
npm run test:coverage   # lines 100% · funcs 100% on src/agent/detector.ts
```

Coverage gates in `vitest.config.ts` enforce high thresholds on the detector module.

---

## 📁 Project Structure

```text
sharp-signal-agent/
├── src/
│   ├── agent/
│   │   └── detector.ts          # Sharp money detection logic
│   ├── txline/
│   │   └── stream.ts            # SSE stream handler (EventSource)
│   ├── api/
│   │   ├── dashboard-server.ts  # REST + WebSocket for the UI
│   │   └── signals-store.ts     # Signal persistence / stats
│   ├── idl/
│   │   └── txoracle.json        # On-chain subscription IDL
│   ├── auth.ts                  # Hybrid JWT + on-chain auth flow
│   ├── index.ts                 # Main agent loop + Memo registration
│   ├── backtest-local.ts        # Backtest analysis
│   └── validate-signal.ts       # Signal validation helper
├── dashboard/                   # React + Vite + Tailwind frontend
├── tests/
│   ├── fixtures/
│   │   └── sample-odds.json
│   └── sharp-detector.test.ts   # Unit tests (15)
├── signals.json                 # Recorded on-chain signals
├── .env.example                 # Environment template
├── vitest.config.ts
└── README.md
```

---

## 🗺️ Roadmap

- [x] SSE stream (&lt;1s) with reconnect / auth refresh  
- [x] React live dashboard (WS + REST)  
- [x] Vitest suite with 100% line coverage on detector  
- [ ] Historical backtesting engine vs. final results / ROI  
- [ ] Multi-league support (paid TxLINE tiers)  
- [ ] Mainnet deployment with TxL token staking  
- [ ] Advanced ML models for prediction scoring  
- [ ] Mobile push notifications  

---

## 👨‍💻 Team

| Name | Role |
| --- | --- |
| **Kaique Theodoro** | Full-Stack Web3 Developer |
| **Maicon Jean** | Marketing |

---

## 📄 License

[MIT License](./LICENSE) — Copyright © 2026 Kaique Theodoro & Maicon Jean

Built for the **TxLINE Hackathon 2026**.

---

## 🙏 Acknowledgments

- **TxODDS Team** — robust API, World Cup Free Tier, and outstanding Discord support  
- **Superteam Earn** — organizing the hackathon  
- **Solana Foundation** — blockchain infrastructure that makes auditable agents practical  

---

<p align="center">
  <sub>🎯 Detect early. Prove it on-chain. Audit forever.</sub>
</p>
