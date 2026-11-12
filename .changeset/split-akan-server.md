---
"akanjs": patch
---

Internal: `AkanServer` is composed from one collaborator per concern instead of one 91-member class: `server/serverConfig.ts` for its env and option parsing, `server/routing/serverListener.ts` for the HTTP and WebSocket servers, HMR upgrades and local room publishing, `server/routing/builtinRoutes.ts` for the OpenAPI, MCP, devtools and solo routes, `server/lifecycle/parentChannel.ts` for the gateway IPC channel and the orphan exit, and `server/serverMetrics.ts` for metrics reporting. Its start and stop, including a stop during a start and the unwind of a failed one, behave as before, and `AkanServer` and its option types are unchanged.

An invalid or colliding route prefix and a missing WebSocket adaptor now throw an `AkanError` coded `invalidConfig`, with the same message as before.
