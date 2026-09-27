---
"akanjs": patch
"@akanjs/devkit": patch
---

A native dev build's API calls and sockets go through the dev gateway, so a phone on the same network — or the
simulator, the emulator and a desktop app — reaches `akan start` without a reversed port.

- A page the gateway served calls its own origin: `getEnv().serverHttpUri` is `<page origin><api prefix>` and the
  websocket follows it, unless `AKAN_PUBLIC_SERVER_URL` names a server. A release build is unchanged.
- The iOS, Android and desktop hosts carry the method, the body and the request headers, `authorization`
  included, to the gateway; the gateway relays the app's `<prefix><websocketPrefix>` socket. Android hands the
  host no request body, so a call that carries one goes to the gateway's `http://localhost` origin directly and
  the server answers its CORS.
- A desktop dev build opens the target's start page instead of `/`, and builds when the web root has no
  `index.html` yet.
- `NativeWebDir` lists the web root in `/`-separated paths on Windows too.
