---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The skills no longer repeat the path rule an agent has already loaded for the same files: `akan-query` points at the `module` rule for its musts (500 rows, soft removal, hookless writes, secret projections, cascade direction), `akan-transport` at the `auth` rule for guards and drops what the `server` rule says about body types, the 30-second default deadline and remote errors, `akan-service`, `akan-err` and `akan-mcp` at the `server` rule, and `akan-ui`, `cssRule` and `componentRule` at the `style` rule for class order and the colour vocabulary. The `server` rule drops its in-page agent line, which the `akan-agent` skill already holds and which no service, signal or document file needs. Run `akan agent install` in a workspace to pick up the new files.
