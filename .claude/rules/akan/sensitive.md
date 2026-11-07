---
description: Secret and env files: never print, commit or summarise their values.
paths:
  - "**/.env*"
  - "**/*secret*"
  - "**/*credential*"
  - "infra/**"
---

<!-- akan:generated -->

# Secrets And Env Safety

- Never print, summarize, commit, or expose real secret values, credentials, tokens, private keys, or `.env`
  contents; document env keys by name with placeholders only.
- Preserve the env/secret flow through `bun run downloadEnv`, `uploadEnv`, `downloadSecret`, `uploadSecret`, and
  keep Jenkins and deployment assumptions intact unless the task asks otherwise.
- Treat generated env/secret artifacts as sensitive even when they are not named `.env`.
