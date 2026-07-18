# Constant Schema Docs

- Source: /cheatsheet/dev/constants
- Mirror: /llms/pages/cheatsheet/dev/constants.md
- Section: cheatsheet
- Category: cheatsheet
- Priority: P2

## Headings

- Constant Schema Docs (#overview)
- Generated Schema (#schema-doc)
- Printable Definition (#print-schema-doc)

## Content

Constant Schema Docs

Akan can render schema definition tables and model relationship diagrams directly from ConstantRegistry.

Developer schema page

Printable schema definition

Generated Schema

Printable Definition

`Constant.Doc.Print` renders every selected variant and field inline, without tabs, collapse panels, modals, or diagram interactions.

## Code Examples

### Code

```ts
import "@apps/myapp/lib/cnst";
import { Constant } from "akanjs/ui";

export default function SchemaDocsPage() {
  return <Constant.Doc.Zone models={["user", "bizContract"]} openAll />;
}
```

### Code

```ts
import "@apps/myapp/lib/cnst";
import { Constant } from "akanjs/ui";

export default function PrintableSchemaDocsPage() {
  return <Constant.Doc.Print models={["user", "bizContract"]} />;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

