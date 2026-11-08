---
"akanjs": patch
---

The `shared` and `util` libraries that `akan install-library` copies are refreshed. Apps that use them should check these changes:

- Sign-up and sign-in steps run in a new `_sign` service. `generatePrepareUserWithAccountId`, `startPhoneSign` and `signinWithPhoneCode` are now one endpoint each, replacing store actions that chained several calls. `activateUserWithAgreePolicies` writes the agreed policies together with the activation. `leaveSelf` and `leaveAndSignoutSelf` take the leave survey with the deletion.
- Profile image review is removed, along with `setAppliedImagesOfSelf`, `setAppliedImagesOfPrepareUser` and `approveUserImages`.
- The server issues the session cookie as HttpOnly through `SessionCookie`, and pages read its expiry from an unsigned claims cookie. Refresh, SSO state and signup-token cookies are HttpOnly and carry a `Max-Age`. A response that issues a signup token also sets it as a cookie, and activation expires that cookie.
- Activation of a draft whose accountId is an email address now needs a verify that proves that address by default; a GitHub or phone sign-up still activates on its own verify. `signup.requireVerifiedEmail: false` restores the old default, which accepts any verify except `password`.
- `rootAdminInfo` has no default value. Boot creates the root admin only when it is missing. `resetRootAdmin: true` resets an existing root admin's password and roles to the configured ones.
- Admin password sign-in gives the same error for an unknown account and a wrong password, and locks the same way user sign-in does. An admin who changes their own password must give the current one. `setAdminRoles` replaces an admin's roles in one call. The new `SelfOrStaff` guard lets staff read user records, and only admins write them. `PlatformAdmin` admits only admins listed in `AKAN_PLATFORM_ADMIN_IDS`, and `isPlatformAdmin` tells whether the signed-in admin is one of them.
- OAuth: a session that holds only the admin identity may grant consent only when `oauth.allowAdminSubject` is on. A token issued to an OAuth client is refused at an `mcp: false` endpoint and at an endpoint named in `offShelfEndpoints`. The first-party refresh endpoints refuse an OAuth client's refresh token.
- Files: each upload takes up to 100 MB per file (`file.error.fileTooLarge`) and records its uploader. Reading `file` or `lightFile` needs a signed-in account, and `fileListInIds` needs an admin. Storage keys get a random suffix, and `audio/*` keeps its content type. A user can set as `image` or `images` only files that user uploaded.
- Verified emails: `requestEmailCodeInActiveUser` / `verifyEmailInActiveUser` prove another address, `verifiedEmailsOfSelf` lists them, and `removeVerifiedEmailOfSelf` removes one.
- `getActiveSetting` returns `LightSetting` only. The full setting is admin-only.
- `pushNoti.webIcon` and `pushNoti.webBadge` set the web push icon and badge.
- `util` moves to nodemailer 10, which ships its own types, so `@types/nodemailer` is no longer needed. `mailer.from` sets the sender. Every recipient must be one plain address, and no mail is sent in a preview.
- New UI pieces: `ContextMenu`, `SortableList`, `Upload` split into `UploadImage` and `UploadParts`, and app badge sync.
