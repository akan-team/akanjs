---
"@akanjs/native": minor
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

An external view opens only origins the app's config lists, in `native.desktop.externalView.allowOrigins`: a view's own `allowOrigins` narrow within them, and an origin outside them is `NOT_ALLOWED`, naming that key. `evaluate` and `initScript` need their own permission, granted by `desktop.externalView.evaluate: true`, and `sendKey` its own, granted by `desktop.externalView.sendKey: true`; both are off by default. Opening a view that is already open keeps its origins or narrows them, and refuses one it was not opened for until it is closed. Origins compare exactly as the URL parser reads them: scheme, host and port, the host in punycode without a trailing dot, the default port left out, and an origin with user info refused; there are no wildcards. The desktop shell checks all of this itself on macOS, Windows and Linux, and on Windows a view now takes only the two DevTools calls `sendKey` and `capture` make. A top-level navigation or redirect off a view's origins stays refused, as before.

**Upgrading.** An app that lists `external-view` opens no view until its `akan.config.ts` names the origins, and needs `evaluate` and `sendKey` only for the calls it makes:

```ts
native: {
  plugins: ["external-view"],
  desktop: {
    externalView: {
      allowOrigins: ["https://board.example"], // every origin a view's allowOrigins names
      evaluate: true, // when it calls evaluate or opens with initScript
      sendKey: true, // when it calls sendKey
    },
  },
},
```

An app built with the akan-native CLI's own config grants the same in its capabilities: `{ identifier: "external-view:default", allow: [{ origin: "https://board.example" }] }`, `"external-view:allow-evaluate"` and `"external-view:allow-sendKey"`.
