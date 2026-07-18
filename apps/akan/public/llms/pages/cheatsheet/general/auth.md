# Authorization

- Source: /cheatsheet/general/auth
- Mirror: /llms/pages/cheatsheet/general/auth.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Authorization (#overview)
- Use Guards (#guard)
- Use .with() (#with)
- Guard Or .with() (#choose)
- Tips (#tips)

## Content

Authorization

Authorization in Akan answers two simple questions: who is calling this API, and is that person allowed to use it? Think of it as a small gate in front of each signal.

Middleware reads login information from the request.

Guard blocks users who do not have permission.

`.with()` gives the handler trusted server-side values such as the current user.

Use Guards

Use a guard when the whole API should be unavailable to some users. For example, a profile update API should only run for signed-in users.

User-only mutation

Use .with()

Use `.with()` when the API needs a value that the client should not type by hand. Current user, current admin, request, and account are good examples.

Current user from the server

Guard Or .with()

Use `guards: [User]` when unauthenticated users must not enter the API.

Use `.with(Self)` when the API needs to know which user is calling.

Most user-only APIs use both: guard first, then `.with(Self)` inside the handler.

Tips

Do not receive `userId` from the client when you mean the current user. Use `.with(Self)` instead.

Use `Admin` guard for admin screens and `User` guard for user screens.

Keep permission checks close to the signal so readers can see who may call the API.

## Code Examples

### Code

```ts
setNickname: mutation(User, { guards: [User] })
  .body("nickname", String)
  .exec(async function (nickname) {
    return await this.userService.setNickname(nickname);
  });
```

### Code

```ts
getSelf: query(User, { nullable: true })
  .with(Self, { nullable: true })
  .exec(async function (self) {
    if (!self) return null;
    return await this.userService.getUser(self.id);
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

