# @libs/util

Infrastructure adaptors, security primitives and generic UI that every other lib and app builds on.

## Entry points

| Import | What it holds |
|---|---|
| `@libs/util/server` | server barrel: `option`, the `security` and `localFile` services |
| `@libs/util/srvkit` | adaptors: `StorageApi` (`ObjectStorageApi`, `BlobStorageApi`), `FileManager`, `UntrustedFetch` (SSRF-safe downloads), `EmailApi`, `PurpleApi` (SMS), `PushNotificationServer`, `ApnsClient`, `DiscordApi`, `GithubApp`, `IpfsApi`; tokens and secrets (`jwtSign`, `jwtVerify`, `resolveJwt`, `resolveJwtSecret`, `createOpaqueToken`, `hashToken`); image helpers |
| `@libs/util/webkit` | browser hooks: `usePushNotification`, `useSpeech`, `useFileDrop` |
| `@libs/util/common` | pure helpers: `formatBytes`, `matchesAccept`, `randomString`, `shuffle`, `weightedPick`, `validate`, `shortenUnit`, `HandlerSet`, shell quoting |
| `@libs/util/ui` | `Upload`, `CropImage`, `Signature`, `MapView`, `Chart`, `PdfViewer`, `QRCode`, `Print`, `CodeInput`, `TryButton`, … and the workspace recipes (`buttonRecipe`, `inputRecipe`, …) |
| `@libs/util/plugin` | `createFirebaseMessagingServiceWorker` |

The camera, contacts, location, push-notification and speech plugins in `plugin/*.plugin.ts` are registered by this lib's
`akan.config.ts`, so every app that mounts it inherits them.

## Modules

- `_security`: JWT signing for access tokens and typed, expiring tokens — [abstract](lib/_security/security.abstract.md)
- `_localFile`: serves blob storage over HTTP, sandboxed, 404 for anything missing or outside the root — [abstract](lib/_localFile/localFile.abstract.md)
- `_util`: the lib's root service and the notification-permission and map-view store — [abstract](lib/_util/util.abstract.md)
- scalars: `coordinate`, `accessToken`, `accessStat`

## Options (`env.server.*` → `ModulesOptions`)

| Key | Meaning |
|---|---|
| `security.jwtSecret` | access-token secret; required outside `local` |
| `security.sso` | SSO provider credentials, read by `@libs/shared` |
| `objectStorage`, `privateStorage` | public and private object storage |
| `mailer`, `message`, `pushNoti`, `discord` | SMTP, SMS, push (FCM/APNs) and Discord webhook settings |
| `githubAppInfo`, `ipfs`, `iapVerify` | GitHub App, IPFS gateway, in-app purchase verification |
| `hostname` | public host name; unset, derived from the app and environment |
