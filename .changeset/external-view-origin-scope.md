---
"@akanjs/native": minor
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

An external view opens only origins the app's config lists, in `native.desktop.externalView.allowOrigins`: a view's own `allowOrigins` narrow within them, and an origin outside them is `NOT_ALLOWED`, naming that key. `evaluate` and `initScript` need their own permission, granted by `desktop.externalView.evaluate: true`, and `sendKey` its own, granted by `desktop.externalView.sendKey: true`; both are off by default. While a view is open, opening its id again keeps its origins or narrows them, and refuses one it was not opened for; once closed, the id opens again for any origins the config lists, with the same browser profile, which belongs to the id. Origins compare exactly as the URL parser reads them: scheme, host and port, the host in punycode without a trailing dot, the default port left out, and an origin with user info refused; there are no wildcards. A view loads a URL as the URL parser writes it, so the engine never reads the page's text another way. A page opens a view only over its own window. The desktop shell checks all of this itself on macOS, Windows and Linux, and grants nothing when the build carries no permission list; on Windows a view now takes only the two DevTools calls `sendKey` and `capture` make. A top-level navigation or redirect off a view's origins stays refused, as before.

A plugin manifest's `scope` can say `required: true`: then every grant of the plugin, not only `<plugin>:default`, is within its `defaultScope` unless the grant gives its own `allow`, and a scope entry naming no field is a build error. `external-view` says so.

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

An app built with the akan-native CLI's own config grants the same in its capabilities: `{ identifier: "external-view:default", allow: [{ origin: "https://board.example" }] }`, `"external-view:allow-evaluate"` and `"external-view:allow-sendKey"`. A grant of `external-view:all` or `external-view:allow-open` opens no origin unless its own `allow` lists them. A page that passed `window` to `open` passes its own window or leaves it out.
