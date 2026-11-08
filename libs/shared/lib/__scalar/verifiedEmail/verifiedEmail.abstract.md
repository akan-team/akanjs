# verifiedEmail Abstract

One address an account is trusted to receive mail at, as `verifiedEmailsOfSelf` answers it to the account's owner.

## Rules

- Derived, never stored: the addresses invitations trust (`listVerifiedEmails` — the proven accountId plus the user's
  `verifiedEmails`), one entry per address whatever its case.
- `isAccountId` is a match with the current accountId, proven or not. Only an entry with `isAccountId: false` can be
  removed (`removeVerifiedEmailOfSelf`); the sign-in address goes only when the accountId changes.
- Removing an address stops invitations sent to it from being listed or accepted; an invitation already bound to the
  account stays.
