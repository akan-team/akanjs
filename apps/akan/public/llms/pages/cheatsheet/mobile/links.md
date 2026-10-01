# Deep Links

- Source: /cheatsheet/mobile/links
- Mirror: /llms/pages/cheatsheet/mobile/links.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Deep Link Setup (#deep-link-setup)
- Link Fields (#deep-link-fields)

## Content

Deep Links

Deep Link Setup

A deep link opens a specific screen of the app from a URL outside it, such as a link in a message or a tapped push notification. You set it up once, in the `native` section of `akan.config.ts`: `deepLinks` names the links, and `ios` and `android` hold what verifies a domain.

Two Kinds Of Link

Deep link is the feature; `schemes` and `domains` are the two usual ways to build it. You can declare both:

- schemes: An app-only link. It needs no verification, so it is the easy one to test during development. — Scheme link — Example: `shop://orders/1`

- domains: Works like a normal web link but needs iOS and Android verification. Best for sharing, email and push URLs. — Domain link — Example: `https://shop.example.com/orders/1`

Declare It

Write `deepLinks` in `native`, and the values that verify a domain in its `ios` and `android` sections:

**Every target takes them.** A target that sets `schemes` or `domains` replaces that list; it does not add to it.

**Hosts only in `domains`.** Write `shop.example.com`; an `https://` or a path you add is dropped.

**`ios.teamId` and `android.sha256CertFingerprints` serve `domains`.** If you only use scheme links, leave both out.

**Rerun the app to apply.** After a change, run `akan start-ios` or `akan start-android` again.

Where A Link Lands

A scheme link, a domain link and a push notification's `data.url` all open the same CSR route:

Incoming link

What it opens

- shop://orders/1: Scheme link. `orders` becomes the first path segment, so it opens `/orders/1`.

- https://shop.example.com/orders/1: Domain link. The path is used as is and opens `/orders/1`.

- data.url = "/orders/1": A tapped push notification. It opens `/orders/1` the same way.

**Back works after a cold start.** When a link launches the app, the parent screen or the start screen is stacked first, so back stays inside the app.

Native Config

Targets and the rest of the `native` block.

Push Notifications

Sending a `url` so a tap lands on a screen.

Link Fields

Every field is optional. Each platform reads only what it needs, so declare only what your link style requires:

- deepLinks.schemes (string[]): App-only URL schemes, such as `shop` in `shop://orders/1`. — Example: `deepLinks: { schemes: ["shop"] }`

- deepLinks.domains (string[]): Hosts whose HTTPS links open the app once iOS and Android verify them. — Example: `deepLinks: { domains: ["shop.example.com"] }`

- ios.teamId (string): Your Apple Developer Team ID. iOS uses it to verify `domains`. — Example: `ios: { teamId: "TEAMID" }`

- android.sha256CertFingerprints (string[]): SHA-256 fingerprints of the certificates that sign the app. Android uses them to verify `domains`. — Example: `android: { sha256CertFingerprints: ["AA:BB:CC:DD:..."] }`

What Each Link Style Needs

Scheme links need one field. Domain links need three, and each platform reads its own part:

Field

iOS

Android

- Scheme links

  - deepLinks.schemes

- Domain links

  - deepLinks.domains

  - ios.teamId

  - android.sha256CertFingerprints

Read by this platform

Not read

Domain Verification

A domain link opens the app only after the platform confirms that the app belongs to the domain. It checks a file served from that domain:

**The Akan server serves both files.** It answers `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from these fields, so point the domain at your app's server and redeploy it after a change.

**iOS checks the Team ID and appId.** The file lists `<teamId>.<appId>` from `ios.teamId` and the target's `appId`, so both must be your real values.

**Android checks the signing certificate.** Debug and release builds are signed by different keys, so list both fingerprints.

**A debug build verifies only against a non-main server.** Its package ends in `.debug`, which `assetlinks.json` lists only when `AKAN_PUBLIC_ENV` is not `main`. The debug key's SHA-256 must also be in `sha256CertFingerprints`.

Platform Docs

Open Apple Universal Links docs

Open Android App Links docs

Getting The Android Fingerprint

Read it from the keystore that signs the build. Debug builds are signed with the runtime's own debug keystore, created by the first Android build:

Release builds are signed with the upload key akan release-android reads from the environment:

**With Play App Signing, add Google's key too.** Play re-signs what you upload, so the installed app carries the app signing key: copy its SHA-256 from Play Console (Setup, App signing) and list it next to the upload and debug ones.

**A domain link that fails verification opens in the browser, not the app.** The fingerprint of the key that signed the installed build must be in the list.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    deepLinks: {
      schemes: ["shop"],
      domains: ["shop.example.com"],
    },
    ios: { teamId: "TEAMID" },
    android: { sha256CertFingerprints: ["AA:BB:CC:DD:..."] },
  },
};

export default config;
```

### Terminal

```bash
keytool -list -v \
  -keystore ~/.akan/native/debug.keystore \
  -alias androiddebugkey \
  -storepass android
```

### Terminal

```bash
keytool -list -v \
  -keystore "$MYAPP_RELEASE_STORE_FILE" \
  -alias "$MYAPP_RELEASE_KEY_ALIAS"
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

