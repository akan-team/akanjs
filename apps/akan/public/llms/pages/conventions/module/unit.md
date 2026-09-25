# Model.Unit.tsx

- Source: /conventions/module/unit
- Mirror: /llms/pages/conventions/module/unit.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- Model.Unit.tsx (#unit-overview)
- ModelProps And Light Models (#modelprops-light)
- Unit Variants (#unit-variants)
- Actions Inside Units (#actions-inside-units)
- Load.Units And Direct Rendering (#loadunits-direct-rendering)
- Practical Rules (#practical-rules)

## Content

Model.Unit.tsx

The hydrated list rendered by Load.Units. This is the current visible list state.

The first list snapshot from the server init object. It is useful for reset or comparison flows.

Timestamp for when the server initialized the list.

Marks the list as ready after hydration.

Insight data returned with the slice, such as count or summary values.

Pagination state hydrated from the init object.

The current query arguments used to load the slice.

The current sort value used to load the slice.

A Unit file contains reusable renderers for one model item or one list/table representation. Common exports are cards, compact rows, avatars, gallery tiles, and column helpers.

Units are usually presentational. They may include thin UI actions such as edit buttons, but forms belong in Template files and larger interactions belong in Util or Store.

ModelProps And Light Models

Use ModelProps to type the model prop, href, className, and common interaction props. Unit components usually receive Light models because they are rendered repeatedly in lists.

Unit Variants

A single Unit file can export several display shapes for the same model. Name them by usage: Card for normal cards, Mini for compact rows, Abstract for feed/list summaries, Gallery for image grids.

Units are server components by default, so avoid putting browser events such as onClick directly in the Unit. Move interactive behavior into a small Util component, such as Article.Util.Remove, and compose it from the Unit.

Actions Inside Units

Units may show small UI actions such as remove, copy, or detail buttons. Keep the Unit thin: render a small Util component for the browser behavior, while forms and async workflows stay outside the Unit.

Load.Units And Direct Rendering

Use Load.Units when a slice manages loading, pagination, refresh, and empty states. If the page already has an array, render Units directly with map, which is common in server-rendered pages.

Load.Units also hydrates slice state into the client store so generated pagination, query, sort, refresh, and insight helpers can keep working after the first render.

Description

Example

Practical Rules

Use Light models for lists and repeated Unit rendering.

Accept className and href when the Unit may be reused in different layouts or links.

Use clsx to merge caller styling with the Unit's base styling.

Prefer Layout.Unit or Link for clickable card/list containers.

Keep forms in Template and complex async interactions in Util or Store.

Export variants by display purpose instead of adding many flags to one Card.

## Code Examples

### Article.Unit.tsx

```ts
import { type ModelProps, clsx } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ article, className, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Layout.Unit className={clsx("rounded-lg border", className)} href={href}>
      <div className="font-bold">{article.title}</div>
      <div className="text-base-content/70">{article.summary}</div>
    </Layout.Unit>
  );
};
```

### Article.Unit.tsx

```ts
interface MiniProps extends ModelProps<"article", cnst.LightArticle> {}

export const Mini = ({ article, className, href }: MiniProps) => (
  <div className={clsx("flex items-center gap-2", className)}>
    <Link href={href}>{article.title}</Link>
    <Article.Util.Remove article={article} />
  </div>
);
```

### Article.Unit.tsx

```ts
export const Gallery = ({ article, href }: ModelProps<"article", cnst.LightArticle>) => (
  <Link href={href} className="overflow-hidden rounded-md border">
    <Image src={article.cover.url} width={320} height={200} />
    <div>{article.title}</div>
  </Link>
);
```

### Article.Unit.tsx

```ts
<Layout.Unit className="relative rounded-lg border">
  <div>{article.title}</div>
  <div className="absolute top-2 right-2">
    <Article.Util.Remove article={article} />
  </div>
</Layout.Unit>
```

### Load.Units

```ts
<Load.Units
  init={articleInit}
  renderEmpty={() => <Model.NewWrapper slice={fetch.slice.article}>+ New</Model.NewWrapper>}
  renderItem={(article) => <Article.Unit.Card key={article.id} article={article} />}
/>
```

### Direct SSR rendering

```ts
<div className="flex flex-col gap-2">
  {articleList.map((article) => (
    <Article.Unit.Card key={article.id} href={"/article/" + article.id} article={article} />
  ))}
</div>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

