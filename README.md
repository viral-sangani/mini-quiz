# Mini Quiz — MiniPay Mini App

Production MiniPay Mini App for the MiniPay team. Admins schedule quizzes,
MiniPay users join from their wallet, play, and receive USDT prizes live.

This is a **pnpm + Turborepo monorepo** with three apps that deploy to three
separate domains:

- **`apps/quiz`** — Next.js 14 MiniPay miniapp for players (e.g. `play.miniquiz.xyz`).
- **`apps/admin`** — Next.js 14 desktop CMS for the MiniPay team (e.g. `admin.miniquiz.xyz`).
  Google + email magic-link auth via NextAuth v5.
- **`apps/api`** — Fastify backend on a VPS (e.g. `api.miniquiz.xyz`): REST + SSE,
  Prisma, cron scheduler, treasury payout signer.

Plus a shared types package at **`packages/shared`**.

## Flow

1. Admin signs in at the admin app and creates a quiz with a scheduled UTC start.
2. Players browse `/upcoming` on the quiz app or scan a QR and join inside MiniPay.
   Wallet auto-connects via `window.ethereum.isMiniPay`. No signing.
3. At `scheduledStart`, the backend scheduler flips the quiz to `LIVE`. Lobby
   closes — no late joins. Every joined player gets a synchronized countdown.
4. Players race through the questions. The leaderboard reorders live via SSE.
5. Quiz ends → backend creates `PENDING` payout rows for the top-N winners.
6. Admin opens `/payouts`, clicks **Approve** on each winner. The backend-held
   treasury wallet signs a USDT transfer (gas paid in USDT via CIP-64 fee
   abstraction) and the tx hash is broadcast. On confirmation, every player's
   phone shows the winner receiving their prize with a Blockscout link.

## Prerequisites

- Node 20+
- pnpm 9+
- Docker (for local Postgres)

## Local development

```bash
# 1. Install deps
pnpm install

# 2. Start Postgres
pnpm db:up

# 3. Set up env
cp .env.example .env      # then fill in secrets
# All three apps read from the root .env via symlinks:
ln -s ../../.env apps/api/.env
ln -s ../../.env apps/quiz/.env
ln -s ../../.env apps/admin/.env

# 4. Run Prisma migrations + seed admin accounts from ADMIN_EMAILS
pnpm db:migrate
pnpm db:seed

# 5. Run all three apps (turbo dev)
pnpm dev
```

After `pnpm dev`:

| App | URL |
|---|---|
| Player (MiniPay) | http://localhost:3000 |
| Admin CMS | http://localhost:3001 |
| API (Fastify) | http://localhost:4000 |

You can also run them individually:

```bash
pnpm dev:api
pnpm dev:quiz
pnpm dev:admin
```

## Environment variables

See `.env.example` for the full, commented list. Minimum set:

| Var | Scope | Notes |
|---|---|---|
| `DATABASE_URL` | api + admin | Postgres connection |
| `NEXTAUTH_SECRET` | api + admin | Shared HS256 secret |
| `NEXTAUTH_URL` | admin | `http://localhost:3001` locally |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | admin | Google OAuth |
| `EMAIL_SERVER` / `EMAIL_FROM` | admin | SMTP for magic-link login (optional) |
| `NEXT_PUBLIC_API_BASE_URL` | quiz + admin | Origin of the Fastify API |
| `NEXT_PUBLIC_QUIZ_BASE_URL` | admin | Origin of the quiz app (for QR codes) |
| `ADMIN_EMAILS` | api | Comma-separated, seeded to `role=ADMIN` on boot |
| `TREASURY_PRIVATE_KEY` | api | Hot wallet that signs all prize payouts |
| `CELO_RPC_URL` | api | Defaults to Forno public RPC |
| `CORS_ORIGIN` | api | Comma-separated allowlist (quiz + admin origins) |

> When you add Google OAuth credentials, register
> `http://localhost:3001/api/auth/callback/google` as an authorized redirect URI
> in Google Cloud Console (and your prod admin URL when you deploy).

## Deployment

Three separate deploys, three separate domains:

- **Quiz app → Vercel.** Root: `apps/quiz`. No DB access. Just needs
  `NEXT_PUBLIC_API_BASE_URL`.
- **Admin app → Vercel.** Root: `apps/admin`. Needs DB + NextAuth env. Neon
  integration provides `DATABASE_URL`.
- **API → your VPS.** Build and run:
  ```bash
  pnpm --filter @mini-quiz/api build
  node apps/api/dist/server.js    # or use pm2/systemd
  ```
  Put Caddy/nginx in front with TLS. Disable proxy buffering for
  `/rooms/:code/events` (the SSE endpoint).

Both Next.js apps share the same Postgres DB. The admin app owns NextAuth
session/account/verification tokens; the api owns the domain data; the User
table is shared.

## Repo layout

```
mini-quiz/
├── apps/
│   ├── quiz/                   # Next.js MiniPay miniapp (port 3000)
│   ├── admin/                  # Next.js desktop CMS    (port 3001)
│   └── api/                    # Fastify backend         (port 4000)
├── packages/
│   └── shared/                 # cross-app types + scoring + token constants
├── docker-compose.yml          # local Postgres
├── turbo.json                  # pipeline
└── pnpm-workspace.yaml
```

## Scripts

```bash
pnpm dev                # run all 3 apps in parallel (turbo)
pnpm dev:api            # backend only
pnpm dev:quiz           # player app only
pnpm dev:admin          # admin app only
pnpm build              # typecheck + build everything
pnpm typecheck          # turbo typecheck across the graph
pnpm db:up              # docker compose up -d postgres
pnpm db:down            # stop postgres
pnpm db:migrate         # prisma migrate dev (apps/api)
pnpm db:generate        # prisma generate (apps/api)
pnpm db:seed            # seed admin accounts from ADMIN_EMAILS
pnpm db:studio          # open Prisma Studio
```

## Stack

- **Next.js 14** App Router + TypeScript + Tailwind + Framer Motion
- **NextAuth v5** (Google + email magic link, Prisma adapter, JWT session)
- **Fastify 5** + Zod + Prisma 5 (Postgres) + Pino
- **viem v2** on Celo mainnet; USDT with CIP-64 fee abstraction
- **SSE** for realtime (single Fastify process; polling fallback for reconnects)
- **Turborepo + pnpm workspaces**
