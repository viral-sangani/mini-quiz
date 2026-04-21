# Mini Quiz — Celo × MiniPay Roadshow

Live multiplayer quiz with on-chain prize ceremony. Built for the MiniPay Philippines roadshow.

## Flow

1. Host creates a room on a projector (`/host`)
2. Audience scans QR inside **MiniPay** → wallet auto-connects, they enter a name, land in the lobby
3. Host starts the quiz → all players race through 10 questions on their phones
4. Big-screen leaderboard reorders live via SSE
5. Time ends → podium reveals → host clicks **Send Prize** for 🥇/🥈/🥉 → USDm transfers live, tx confirmations broadcast to every phone

## Dev

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/host` to create a room. For local testing without MiniPay, append `?dev=1` to the player URL to use a fake wallet address.

## Hosting

Deploy to Vercel. SQLite file lives at `/tmp/quiz.db` (ephemeral per cold start — fine for a one-session event).

One Vercel deployment per event. Pre-warm with a visit right before the audience arrives.

## Host wallet setup

The host clicks "Send Prize" from a browser with `window.ethereum` (MiniPay browser on a phone, or a desktop with a Celo-configured wallet). The host wallet must be pre-funded with enough USDm to cover all three prizes plus gas (gas is paid in USDm via fee abstraction).

## Stack

- Next.js 14 App Router + TypeScript + Tailwind
- better-sqlite3 for state, SSE for realtime
- viem v2 for Celo wallet interactions (USDm transfers with `feeCurrency`)
- framer-motion, canvas-confetti for the Duolingo feel

## Key paths

- `lib/minipay.ts` — MiniPay detection, auto-connect, `sendUsdmPrize`
- `lib/events.ts` — in-memory SSE broker
- `lib/seed-questions.ts` — 10 placeholder questions (team replaces before event)
- `app/host/[roomId]/page.tsx` — projector view
- `app/play/[roomId]/page.tsx` — player gameplay
