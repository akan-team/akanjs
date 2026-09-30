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
- Reference Or Copy (#denormalize)
- The Five Model Classes (#layers)
- Design Checklist (#tips)

## Content

Schema Design

In Akan, `<model>.constant.ts` describes the shape of your data. The easiest way to design it is to start from the page or API that reads the data.

One simple rule settles most cases:

Keep It Together

Small data that is read together stays inside one document.

Split It Out

Data that keeps growing moves to a model of its own.

Words used on this page

Term

- document: One stored record of a model, such as one post.

- relation: A field typed as another model, which stores only the id and is loaded by the server.

- scalar: A value object declared under `lib/__scalar/` and stored inside the document.

- Light<Model>: The few fields of a model that one list row shows, such as `LightPost`.

- child model: A model whose documents point back at a parent, like comments at a post.

Start From The Screen

Before adding fields, picture the list page, the detail page and the form. The schema should make those everyday reads easy.

Screen

Lands in

Ask first

- List page — What small fields should every row show? — LightPost

- Detail page — What full data should load together? — Post

- Form — Which values does the user type in? — PostInput

- Child list — What can grow forever, like comments or logs, and needs its own model? — Comment

The list page's answer becomes the key list of `LightPost`:

**Every list row has this shape.** A slice list holds `LightPost` rows, so each key here rides along with every row.

**The id and timestamps come free.** `id`, `createdAt`, `updatedAt` and `removedAt` are always included, so you do not list them.

**The key list is type-checked.** Only keys of `PostObject` are accepted, and the array ends in `as const`.

Relationship Size

When one thing has many children, first ask how many there will be. The answer picks the schema.

How many

Store it as

- One to few: Embed a scalar array in the document, as for a user's few links or a post's small settings. — Example: `links: field([ExternalLink])`

- One to many: Keep an array of relations, which stores only ids, as for selected files or assigned users. — Example: `files: field([File])`

- One to squillions: Make a child model that points back at its parent, as for comments, logs, events or telemetry. — Example: `post: field(ID, { ref: "post" })`

Comments can grow without limit, so they get a model of their own that points back at the post:

**The child points at the parent.** The post keeps no comment array, so it stays the same size however many comments arrive.

**`ref` names the parent model.** `ref: "post"` says which model the stored id belongs to.

**`cascade: "removeWith"` removes the comments with their post.** Leave it off when comments must outlive the post.

**Never let an array inside a document grow without limit.** Every field is stored in the document itself, so each read of that row carries the whole array.

Reference Or Copy

A post list usually shows the author's name and picture next to each post. Both schemas below put them in the same response, so the list page needs no extra request.

What you get

Reference — field(LightUser)

Copy — field(AuthorCard)

- When the list is read

  - Same response: Either way, the list page sends no second request.

  - Always current: The server looks the user up each time it builds a response.

  - No lookup on read: The copied values are read exactly as stored.

- When the post is written

  - Stores only the id: The post keeps the user's id and nothing else about them.

  - Updated by your code: A copy changes only when your code writes it again.

Yes

No

**Good to copy:** small values that rarely change, such as a name, a thumbnail or a short status text.

**Reference instead:** values that change every second or must always be perfectly fresh.

Declaring each one

A reference is a field whose type is a model, such as `LightUser` or `File`:

A copy first needs a scalar that holds the snapshot:

Then the post keeps a field of that type:

**The author goes on `PostObject`, not `PostInput`.** The user uploads the thumbnail, but the server fills in the author from the signed-in user and never trusts one the client sends.

**Point a reference at `Light<Model>`.** `field(LightUser)` sends only the light fields, while `field(User)` sends the full user.

**Scaffold the scalar with `akan create-scalar authorCard`.** It lands in `lib/__scalar/authorCard/`.

The Five Model Classes

Every `<model>.constant.ts` declares five classes, always in this order. Each is a different view of the same data.

Class

- <Model>Input: Fields a user can submit through a form.

- <Model>Object: `<Model>Input` plus fields the server manages, such as a status or a counter.

- Light<Model>: The small shape for list rows and relations, which also holds display methods like `isNew()`.

- <Model>: The full document: everything in `<Model>Object` and `Light<Model>`.

- <Model>Insight: Summary numbers for dashboards, always including `count`.

A complete `post.constant.ts` with all five:

**Write all five, even when one is empty.** `PostInsight` stays `(field) => ({})` until a dashboard needs a number.

**Each class builds on the one before.** `PostObject` extends `PostInput`, `LightPost` picks from `PostObject`, and `Post` joins both.

**Enums sit above the classes.** `enumOf` takes an `as const` array, and a `default` names one of its values.

Design Checklist

Run through these before you add a field.

**Design for the everyday read.** A perfect database diagram matters less than the pages people open every day.

**Give an endless array its own model.** Comments, logs and events belong in a child model, not in an array field.

**Keep `Light<Model>` small.** It should feel like a list row, not the full detail page.

**Reference by default, copy on purpose.** Copy only small values that rarely change.

Read next

- model.constant.ts — Every field type, option and rule of the constant file.

- Cascade Remove — Which side of a relation is removed along with the other.

- Scalar Tutorial — Build a scalar and embed it in a model, step by step.

## Code Examples

### apps/myapp/lib/post/post.constant.ts

```ts
export class LightPost extends via(
  PostObject,
  ["title", "author", "thumbnail", "status"] as const,
  (resolve) => ({}),
) {}
```

### apps/myapp/lib/comment/comment.constant.ts

```ts
import { ID } from "akanjs/base";
import { via } from "akanjs/constant";

export class CommentInput extends via((field) => ({
  post: field(ID, { ref: "post", cascade: "removeWith" }),
  content: field(String),
})) {}
```

### apps/myapp/lib/post/post.constant.ts

```ts
export class PostInput extends via((field) => ({
  title: field(String),
  thumbnail: field(File).optional(),
})) {}

export class PostObject extends via(PostInput, (field) => ({
  author: field(LightUser),
})) {}
```

### apps/myapp/lib/__scalar/authorCard/authorCard.constant.ts

```ts
import { via } from "akanjs/constant";

export class AuthorCard extends via((field) => ({
  nickname: field(String),
  imageUrl: field(String).optional(),
})) {}
```

### apps/myapp/lib/post/post.constant.ts

```ts
export class PostObject extends via(PostInput, (field) => ({
  authorCard: field(AuthorCard),
})) {}
```

### apps/myapp/lib/post/post.constant.ts

```ts
import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PostStatus extends enumOf("postStatus", [
  "draft",
  "published",
] as const) {}

export class PostInput extends via((field) => ({
  title: field(String),
})) {}

export class PostObject extends via(PostInput, (field) => ({
  status: field(PostStatus, { default: "draft" }),
})) {}

export class LightPost extends via(
  PostObject,
  ["title", "status"] as const,
  (resolve) => ({}),
) {}

export class Post extends via(PostObject, LightPost, (resolve) => ({})) {}

export class PostInsight extends via(Post, (field) => ({})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

