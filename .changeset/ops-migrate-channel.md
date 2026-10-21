---
"akanjs": minor
"@akanjs/cli": minor
---

The ops channel runs data migrations, so a control plane reaches a host it has no shell on. `POST /_akan/ops/migrate` `{ id, action, target?, params?, expect?, items? }` starts `ops migrate <action> … --json` in a child process, and `GET /_akan/ops/migrate/:id` answers its exit code and the result line it printed. An ops token may carry `sub`, whom the control plane acts for: a migrate job records it as the run's actor, and apply and rollback refuse a token without one.
