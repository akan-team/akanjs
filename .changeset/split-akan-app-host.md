---
"@akanjs/devkit": patch
---

Internal: the dev host (`AkanAppHost`) runs the backend, the builder, idle suspend, RSS recycling and dev-plan restarts through one collaborator each instead of one 126-member class. Its public members, start and stop order, restart timing and messages are unchanged.
