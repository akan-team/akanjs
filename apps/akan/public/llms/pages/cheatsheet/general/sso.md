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
- Redirects (#redirect)
- Tips (#tips)

## Content

Single Sign-On

SSO lets users sign in with services like GitHub, Google, Kakao, or Naver. In Akan, you usually only write the callback once and let the service decide whether to sign in or continue signup.

User clicks a social login button.

The provider confirms who the user is.

Akan callback receives the profile.

The service signs in or redirects to signup.

Register Providers

First, register the providers your app supports. Each provider needs credentials from that service's developer console.

Example options

Write A Callback

The callback should stay small. Take the provider profile, find the account id, and pass it to your user service.

`SSO.Google` is a guard. It checks that Google SSO is configured before the login start route or callback runs. The start route redirects to Google, and the callback exchanges Google's `code` for a profile.

Small callback

Account Id

Different providers call the user's identity by different names. Normalize it into one `accountId` before calling your service.

GitHub often uses `username`.

Google often uses the first email address.

Kakao and Naver commonly use `email`.

Normalize provider profile

Redirects

After the callback, the service usually chooses one of three places to go.

Existing user: go to the signed-in page.

New user: go to the signup continuation page.

Error: go to an error page with a clear message.

Tips

Keep provider-specific code inside the callback. Keep sign-in rules inside the service.

Use the same service method after every provider normalizes `accountId`.

Always prepare success, signup, and error redirects before starting SSO.

## Code Examples

### Code

```ts
security: {
  sso: {
    github: { clientID: "...", clientSecret: "..." },
    google: { clientID: "...", clientSecret: "..." },
  },
}
```

### Code

```ts
google: query(Any, { guards: [SSO.Google] })
  .with(Req)
  .exec((req) => redirectToGoogle(req));

googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
  .with(Req)
  .exec(async function (req) {
    const profile = await getGoogleProfile(req);
    const accountId = profile.emails[0].value;
    return await this.userService.signinWithSso(accountId, "google");
  });
```

### Code

```ts
const accountId =
  provider === "github" ? profile.username : profile.email;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

