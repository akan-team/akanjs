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

A Unit file draws one record of a model: a card, a compact row, an avatar, a gallery tile, or a column helper for tables. Every list and relation that shows the model reuses these exports.

Open it when a list needs a new look, or a row should show another field. A Unit only draws; everything else has a file of its own:

What

Unit

Util

Template

Store

page

- What the Unit does itself

  - Light model fields: Title, status, dates: drawn as a card, a row or a tile.

  - usePage · l(): Translation works on the server, so labels need no client code.

  - Link · href: Navigation belongs to the Unit; the caller decides where it goes.

- What it hands to another file

  - onClick: A thin action such as edit or remove is a Util that the Unit renders.

  - Field.*: A form is a Template, never part of a list item.

  - st.use · st.do: A larger interaction: a Util starts it and a store action runs it.

  - fetch.*: The page loads the data and hands each record to the Unit as a prop.

Lives here

Not here

Words used on this page

Term

- cnst.Light<Model>: The slim version of a model: only the fields its constant picks for lists, plus display methods.

- server component: A component without "use client". It becomes HTML on the server and ships no JavaScript.

- slice: A named list query such as `inProject`. Its name becomes the `<Suffix>` in generated names.

- hydrate: Putting data the server already loaded into the browser's store, so nothing is fetched twice.

ModelProps And Light Models

Type a Unit's props with `ModelProps<"article", cnst.LightArticle>`. It gives the record a prop named after the model, plus `className`, `href` and a few props that list components fill in.

A list renders a Unit many times, so it takes a Light model. The smallest complete Unit file:

**`Layout.Unit` is the usual container.** It is a padded column that becomes a link when `href` is set, and a plain `div` without one.

**Read only Light fields.** A Light model carries just the fields its constant picks for lists, so do not assume a full-model field is there.

**Display logic lives on the Light class.** A label or a check is a method such as `admin.label()`, and the Unit only calls it.

**Extra props extend ModelProps.** Declare `interface MiniProps extends ModelProps<"article", cnst.LightArticle>` right above the component.

What ModelProps gives you

The last three are filled in by `Data.ListContainer`, which takes a Unit directly as its `renderItem`:

- article (cnst.LightArticle): The record to draw. The prop is named by the first type argument.

  - required

- className (string): Extra classes from the caller. Merge them last with `cn`.

- href (string): Where the Unit links to. Without it, `Layout.Unit` and `Link` render a plain `div`.

- onClick ((model: L) => unknown): A click callback that a client parent can pass.

- slice (SliceMeta): The slice the list belongs to, passed by `Data.ListContainer`.

- actions (DataAction[]): Row actions (`edit`, `view`, `remove` or an element), passed by `Data.ListContainer`.

- columns (DataColumn<L>[]): Which fields to show, passed by `Data.ListContainer`.

Unit Variants

One Unit file exports several shapes of the same model, each named by its purpose. The namespace already names the model, so it is `<Article.Unit.Card />`, never `ArticleCard`.

- Card: The normal card for lists and grids.

- Mini, Row: A compact row for dense lists. `Admin.Unit.Row` also carries its action buttons.

- Abstract: A short summary for feeds and list previews.

- Gallery: An image-first tile for image grids.

- Avatar: A small picture of the record, such as `User.Unit.Avatar`.

A compact row and an image tile from the same file:

**Variants beat flags.** Adding `Mini` is simpler than giving `Card` an `isCompact` flag.

**Actions come from a Util.** `Mini` renders `Article.Util.Remove` and hands it only the id; the next section shows why.

**`Image` takes the file.** `file={article.cover}` reads the URL, the size and the blur preview from the `File` relation.

Actions Inside Units

A Unit may show small actions such as remove, copy or a detail button. The Unit only places a small Util component; the Util owns the browser behaviour.

The Unit puts the button in a corner, next to the link rather than inside it:

The Util is the client component. It takes the id, not the model:

**Only the button ships as JavaScript.** When a page renders the card, the rest of it stays server-rendered HTML.

**A Util takes ids, not models.** A model prop would cross the server-client boundary as a class instance, so `RemoveProps` takes `articleId: string`.

**Keep the button outside the link.** A click inside `<a>` also follows the link, and a button there is invalid HTML, so the snippet makes the two siblings.

**Forms and async workflows stay out.** A form belongs in a Template, and a multi-step workflow in a store action.

