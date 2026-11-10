---
"akanjs": patch
---

Internal: the `AkanApp` gateway is composed from one collaborator per concern under `server/gateway/` instead of one 155-member class. Child supervision and restarts, the HTTP and WebSocket relays, rooms, status endpoints, logging and the dev-host channel behave as before, and `AkanApp` and `AkanAppOptions` are unchanged.
