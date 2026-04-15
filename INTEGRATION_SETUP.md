# BattleLuck AI Integration Setup

## Overview

Runtime flow:

```
Player query -> BattleLuck C# plugin -> optional sidecar enrichment -> Gemini -> response
```

## Recommended Configurations

### Option 1: Local sidecar (development)

```json
{
  "enabled": true,
  "google_ai": {
    "api_key": "YOUR_GEMINI_API_KEY",
    "model": "gemini-2.5-flash"
  },
  "ai_sidecar": {
    "enabled": true,
    "base_url": "http://localhost:3000",
    "auth_key": "YOUR_SHARED_SECRET",
    "timeout_seconds": 10
  }
}
```

### Option 2: Gemini only

```json
{
  "enabled": true,
  "google_ai": { "api_key": "YOUR_GEMINI_API_KEY", "model": "gemini-2.5-flash" },
  "ai_sidecar": { "enabled": false, "base_url": "", "auth_key": "", "timeout_seconds": 10 }
}
```

## Health Check

```bash
curl -H "Authorization: Bearer <auth_key>" http://localhost:3000/health
```

## Security Notes

- Keep API keys and shared secrets out of source control.
- Use bearer auth between the plugin and sidecar.
- Treat Stripe and Discord webhook secrets as credentials.