**A Unit file never uses client-only features.** Lint rejects `"use client"`, React hooks such as `useState`, and an `st` import in a Unit. An `onClick` in a Unit breaks too, once a page renders it on the server.

Load.Units And Direct Rendering

A list of Units reaches the screen in one of three ways. Pick by what the page holds:

The page holds

Render with

What you get

- `init` passed to a Zone — Load.Units — Loading, pagination, refresh and empty states, plus a hydrated store.

- An awaited list — list.map(…) — Plain server HTML in the first response. Common on server-rendered pages.

- The un-awaited `<model>List<Suffix>` — Load.Stream — The list renders behind its own boundary instead of holding the route.

Load.Units in a Zone

Use `Load.Units` when the slice has to manage loading, pagination, refresh and the empty state. It lives in a Zone, which receives the page's `init`:

**`renderItem` draws one row with a Unit.** Pass `href` here, so the Unit itself stays reusable.

**`renderEmpty` is the empty state.** `Model.NewWrapper` makes the button it wraps open the new form, and `Model.EditModal` draws that form.

What Load.Units puts in the store

`Load.Units` hydrates the slice into the client store, so the generated pagination, query, sort, refresh and insight helpers keep working after the first render. Read any key with `st.use.<key>()`:

Store key

- <model>List<Suffix>: The list `Load.Units` draws, as it is on screen now. — Example: `articleListInProject: new DataList()`

- <model>InitList<Suffix>: The first list the server sent, kept for reset and comparison. — Example: `articleInitListInProject: new DataList()`

- <model>InitAt<Suffix>: When the server built that first list. — Example: `articleInitAtInProject: new Date()`

- <model>ListLoading<Suffix>: `false` once the list is hydrated, and `true` again while a refetch runs. — Example: `articleListLoadingInProject: false`

- <model>Insight<Suffix>: Insight returned with the slice, such as `count` or summary values. — Example: `articleInsightInProject: new cnst.ArticleInsight()`

- pageOf<Model><Suffix>, lastPageOf<Model><Suffix>, limitOf<Model><Suffix>: Pagination state taken from the init object.

- hasMoreOf<Model><Suffix>, isCumulativeOf<Model><Suffix>: Whether more rows follow, and whether the list keeps rows appended by `loadMoreOf<Model><Suffix>()`.

- queryArgsOf<Model><Suffix>: The filter arguments the slice was loaded with. — Example: `queryArgsOfArticleInProject: [projectId]`

- sortOf<Model><Suffix>: The sort key the slice was loaded with. — Example: `sortOfArticleInProject: "latest"`

Direct rendering on the server

When the page already holds the list, map it straight into Units. Nothing hydrates, and the rows are in the first response:

If the page holds the un-awaited `<model>List<Suffix>` promise instead, wrap the map in `Load.Stream`. The list renders behind its own boundary rather than holding the route:

**`<model>List<Suffix>` holds model instances.** Hand it only to server components. A Zone takes `<model>Init<Suffix>` instead.

**Stream only small, static lists.** When the same slice also feeds a Zone, `Load.Stream` on the server and `Load.Units` after hydration build the rows twice. A large list goes through `init` into the Zone alone.

Practical Rules

Six rules keep a Unit reusable:

**Light models for lists.** Anything drawn once per row takes the Light model, not the full one.

**Accept `className` and `href`.** Then the same Unit fits other layouts and other links.

**Merge with `cn`.** Put the caller's classes last: `cn("rounded-lg border", className)`.

**Make clickable cards and rows with `Layout.Unit` or `Link`.**

**Forms in Template, complex async work in Util or Store.** A Unit keeps neither.

**Export variants, not flags.** Add a variant per display purpose instead of piling flags onto one `Card`.

Common mistakes

Mistake, then the fix

Do this

- Util.Remove article={article} — A Util takes an id, so pass `articleId={article.id}`.

- <button onClick={…}> — Move the handler into a Util and render that Util from the Unit.

- export const ArticleCard — Export `Card`. The namespace names the model: `<Article.Unit.Card />`.

- article.content — A Light model has only the fields its constant picks. Add the field there, or draw it in a View.

- await fetch.viewArticle(id) — A Unit never fetches. Load in the page and pass the record down as a prop.

## Code Examples

### apps/koyo/lib/article/Article.Unit.tsx

