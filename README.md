# BattleLuck AI Sidecar

Node.js sidecar and helper functions for BattleLuck — battle-intelligence enrichment and Stripe-to-Discord relay.

The BattleLuck C# plugin calls HTTP endpoints exposed by this sidecar when `ai_sidecar.enabled` is on in `config/BattleLuck/ai_config.json`.

## What the C# plugin expects

- `GET /health`
- `POST /api/query/enrich`

Optional:
- `POST /stripe/discord`

## Local Development

```bash
npm install
npm run build
npm start
```

Default sidecar base URL for local dev: `http://localhost:3000`

## Environment Variables

- `BATTLELUCK_SHARED_SECRET` — bearer token shared with the C# plugin
- `BATTLELUCK_ALLOW_PUBLIC_HEALTH` — when `true`, `/health` is publicly accessible
- `BATTLELUCK_CORS_ALLOWED_ORIGINS` — comma-separated allowed browser origins
- `BATTLELUCK_CORS_ALLOW_ALL_ORIGINS` — when `true`, responds with `Access-Control-Allow-Origin: *`
- `PORT` — sidecar port (default `3000`)
- `STRIPE_SIGNING_SECRET` — Stripe webhook signature secret
- `DISCORD_WEBHOOK_URL` — Discord webhook for Stripe relay
- `PG_CONNECTION_URL` — optional Postgres connection for battle stats

## In-game Commands

- `bl.aistatus` / `bl.ai <question>`
- `bl.ai.status` / `bl.ai.test <query>` / `bl.ai.event`

See [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md) for full configuration details.
