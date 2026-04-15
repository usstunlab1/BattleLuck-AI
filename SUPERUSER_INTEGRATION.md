# Superuser Integration Guide

Superuser is optional in this repo. It can be used for external analytics, remote helper services, and REST/MCP tooling outside the V Rising plugin.

BattleLuck's C# plugin expects a sidecar API base URL that supports `GET /health` and `POST /api/query/enrich`. A Superuser chat page URL does not satisfy that requirement unless you have explicitly built and exposed matching routes.

## Environment Variables

- `SUPERUSER_INVITE_URL` — informational only
- `SUPERUSER_REST_API_URL` — optional integration reference
- `SUPERUSER_MCP_SERVER_URL` — optional MCP endpoint reference