```ts
import type { cnst } from "@apps/koyo/client";
import { cn, type ModelProps } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Layout.Unit className={cn("rounded-lg border", className)} href={href}>
      <div className="font-bold">{article.title}</div>
      <div className="text-foreground/70">{article.summary}</div>
    </Layout.Unit>
  );
};
```

### apps/koyo/lib/article/Article.Unit.tsx

```ts
import { Article, type cnst } from "@apps/koyo/client"; // [!code collapse:3]
import { cn, type ModelProps } from "akanjs/client";
import { Image, Link } from "akanjs/ui";

export const Mini = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link href={href}>{article.title}</Link>
      <Article.Util.Remove articleId={article.id} />
    </div>
  );
};

export const Gallery = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Link
      href={href}
      className={cn("block overflow-hidden rounded-md border", className)}
    >
      <Image file={article.cover} className="aspect-video w-full object-cover" />
      <div className="p-2">{article.title}</div>
    </Link>
  );
};
```

### apps/koyo/lib/article/Article.Unit.tsx

```ts
export const Card = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <div className={cn("relative", className)}>
      <Layout.Unit className="rounded-lg border" href={href}>
        <div className="font-bold">{article.title}</div>
      </Layout.Unit>
      <div className="absolute top-2 right-2">
        <Article.Util.Remove articleId={article.id} />
      </div>
    </div>
  );
};
```

### apps/koyo/lib/article/Article.Util.tsx

```ts
"use client";
import { fetch, usePage } from "@apps/koyo/client";
import { Model } from "akanjs/ui";

interface RemoveProps {
  articleId: string;
}
export const Remove = ({ articleId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={articleId} slice={fetch.slice.article}>
      {l("base.remove")}
    </Model.Remove>
  );
};
```

### apps/koyo/lib/article/Article.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import { Article, type cnst, fetch, usePage } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { buttonRecipe, Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"article", cnst.LightArticle>;
  projectId: string;
}
export const Card = ({ className, init, projectId }: CardProps) => {
  const { l } = usePage();
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderEmpty={() => (
          <Model.NewWrapper
            slice={fetch.slice.articleInProject}
            partial={{ projectId }}
          >
            <button className={buttonRecipe({ variant: "secondary" })}>
              {l("base.new")}
            </button>
          </Model.NewWrapper>
        )}
        renderItem={(article) => (
          <Article.Unit.Card
            key={article.id}
            href={`/article/${article.id}`}
            article={article}
          />
        )}
      />
      <Model.EditModal slice={fetch.slice.articleInProject}>
        <Article.Template.General />
      </Model.EditModal>
    </>
  );
};
```

### pageOf<Model><Suffix>, lastPageOf<Model><Suffix>, limitOf<Model><Suffix>

```ts
pageOfArticleInProject: 1
lastPageOfArticleInProject: 10
limitOfArticleInProject: 10
```

### hasMoreOf<Model><Suffix>, isCumulativeOf<Model><Suffix>

```ts
hasMoreOfArticleInProject: true
isCumulativeOfArticleInProject: false
```

### apps/koyo/page/project/[projectId]/_index.tsx

```ts
import { Article, fetch } from "@apps/koyo/client"; // [!code collapse:3]
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID)
  .render(async ({ projectId }) => {
    const [{ articleListInProject }] = await Promise.all([
      fetch.initArticleInProject(projectId),
    ]);
    return (
      <div className="flex flex-col gap-2">
        {articleListInProject.map((article) => (
          <Article.Unit.Card
            key={article.id}
            href={`/article/${article.id}`}
            article={article}
          />
        ))}
      </div>
    );
  });
```

### apps/koyo/page/project/[projectId]/_index.tsx

```ts
import { Article, fetch } from "@apps/koyo/client"; // [!code collapse:4]
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load, Loading } from "akanjs/ui";

export default page()
  .param("projectId", ID)
  .render(({ projectId }) => {
    const { articleListInProject } = fetch.initArticleInProject(projectId);
    return (
      <Load.Stream
        of={articleListInProject}
        fallback={<Loading.Skeleton active />}
      >
        {(articleList) => (
          <div className="flex flex-col gap-2">
            {articleList.map((article) => (
              <Article.Unit.Card
                key={article.id}
                href={`/article/${article.id}`}
                article={article}
              />
            ))}
          </div>
        )}
      </Load.Stream>
    );
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

