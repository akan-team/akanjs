# Schema Design

- Source: /cheatsheet/general/schema
- Mirror: /llms/pages/cheatsheet/general/schema.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Schema Design (#overview)
- Start From The Screen (#query-first)
- Relationship Size (#relationship-size)
- Copy Small Snapshots (#denormalize)
- Akan Model Layers (#layers)
- Tips (#tips)

## Content

Schema Design

In Akan, `constant.ts` is where you describe the shape of your data. The easiest way to design it is to start from the page or API that will read the data.

A simple rule is: keep small data that is read together in one document, and split data that keeps growing into another model.

Start From The Screen

Before adding fields, imagine the list page, detail page, and form. The schema should make those common reads easy.

List page: what small fields should every row show?

Detail page: what full data should load together?

Child list: what data can grow forever, like comments or logs?

Small list shape

Relationship Size

When one thing has many children, first ask how many children there will be. The answer changes the schema.

One to few: embed it. Example: a user's two or three links, a post's small settings.

One to many: use ids or light snapshots. Example: selected files, assigned users.

One to squillions: make a child model. Example: comments, logs, events, telemetry.

Growing child model

Copy Small Snapshots

Sometimes copying a small piece of data makes the page much simpler. For example, a post can keep a light author snapshot so the list page does not need another request.

Good to copy: name, thumbnail, small status text.

Be careful: values that change every second or must always be perfectly fresh.

Light snapshot

Akan Model Layers

`Input`: fields a user can submit.

`Object`: fields the server manages, such as status or counters.

`Light<Model>`: small shape for lists and snapshots.

`Model`: the full document.

`Insight`: summary data for dashboards.

Common shape

Tips

Design for the read path people use every day, not for a perfect database diagram.

If an array can grow without limit, it probably deserves its own model.

Keep `Light<Model>` small. It should feel like a list row, not the full detail page.

## Code Examples

### Code

```ts
export class LightPost extends via(
  PostObject,
  ["title", "author", "thumbnail", "status"] as const,
  (resolve) => ({}),
) {}
```

### Code

```ts
export class CommentInput extends via((field) => ({
  post: field(ID, { ref: "post" }),
  content: field(String),
})) {}
```

### Code

```ts
export class PostInput extends via((field) => ({
  author: field(LightUser),
  title: field(String),
  thumbnail: field(File).optional(),
})) {}
```

### Code

```ts
export class PostInput extends via((field) => ({
  title: field(String),
})) {}

export class PostObject extends via(PostInput, (field) => ({
  status: field(PostStatus, { default: "draft" }),
})) {}

export class LightPost extends via(PostObject, ["title", "status"] as const, (resolve) => ({})) {}
export class Post extends via(PostObject, LightPost, (resolve) => ({})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

