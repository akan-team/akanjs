# signupTicket Abstract

What `generatePrepareUser` answers: the prepare user a sign-up continues and the signup token bound to it.

## Rules

- The token is a JWT signed with the app's own secret, `typ: "signup"`, `sub` = the prepare user, valid 24 hours.
- The id alone grants nothing; a sign-up step is accepted only with a token whose `sub` matches it.
- A fresh token is issued on every resume, so the client keeps the latest one and drops it once the user is active.
