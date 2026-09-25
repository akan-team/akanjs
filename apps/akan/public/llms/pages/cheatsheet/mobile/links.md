# Deep Links

- Source: /cheatsheet/mobile/links
- Mirror: /llms/pages/cheatsheet/mobile/links.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Deep Link Setup (#deep-link-setup)

## Content

Deep Links

Deep Link Setup

Deep links open a CSR route from outside the app. Use schemes for app-only URLs and domains for verified HTTPS links. Push notification clicks use the same routing path through data.url.

Think of deep link as the feature, and schemes/domains as the two common ways to implement it. Scheme links such as shop://orders/1 are easy to test and app-only. Domain links such as https://shop.example.com/orders/1 require iOS/Android verification, but they behave like normal web links and are better for sharing, emails, and push notification URLs.

Custom app-only URLs such as shop://orders/1. Easy to test, but not domain-verified.

Verified HTTPS links such as https://shop.example.com/orders/1. iOS uses apple-app-site-association; Android uses assetlinks.json.

Apple Developer Team ID used for universal link association files.

Signing certificate fingerprints used by Android app links. Debug builds and release builds usually have different fingerprints.

## Code Examples

### apps/myapp/akan.config.ts

```ts
const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        deepLinks: {
          schemes: ["shop"],
          domains: ["shop.example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "AA:BB:CC:DD:...",
            ],
          },
        },
      },
    },
  },
};
```

### Android debug SHA-256

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

