# Documentation

- Source: /cheatsheet/dev/docs
- Mirror: /llms/pages/cheatsheet/dev/docs.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- API Documentation (#overview)
- Render A Zone (#zone)
- Try An Endpoint (#try-api)
- Auth And Roles (#auth)
- Tips (#tips)

## Content

Documentation

API Documentation

Akan can render signal documentation from the generated fetch object. It is not just a static list: developers can inspect arguments, guards, REST calls, and realtime endpoints.

Use `Signal.Doc.Zone` for one signal namespace.

Use `Doc.Setting` to choose BaseURL, role, and JWT.

REST and WebSocket test surfaces are shown together.

Render A Zone

Place the documentation UI inside an admin or developer-only page. The `base` signal is a good first target because it has simple ping endpoints.

Developer API page

Try An Endpoint

Open the `base` document, find `ping`, and run it from the REST panel. It should return a simple string response.

Auth And Roles

For guarded endpoints, open the auth modal and paste a JWT. The decoded account helps you confirm which roles are being used for the test.

BaseURL tells you which server the document is calling.

Role filters help you focus on public, user, or admin endpoints.

JWT is only for developer testing in this UI.

Tips

Expose API docs only to developers or admins.

Start with `base` or a small module before documenting a large domain.

Use the docs UI for quick manual checks, not as a replacement for automated tests.

## Code Examples

### Code

```ts
"use client";
import { fetch } from "@apps/myapp/client";
import { Signal } from "akanjs/ui";

export default function ApiDocsPage() {
  return <Signal.Doc.Zone fetch={fetch} refName="base" openAll />;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

