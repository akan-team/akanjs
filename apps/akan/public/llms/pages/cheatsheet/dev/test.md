# Testing

- Source: /cheatsheet/dev/test
- Mirror: /llms/pages/cheatsheet/dev/test.md
- Section: cheatsheet
- Category: cheatsheet
- Priority: P2

## Headings

- Testing (#overview)
- Spec Helper (#helper)
- Test File (#test-file)
- What To Test (#targets)
- Command (#command)
- Tips (#tips)

## Content

Testing

In Akan apps, start testing from signals. A signal test checks the real business flow through the generated fetch API before you spend time on UI details.

Test signup, permission, validation, and state transitions at the API layer.

Move repeated setup into small helper functions.

Keep long scenarios as several clear steps.

Spec Helper

A spec helper creates test users, agents, and sample data. The test file can then read like a user story instead of a setup script.

Test File

The test file imports helpers, prepares an agent, calls signals through fetch, and checks the result.

What To Test

Happy path: create, update, publish, archive.

Permission: guest cannot publish, owner can edit, admin can remove.

Validation: missing title, invalid date, duplicated accountId.

State transition: draft to published, pending to approved.

External dependency: file upload, payment callback, message publish.

Command

Run app tests from the workspace root. Add `--write false` when you want to avoid writing snapshots or generated output during a check.

Run tests

Tips

Create data through signals when possible so the test uses the same rules as the app.

Use helpers for setup, but keep assertions in the test file.

Test one important behavior per `it` block.

## Code Examples

### article.signal.spec.ts

```ts
export const getUserAgent = async () => {
  const agent = await createTestAgent();
  await agent.fetch.user.signup({ accountId: "user1", password: "pass" });
  await agent.fetch.user.signin({ accountId: "user1", password: "pass" });
  return agent;
};

export const createArticle = async (agent, title = "Hello") => {
  return agent.fetch.article.create({ title, body: "First post" });
};
```

### article.signal.test.ts

```ts
import { beforeAll, describe, expect, it } from "bun:test";
import { createArticle, getUserAgent } from "./article.signal.spec";

describe("article signal", () => {
  let agent;

  beforeAll(async () => {
    agent = await getUserAgent();
  });

  it("publishes a draft article", async () => {
    const article = await createArticle(agent);

    const published = await agent.fetch.article.publish(article.id);

    expect(published.status).toBe("published");
  });
});
```

### Code

```ts
akan test myapp
akan test myapp --write false
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

