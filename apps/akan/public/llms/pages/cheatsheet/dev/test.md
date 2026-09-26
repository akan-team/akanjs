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

A test that calls your endpoints through the generated `fetch`, against a real test server.

A reusable function that prepares what a test needs, such as a record or a signed-in user.

A test user bundled with a `fetch` that is already signed in as that user.

Returns the test server's signed-out `fetch`, starting the server on the first call.

Fills every field of a constant class with a sample value, using the field's default when set.

Makes one random value at a time, such as an email or a string of a given length.

Changes the test server's settings, covered in the Test File section below.

`tempFile` keeps SQLite in a temporary file instead of memory, deleted after the run.

The port the test server listens on.

Happy path

Create, update, publish, archive.

Permission

A guest cannot publish, the owner can edit, an admin can remove.

Validation

Missing title, invalid date, duplicated `accountId`.

State transition

`draft` to `published`, `pending` to `approved`.

External dependency

File upload, payment callback, message publish.

The app, library or package to test, such as `myapp` or `shared`.

`false` skips writing generated code before an app's tests run.

Signal tests

Package tests

Use

Run from the workspace root. It passes `--isolate` for you.

Fine inside a package directory, but a signal test cannot find its app this way.

Never

Without `--isolate`, test files share one global object and break each other.

Words used on this page

Term

Always two files

A signal suite is always two files, and the split is not a matter of taste:

Fixtures

Assertions

Steps

Build fixtures in the spec file.

Write the assertions in the test file.

Spec File: Building Fixtures

akanjs/test helper

1. Agent types live in one place

2. The model's fixtures

A model's spec builds on those agents. Every fixture declares its return type:

Test File: Writing Assertions

Changing the test server

What To Test

A signal test file usually covers these five kinds of behaviour:

Kind

Examples

Command

Running in another database mode

Which command to use

Works

Does not work

Tips

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

