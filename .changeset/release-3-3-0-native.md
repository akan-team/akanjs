---
"@akanjs/native": minor
---

An external view opens only the origins the app's config lists, and the iOS and Android shells leave the keyboard to the page.

- **External view.** A view opens only origins named in `native.desktop.externalView.allowOrigins`; `evaluate` and `initScript` need `externalView.evaluate: true` and `sendKey` needs `externalView.sendKey: true`, both off by default. Origins compare exactly, with no wildcards, and the desktop shell checks this itself on macOS, Windows and Linux. A plugin manifest's `scope` can say `required: true`, so every grant of the plugin stays within its `defaultScope` unless the grant gives its own `allow`.
- **Keyboard.** In keyboard mode "none" the iOS shell takes the keyboard notifications away from WKWebView, and the Android shell hands the WebView its insets with the keyboard taken out. Both tell the page through `__AKAN_NATIVE__.keyboardAvoidance = "page"` and report the keys' overlap and animation, so the page ends its content at the keys instead of being panned.
- **Dev builds.** The native config takes `ios.debugAppIdSuffix`, `ios.debugAppNameSuffix` and `android.debugAppNameSuffix`: a debug build installs as `<appId>.debug` beside the store app and reads "<appName> Dev".

**Upgrading.** An app that lists `external-view` opens no view until its config names the origins. An app built with the akan-native CLI's own config grants `{ identifier: "external-view:default", allow: [{ origin: "https://board.example" }] }`, with `"external-view:allow-evaluate"` and `"external-view:allow-sendKey"` for those calls.
