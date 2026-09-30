# Single Sign-On

- Source: /cheatsheet/general/sso
- Mirror: /llms/pages/cheatsheet/general/sso.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Single Sign-On (#overview)
- Register Providers (#provider)
- Write A Callback (#callback)
- Account Id (#account-id)
- After The Callback (#redirect)
- Tips (#tips)

## Content

Single Sign-On

SSO lets users sign in with GitHub, Google, Facebook, Kakao or Naver instead of a password. With `libs/shared` mounted, the routes and the sign-in logic already exist: you add keys, a button and the pages the user lands on.

Words used on this page

Term

- provider: The service that confirms who the user is: GitHub, Google, Facebook, Kakao, Naver or Apple.

- callback: The route the provider sends the user back to, carrying a one-time `code`.

- accountId: The one value that identifies the user on every sign-in: an email or a GitHub username.

- prepare user: A user in `prepare` status, created for a newcomer. The signup page finishes it.

What you do

**Add the keys.** Put each provider's client ID and secret under `security.sso` in the server env file.

**Register the redirect URI.** Enter `<origin>/api/user/<provider>/callback` in each provider's developer console.

**Place the buttons.** Render `User.Util.SSOButtons` on the sign-in page with three destinations.

**Build the landing pages.** A signup page that reads `userId` and an error page that reads `error` from the query.

What happens when the user clicks

`st.do.ssoSigninUser` saves the three destinations and the page origin in cookies, then opens `/api/user/<provider>`.

The start route sends the browser to the provider's consent screen.

The provider returns the browser to `/api/user/<provider>/callback` with a `code`.

The callback trades the `code` for a profile and picks the `accountId`.

`userService.handleSsoCallback` signs the user in, continues signup, or sends them to the error page.

Register Providers

Each provider gives you a client ID, and usually a secret, in its developer console. Put them under `security.sso` in the server env file of each environment:

**Only listed providers turn on.** A provider missing here makes its `SSO.<Provider>` guard refuse both routes with `ssoNotConfigured`.

**Keys stay out of git.** `env.server.local.ts`, `env.server.main.ts` and the other environment files are gitignored.

**Setting `security` replaces the whole object.** Keep `verifies`, and `jwtSecret` if you use one, beside `sso`.

Credential fields

- clientID (string): The app's client ID from the provider console. Kakao calls it the REST API key.

  - required

- clientSecret (string): Sent with the code-for-token exchange, only when set.

- teamID (string, apple): Your Apple developer team ID, the issuer of Apple's client secret.

- keyID (string, apple): The ID of the Sign in with Apple key, sent as the secret's `kid`.

- keyFilePath (string, apple): Path to that key's private key file. Akan signs the client secret with it.

Redirect URI for the console

A provider only sends users back to a URI you registered. Akan builds it from the origin of the page where the user clicked:

**Register every origin.** Local, staging and production each need their own entry, because the origin comes from the browser.

**Allow the scopes below.** Consent items the console has not enabled come back empty, such as Kakao's email.

Key in security.sso

Scope Akan requests

- github — user

- google — email profile

- facebook — email

- kakao — account_email,profile_nickname

- naver — (none)

Write A Callback

You rarely write this yourself: `libs/shared/lib/user/user.signal.ts` already pairs a start route with a callback for each provider. Read it when you add a provider or change what happens after sign-in.

endpoint

Path

What it does

- google — /api/user/google — Redirects the browser to Google's consent screen.

- googleCallback — /api/user/google/callback — Trades Google's `code` for a profile, then signs in or continues signup.

The Google pair, as shipped. Every other provider has the same shape:

The pieces it uses. All but `handleSsoCallback`, a user service method, come from `@libs/shared/srvkit`:

Helper

- SSO.Google, SSO.Github, SSO.Kakao, …: Guards that refuse the call with `ssoNotConfigured` when that provider has no keys.

- makeOAuthRedirectResponse: Builds the 302 to the provider's consent screen from the `ssoOrigin` cookie.

- getSsoCode, getSsoOrigin: Read the `code` query and the `ssoOrigin` cookie, and throw when either is missing.

- extractGoogleProfile, extractGithubProfile, …: One per provider. Trades the code for a token and fetches the profile.

- handleSsoCallback: The user service's decision: sign in, continue signup or error. Returns `{ cookie, redirect }`.

- makeSsoRedirectResponse: The final 302 to `redirect`, setting the session cookies when there are any.

**The callback stays small.** It only turns the profile into an `accountId` and a nickname; every decision lives in `handleSsoCallback`.

**Apple is not wired yet.** `SSO.Apple` and the Apple keys exist, but the shipped `apple` and `appleCallback` do nothing. Build yours on `verifyAppleUser`.

Account Id

Each provider names the user differently. The callback turns every profile into one `accountId` before it calls the service, and that value identifies the user from then on.

provider

accountId

Nickname seed

- github — username — displayName

- google — emails[0].value — displayName

- facebook — emails[0].value — givenName familyName

- kakao — email — name

- naver — email — name

Writing your own callbacks? Keep the difference in one lookup:

**One provider per account.** An existing `accountId` arriving from a provider it never signed in with goes to the error page with `noVerifiesInUser`.

**GitHub and Google make two users.** A username and an email never match, even for the same person.

**The nickname is a first draft.** A newcomer gets the profile name, or the `accountId` before `@` when it is empty, cut to 12 characters and made unique.

After The Callback

The callback always ends on one of three pages, and you name all three on the sign-in button:

Outcome

When

Goes to

- Signed in — The accountId belongs to an active, restricted or dormant user. — signinRedirect

- Continue signup — No such user yet, so a prepare user is created with a unique nickname. — signupRedirect?userId=<id>

- Error — Signing in or preparing the user fails, for example with `noVerifiesInUser`. — errorRedirect?error=<error key>

SSOButtons props

- signinRedirect (string): Where an existing user lands, signed in.

- signupRedirect (string): Where a newcomer lands to finish signup. Gets `?userId=<id>` appended.

- errorRedirect (string, default "/404"): Where a failed sign-in lands. Gets `?error=<error key>` appended.

- mainSsos (SsoType["value"][], default []): Providers shown as full-width buttons with a label.

- subSsos (SsoType["value"][], default []): Providers shown as a row of round icon buttons below.

- replace (boolean, default false): Replace the current history entry instead of pushing a new one.

**Your own button** calls `st.do.ssoSigninUser(ssoType, { signinRedirect, signupRedirect, errorRedirect })`, the same action `SSOButtons` uses.

**Write paths as the app sees them.** The action adds the basePath prefix when the app has one.

**Start SSO only through `st.do.ssoSigninUser`.** A bare link to `/api/user/google` carries no `ssoOrigin` cookie, so the start route fails with `invalidSsoCallbackMissingOrigin` and no destination is known.

Tips

**Provider differences go in the callback.** Sign-in rules go in the service.

**One service method for every provider.** Once the `accountId` is normalized, each callback calls the same `handleSsoCallback`.

**Build the three pages first.** Have the signed-in, signup and error pages ready before you turn SSO on.

## Code Examples

### apps/koyo/env/env.server.local.ts

```ts
import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  security: {
    verifies: [["password"]],
    sso: {
      github: { clientID: "<github-client-id>", clientSecret: "<github-client-secret>" },
      google: { clientID: "<google-client-id>", clientSecret: "<google-client-secret>" },
      kakao: { clientID: "<kakao-rest-api-key>" },
    },
  },
};
```

### libs/shared/lib/user/user.signal.ts

```ts
google: query(Any, { guards: [SSO.Google] })
  .with(Req)
  .exec((request) => makeOAuthRedirectResponse("google", request as Bun.BunRequest)),
googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
  .with(Req)
  .exec(async function (request) {
    const req = request as Bun.BunRequest & { account?: SerAccount };
    const googleUser = await extractGoogleProfile(getSsoCode(req), getSsoOrigin(req));
    const accountId = googleUser.emails[0].value;
    const { cookie, redirect } = await this.userService.handleSsoCallback(
      accountId,
      "google",
      req.cookies.toJSON() as unknown as SsoCookie,
      req.account,
      googleUser.displayName,
    );
    return makeSsoRedirectResponse(redirect, cookie);
  }),
```

### apps/koyo/srvkit/accountIdOf.ts

```ts
import type { FacebookResponse, GithubResponse, GoogleResponse, KakaoResponse, NaverResponse } from "@libs/shared/srvkit";

export const accountIdOf = {
  github: (profile: GithubResponse) => profile.username,
  google: (profile: GoogleResponse) => profile.emails[0].value,
  facebook: (profile: FacebookResponse) => profile.emails[0].value,
  kakao: (profile: KakaoResponse) => profile.email,
  naver: (profile: NaverResponse) => profile.email,
} as const;
```

### apps/koyo/page/signin.tsx

```tsx
import { User } from "@libs/shared/client";
import { page } from "akanjs/client";

export default page().render(() => (
  <User.Util.SSOButtons
    mainSsos={["kakao", "naver"]}
    subSsos={["google", "github"]}
    signinRedirect="/"
    signupRedirect="/signup"
    errorRedirect="/signin"
  />
));
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

