# @libs/shared

Accounts, sign-in, files and the shared admin console for every app in this workspace, plus the rich-text editor.
Built on `@libs/util`; every app mounts it.

## Entry points

| Import | What it holds |
|---|---|
| `@libs/shared/server` | server barrel: `option`, services, signals, documents |
| `@libs/shared/client` | client barrel: `cnst`, `fetch`, `st`, module components (`User`, `Admin`, `File`, …) |
| `@libs/shared/srvkit` | guards (`Every`, `User`, `Staff`, `Admin`, `SuperAdmin`, `SelfOrAdmin`, `SignupHolder`, `Person`, `SSOGoogle` and the other `SSO*`), internal args (`Self`, `Me`, `Account`, `AgentCall`, `SignupUserId`), caller helpers (`accountOf`, `isAdmin`, `isStaff`, `activeUserId`, `isAgentCall`), refresh sessions, `SignupToken`, `SsoFlow`, `AccountMiddleware` |
| `@libs/shared/webkit` | browser helpers: `refreshSession`, signup-token storage, `useAutoSubmit`, `useYjsRelay`, `addFileUntilActive` |
| `@libs/shared/common` | isomorphic helpers: `RichText` (editor document codec), `RichUrl`, `MentionGrammar`, `withRedirectQuery`, `safeRedirectPath`, `idOf`, `pkcePair`, `getQueryMeta` |
| `@libs/shared/ui` | `Field`, `Editor`, `Markdown`, `Administrator`, `Auth`, `Only`, `StatTile`, `UserLeave` |

## Modules

Each module's invariants are in its abstract next to the code.

- `user`: sign-up (signup token), password, phone and SSO sign-in, profile review, restriction, re-signup limit — [abstract](lib/user/user.abstract.md)
- `admin`: operator accounts, roles and sessions — [abstract](lib/admin/admin.abstract.md)
- `_oauth`: the OAuth 2.1 server in front of `/mcp` — [abstract](lib/_oauth/oauth.abstract.md)
- `file`, `privFile`: public and private uploads — [file](lib/file/file.abstract.md), [privFile](lib/privFile/privFile.abstract.md)
- `notification`, `banner`, `setting`, `summary`: push and in-app notices, banners, app settings, user counters
- `_shared`: the lib's root service and the store actions that run admin and user sign-in and sign-out together — [abstract](lib/_shared/shared.abstract.md)

## Options (`env.server.*` → `ModulesOptions`)

| Key | Meaning |
|---|---|
| `rootAdminInfo` | the root admin's account id and password; set it in every deployment, since unset falls back to a built-in default |
| `signup.activateVerifies` | verifies a prepare user must hold before activation; unset means any identity-proving verify, `[]` admits every sign-up |
| `signup.requireVerifiedEmail` | shorthand for `email` plus the email-based SSOs |
| `nativeSso.callbackSchemes` | deep-link schemes a native app may take an SSO code back on; unset admits the app's own name |
| `oauth` | `enabled`, `issuer`, `resource`, `consentPath`, `signinPath`, `clients`, `dynamicRegistration`, `allowedRedirectSchemes`, `accessTokenSeconds`, `clientIdMetadata` |
| `security.sso` | SSO provider credentials (`google`, `github`, `kakao`, `naver`, `facebook`, `apple`), declared in `@libs/util` |

The JWT secret, storage, mail, SMS and push are `@libs/util` options.
