---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A route with a `basePath` chooses the lib pages it mounts.

`syncPageLibs` linked every listed lib's pages under every `basePath` of `routes`, so adding `{ basePath: "edge", domains: {} }` to an app also served the shared lib's sign-in and admin pages under `/edge`, with no way to leave them out for that route alone.

- **`routes[].syncPageLibs`** replaces the app's `syncPageLibs` for that `basePath`: `false` mounts no lib page there, an array exactly those libs, and a route that does not set it keeps the app's value. `akan sync <app>` removes the links a route no longer wants.
- A route without a `basePath` that sets it is refused, since only a `basePath` has lib pages of its own.

Upgrade: nothing to change. `AkanRouteConfig` gains the optional `syncPageLibs`.
