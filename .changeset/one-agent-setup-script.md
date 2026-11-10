---
"@akanjs/cli": patch
"create-akan-workspace": patch
---

A new workspace's `package.json` lists `akan agent install all --force` once, as `setup:agent`, the name its `AGENTS.md` tells an agent to run. The `agent:setup` alias, which ran the same command and was named nowhere, is gone.
