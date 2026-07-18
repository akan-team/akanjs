# Script

- Source: /cheatsheet/dev/script
- Mirror: /llms/pages/cheatsheet/dev/script.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Scripts (#overview)
- Command (#command)
- Server Lifecycle (#lifecycle)
- Use Services (#service)
- Lookup Helpers (#lookup)
- Tips (#tips)

## Content

Script

Scripts

Use `akan script` for one-time developer or operator jobs: seed data, migrations, checks, and small maintenance fixes.

The script starts the app server container without opening a normal web page.

You can reuse services, signals, and adaptors that the app already wires together.

Keep each script small and easy to delete after the job is done.

Use `akan console` instead when the job is interactive inspection or a small operator command.

Command

Put scripts under `apps/myapp/script`. The filename becomes the command target.

Run a script

Server Lifecycle

Start the server, do the job, and always stop it in `finally`. This makes database connections, timers, and adaptors clean up correctly.

Use Services

Most maintenance jobs should call services. Services already know the domain rules, database access, and other dependencies.

Read and update data

Lookup Helpers

`server.get(ArticleService)`: class-based lookup with strong types.

`server.getService("article")`: refName-based service lookup.

`server.getSignal("article")`: signal lookup for a script that wants to call signal logic.

`server.getAdaptor("storage")`: adaptor lookup for infrastructure tasks.

Tips

Print the target environment before changing data.

For destructive scripts, add a confirm flag or dry-run mode.

Prefer service methods over direct database writes so domain rules stay in one place.

## Code Examples

### Code

```ts
akan script myapp hello

# runs this file
apps/myapp/script/hello.ts
```

### apps/myapp/script/hello.ts

```ts
import { server } from "../server";

const run = async () => {
  await server.start();

  try {
    console.info("hello from script");
  } finally {
    await server.stop();
  }
};

void run();
```

### Code

```ts
import { server, srv } from "../server";

const run = async () => {
  await server.start();

  try {
    const articleService = server.get(srv.ArticleService);
    const draftArticles = await articleService.findDrafts();

    console.info("draft count", draftArticles.length);

    for (const article of draftArticles) {
      await articleService.markAsReady(article.id);
    }
  } finally {
    await server.stop();
  }
};

void run();
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

