# Testing

- Source: /cheatsheet/dev/test
- Mirror: /llms/pages/cheatsheet/dev/test.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Testing (#overview)
- Spec File: Building Fixtures (#helper)
- Test File: Writing Assertions (#test-file)
- What To Test (#targets)
- Command (#command)
- Tips (#tips)

## Content

Testing

In an Akan app, start testing from signals. A signal test checks the real business flow through the generated `fetch` before you spend time on UI details.

Words used on this page

Term

- signal test: A test that calls your endpoints through the generated `fetch`, against a real test server.

- fixture: A reusable function that prepares what a test needs, such as a record or a signed-in user.

- agent: A test user bundled with a `fetch` that is already signed in as that user.

Always two files

A signal suite is always two files, and the split is not a matter of taste:

Fixtures

Reusable fixtures built on `sampleOf(cnst.XInput)`, each with a declared return type and no assertions. Other modules import from it.

Assertions

`describe("<Model> Signal")`, `let` fixtures at describe scope, one `beforeAll`, and `it` blocks in story order.

**Both files sit beside the module they cover.** For example, `lib/article/` holds `article.signal.spec.ts` and `article.signal.test.ts`.

**One fetch reaches the whole flow.** Signup, permission, validation and state transitions are all checked through it.

Steps

Build fixtures in the spec file.

Write the assertions in the test file.

Run them with `akan test`.

Spec File: Building Fixtures

A spec file builds agents and sample data. The `fetch` it hands back is flat, so a call reads `agent.fetch.createArticle(...)`, never a namespace per model.

akanjs/test helper

- getOrSetupSignalTestFetch: Returns the test server's signed-out `fetch`, starting the server on the first call.

- sampleOf: Fills every field of a constant class with a sample value, using the field's default when set. — Example: `sampleOf(cnst.ArticleInput)`

- sample: Makes one random value at a time, such as an email or a string of a given length. — Example: `sample.email() · sample.string({ length: 10 })`

- configureSignalTest: Changes the test server's settings, covered in the Test File section below.

1. Agent types live in one place

Agent types are re-exported and re-typed only in `lib/user/user.signal.spec.ts`. It binds the shared agents to your app's `fetch`:

**Import agent types from here only.** Other specs and tests import `UserAgent` and `AdminAgent` from `../user/user.signal.spec`, not from the lib that owns them.

**An agent is a signed-up user with a signed-in fetch.** `getUserAgentWithPhone` returns `{ user, fetch, accessToken, userInput }`, and `getUserAgentWithPassword` does the same with an email and password.

**Two users in one file? Call `getUserAgentWithPassword()` twice.** Each call signs up a new random email, while a second `getUserAgentWithPhone()` reuses the same phone number and fails.

2. The model's fixtures

A model's spec builds on those agents. Every fixture declares its return type:

**Override only what the test is about.** Spread `sampleOf(...)` and change one field, like `status: "draft"`.

**The guest fetch is signed out.** `getOrSetupSignalTestFetch()` returns the plain `fetch`, which is how a test plays a visitor.

Test File: Writing Assertions

The test file carries every assertion. Fixtures are `let` bindings at describe scope, so each `it` picks up where the previous one left off:

**One `beforeAll` prepares the cast.** Agents are created once and shared by every `it`.

**`it` blocks run in story order.** Create, then publish, then try what must be refused.

**A refusal is `await expect(p).rejects.toThrow()`.** When a guard refuses the call, the `fetch` promise rejects.

**Each test file starts on an empty database.** Files get their own test server, so they never see each other's data.

Changing the test server

The test server uses an in-memory SQLite database by default. To change a setting, call `configureSignalTest` at the top of the test file:

- storage ("memory" | "tempFile", default "memory"): `tempFile` keeps SQLite in a temporary file instead of memory, deleted after the run.

- port (number, default 38080 + worker id): The port the test server listens on.

**Call it before any fixture runs.** Once the test server has started, `configureSignalTest` throws.

What To Test

A signal test file usually covers these five kinds of behaviour:

Kind

Examples

- Happy path: Create, update, publish, archive.

- Permission: A guest cannot publish, the owner can edit, an admin can remove.

- Validation: Missing title, invalid date, duplicated `accountId`.

- State transition: `draft` to `published`, `pending` to `approved`.

- External dependency: File upload, payment callback, message publish.

Command

Run tests from the workspace root with `akan test`. It prepares the target, then runs `bun test --isolate` inside it:

- <target> (app | lib | pkg): The app, library or package to test, such as `myapp` or `shared`.

- --write (boolean, default true): `false` skips writing generated code before an app's tests run.

Running in another database mode

A signal suite runs in `single` mode. To run it in `multiple` or `cluster`, name the mode and the services it needs:

**`multiple` needs `AKAN_TEST_REDIS_URL`, `cluster` also `AKAN_TEST_POSTGRES_URL`.** Each test file starts on an emptied Redis database and a Postgres schema of its own, dropped afterwards.

**The Postgres user must be able to create schemas and roles.** The one `akan dbup --mode cluster` starts can.

**Only `AKAN_TEST_DATABASE_MODE` picks the mode.** An `AKAN_DATABASE_MODE` left in your shell does not reach the suite.

Which command to use

Signal tests — apps · libs

Package tests — pkgs

- Use

  - akan test <target>: Run from the workspace root. It passes `--isolate` for you.

  - bun test --isolate: Fine inside a package directory, but a signal test cannot find its app this way.

- Never

  - bun test: Without `--isolate`, test files share one global object and break each other.

Works

Does not work

**`Signal test target is not configured.`** means a signal test ran without `akan test`. Run it again through `akan test <app-or-lib>`.

**Never run plain `bun test`.** Without `--isolate`, every test file shares one global object and dozens of tests fail from cross-file state pollution. `bunfig.toml`'s `[test] isolate` is not honored, and running it from the workspace root also breaks subprocess stdio pipes.

Tips

**Create data through signals when possible.** The test then follows the same rules as the app.

**Keep the spec free of assertions.** A fixture that asserts fails somebody else's suite, for a reason their file does not show.

**Test one important behaviour per `it` block.** A failure then names exactly what broke.

## Code Examples

### apps/myapp/lib/user/user.signal.spec.ts

```ts
import * as sharedUserSpec from "@libs/shared/lib/user/user.signal.spec";

import type { fetch as appFetch } from "../useServer";

type AppFetch = typeof appFetch;

export type UserAgent = sharedUserSpec.UserAgent<AppFetch>;
export type AdminAgent = sharedUserSpec.AdminAgent<AppFetch>;

export const getUserAgentWithPhone = async (): Promise<UserAgent> =>
  await sharedUserSpec.getUserAgentWithPhone<AppFetch>();

export const getUserAgentWithPassword = async (): Promise<UserAgent> =>
  await sharedUserSpec.getUserAgentWithPassword<AppFetch>();
```

### apps/myapp/lib/article/article.signal.spec.ts

```ts
import { getOrSetupSignalTestFetch, sampleOf } from "akanjs/test";

import * as cnst from "../cnst";
import type { fetch as appFetch } from "../useServer";
import { getUserAgentWithPhone, type UserAgent } from "../user/user.signal.spec";

type AppFetch = typeof appFetch;

export const getWriterAgent = async (): Promise<UserAgent> =>
  await getUserAgentWithPhone();

export const getGuestFetch = async (): Promise<AppFetch> =>
  await getOrSetupSignalTestFetch<AppFetch>();

export const createDraftArticle = async (agent: UserAgent): Promise<cnst.Article> => {
  const articleInput = sampleOf(cnst.ArticleInput);
  return await agent.fetch.createArticle({ ...articleInput, status: "draft" });
};
```

### apps/myapp/lib/article/article.signal.test.ts

```ts
import { beforeAll, describe, expect, it } from "bun:test";

import type * as cnst from "../cnst";
import type { UserAgent } from "../user/user.signal.spec";
import * as articleSpec from "./article.signal.spec";

describe("Article Signal", () => {
  let writerAgent: UserAgent;
  let article: cnst.Article;

  beforeAll(async () => {
    writerAgent = await articleSpec.getWriterAgent();
  });

  it("creates a draft", async () => {
    article = await articleSpec.createDraftArticle(writerAgent);
    expect(article.status).toBe("draft");
  });

  it("publishes the draft", async () => {
    article = await writerAgent.fetch.publishArticle(article.id);
    expect(article.status).toBe("published");
  });

  it("refuses to publish for anyone but the owner", async () => {
    const guestFetch = await articleSpec.getGuestFetch();
    await expect(guestFetch.publishArticle(article.id)).rejects.toThrow();
  });
});
```

### apps/myapp/lib/article/article.signal.test.ts

```ts
import { configureSignalTest } from "akanjs/test";

configureSignalTest({ storage: "tempFile" });
```

### Terminal

```bash
akan test myapp
akan test myapp --write false
akan test shared
```

### Terminal

```bash
akan dbup --mode cluster
AKAN_TEST_DATABASE_MODE=cluster \
  AKAN_TEST_REDIS_URL=redis://localhost:6379 \
  AKAN_TEST_POSTGRES_URL=postgres://akan:akan@localhost:5432/akan \
  akan test myapp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

