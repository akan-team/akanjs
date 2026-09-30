# CRUD

- Source: /cheatsheet/interface/crud
- Mirror: /llms/pages/cheatsheet/interface/crud.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- CRUD With Less Code (#overview)
- Start With A Slice (#slice)
- List And Open (#list)
- Create And Edit (#create-edit)
- Remove In Util (#remove)
- Tips (#tips)

## Content

CRUD

CRUD With Less Code

CRUD is usually the first screen you build: list records, open one, create one, edit it and remove it. In Akan the store actions and components for all five already exist, so you write the three pieces below and the pages that place them.

What you write

- post.signal.ts: The slice. It decides which records this screen can read and edit. — Example: `inAdmin: init({ guards: [Admin] })`

- Post.Template.tsx: Draws the form fields. Create and edit use the same one. — Example: `onChange={st.do.setTitleOnPost}`

- Post.Zone.tsx: Connects the slice to UI behaviour with the `Load` and `Model` components. — Example: `<Load.Units init={init} renderItem={…} />`

Each task maps to the components and generated store actions that do it:

Task

Store key or action

Component

- List — Load.Units — postListInAdmin

- Open — Model.ViewWrapper + Model.ViewEditModal — viewPost(id)

- Create — Load.Edit · Model.New — newPost → submitPost

- Edit — Load.Edit · Model.Edit — editPost(id) → submitPost

- Remove — Model.Remove — removePost(id)

Start With A Slice

A slice is a named window into your model: the list one screen shows. Give it a name that matches the screen, such as `inPublic`, `inAdmin` or `inProject`.

1. Declare the filter

Say what "public" means in the document. Each filter adds a `query<Name>()` method to the service:

2. Expose it as a slice

Then list it in the signal, one key per screen:

**`queryInPublic()` comes from the filter.** `queryAny()` comes from the `any` filter every model has.

**Each key names the fetch methods.** `inAdmin` gives `fetch.initPostInAdmin()` and `fetch.slice.postInAdmin`, which the next steps use.

**Return the query, do not shape it.** Order and page size are fetch options (`{ sort, page, limit }`), not `.sort()` on the query.

Who may call what

The `guards` map covers the generated endpoints, and each named slice brings its own:

Key

What it guards

- root: The root slice `initPost(queryKey, args)`, which can run any filter, so it is always `Admin`.

- get: The single-record read `fetch.post(id)`, which `viewPost` and `editPost` also use.

- cru: `createPost`, `updatePost`, `removePost`; the `create`, `update`, `remove` keys override one each.

- init({ guards }): A named slice's own list, which the `guards` map above never reaches.

**A named slice is guarded only by its own `init({ guards })`.** `get` and `cru` never reach it, so `inAdmin: init()` with no guards serves every post to any caller. `None` closes an endpoint to everyone.

List And Open

The page loads the first rows on the server. A Zone draws them with `Load.Units`, and `Model.ViewEditModal` beside the list handles the detail view and the edit form.

1. Load in the page

The page starts the slice query and hands the promise to the Zone:

2. Draw it in a Zone

Each card opens its post, and one modal shows whichever post is open:

**Why a Zone.** `renderItem`, `renderView` and `renderTemplate` are functions, and a server page cannot pass a function to a client component.

**One modal serves every card.** `Model.ViewWrapper` calls `st.do.viewPost(id)`, and the modal draws `renderView`.

**Edit is built in.** The modal's Edit button swaps in `renderTemplate`, and Save returns to the view. The ⋮ menu holds Remove; `menu={false}` hides it.

**No empty or paging code.** `Load.Units` shows `<Empty />` when there are no rows and paginates by default.

Create And Edit

Use the same Template for create and edit. The shell, the component around the form, prepares `postForm` and saves it, so the Template only cares about fields. A form with no id is created, one with an id is updated.

Pick the shell by where the form should appear:

Shell

Where it goes and what opens it

- Load.Edit: Goes on a page of its own, such as `new.tsx`; the form is open as soon as the route is.

- Model.New: Goes anywhere and draws its own New button; a click calls `st.do.newPost()`.

- Model.Edit: Goes anywhere and draws its own Edit button; a click calls `st.do.editPost(id)`.

- Model.ViewEditModal: Goes beside a list in a Zone; the Edit button in its detail view opens the form.

Create page

A create page seeds the form with the values a new post starts with:

Edit page

An edit page loads the record on the server and hands it to the same shell:

**`type="form"` draws the form in place** with its own Save button. The default, `"modal"`, opens it in a modal.

**`slice` names the list a new post joins.** A create through `postInAdmin` lands at the top of `postListInAdmin`; an edit updates every list already loaded.

**`onSubmit` and `onCancel` take a path.** `"back"` goes back, and `[postId]` in an `onSubmit` path becomes the saved post's id.

**The form survives accidents.** The shell saves the form as the user types and offers it back on the next open. `draft={false}` turns that off.

Edit in a modal

To edit without leaving the screen, `Model.Edit` draws an Edit button and its modal together:

**A click loads the record.** It calls `st.do.editPost(postId)`, which fills `postForm` and opens the modal.

**Button and modal in different places?** `Model.Edit` is `Model.EditWrapper` (the trigger) plus `Model.EditModal id={postId}` (the modal). The modal alone opens nothing until `editPost` runs.

**`Model.New` is the create twin.** Same props minus `modelId`; `partial` seeds the new form.

Remove In Util

Delete buttons usually appear in many places: a card, a detail view, a menu. Put one `Remove` in `Post.Util.tsx`, next to `Edit`, so the Unit, View and Zone files stay simple:

**It asks first.** A click opens a confirm modal; confirming calls `st.do.removePost(postId)` and shows a success toast.

**Every list drops the row.** Removal goes by id, so any slice of the model works here; `fetch.slice.post` is the root one.

**On a detail page**, `redirect="back"` or a path moves away after the removal. `name` fills the confirm sentence, and `title`, `description`, `action` replace parts of the modal.

Tips

**Name slices after screens, not database queries.** `inAdmin` says who looks at the list, not how it is fetched.

**Keep the Template boring.** It reads `postForm` and draws fields, with each setter passed by reference: `onChange={st.do.setTitleOnPost}`.

**Repeated actions go to Util.** Remove, publish, approve or open a dialog: write it once in `Post.Util.tsx` and place it anywhere.

Read next

- Forms — The Template, the create and edit pages, and every shell option in detail.

- model.signal.ts — Slices, guards and the fetch names each slice key produces.

- model.Zone.tsx — How a Zone hydrates the store and hands rows to Unit and View.

- model.Util.tsx — One domain action as a control, such as `Remove` or `Publish`.

## Code Examples

### apps/blog/lib/post/post.document.ts

```ts
import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class PostFilter extends from(cnst.Post, (filter) => ({
  query: {
    inPublic: filter().query(() => ({ status: "published" })),
  },
  sort: {},
})) {}

export class Post extends by(cnst.Post) {}

export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {}
```

### apps/blog/lib/post/post.signal.ts

```ts
import { Admin } from "@libs/shared/srvkit"; // [!code collapse:5]
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class PostInternal extends internal(srv.post, () => ({})) {}

export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init({ guards: [Public] }).exec(function () {
      return this.postService.queryInPublic();
    }),
    inAdmin: init({ guards: [Admin] }).exec(function () {
      return this.postService.queryAny();
    }),
  }),
) {}

export class PostEndpoint extends endpoint(srv.post, () => ({})) {}
```

### apps/blog/page/admin/post/_index.tsx

```tsx
import { fetch, Post } from "@apps/blog/client";
import { page } from "akanjs/client";

export default page().render(() => {
  const { postInitInAdmin } = fetch.initPostInAdmin();
  return <Post.Zone.Card init={postInitInAdmin} />;
});
```

### apps/blog/lib/post/Post.Zone.tsx

```tsx
"use client"; // [!code collapse:4]
import { type cnst, fetch, Post } from "@apps/blog/client";
import type { ClientInit } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"post", cnst.LightPost>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(post) => (
          <Model.ViewWrapper
            key={post.id}
            slice={fetch.slice.postInAdmin}
            modelId={post.id}
          >
            <Post.Unit.Card post={post} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.postInAdmin}
        renderView={(post) => <Post.View.General post={post} />}
        renderTemplate={() => <Post.Template.General />}
      />
    </>
  );
};
```

### apps/blog/page/admin/post/new.tsx

```tsx
import { type cnst, fetch, Post } from "@apps/blog/client";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page().render(() => {
  const postForm: Partial<cnst.Post> = { status: "draft" };
  return (
    <Load.Edit
      slice={fetch.slice.postInAdmin}
      edit={postForm}
      type="form"
      onSubmit="/admin/post"
    >
      <Post.Template.General />
    </Load.Edit>
  );
});
```

### apps/blog/page/admin/post/[postId]/edit.tsx

```tsx
import { fetch, Post } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("postId", ID)
  .render(async ({ postId }) => {
    const [{ postEdit }] = await Promise.all([fetch.editPost(postId)]);
    return (
      <Load.Edit
        slice={fetch.slice.postInAdmin}
        edit={postEdit}
        type="form"
        onSubmit="/admin/post"
      >
        <Post.Template.General />
      </Load.Edit>
    );
  });
```

### apps/blog/lib/post/Post.Util.tsx

```tsx
"use client";
import { fetch, Post } from "@apps/blog/client";
import { Model } from "akanjs/ui";

interface EditProps {
  postId: string;
}
export const Edit = ({ postId }: EditProps) => {
  return (
    <Model.Edit
      slice={fetch.slice.postInAdmin}
      modelId={postId}
      renderTitle="title"
    >
      <Post.Template.General />
    </Model.Edit>
  );
};
```

### apps/blog/lib/post/Post.Util.tsx

```tsx
"use client";
import { fetch, usePage } from "@apps/blog/client";
import { Model } from "akanjs/ui";

interface RemoveProps {
  postId: string;
}
export const Remove = ({ postId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={postId} slice={fetch.slice.post}>
      {l("base.remove")}
    </Model.Remove>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

