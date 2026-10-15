# ssoSignin Abstract
The answer a native app gets for its SSO one-time code: a session for a known account, or the prepare user a new one signs up as.

## Rules
- Exactly one side is set: `jwt` with `refreshToken`, or `prepareUserId` with its `signupToken`.
- Never travels in a deep link; it is the response of the PKCE-checked exchange only.
