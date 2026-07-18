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

CRUD is usually the first screen you build: list items, open one item, create a new one, edit it, and remove it. In Akan, most of that work is already prepared around a model slice.

Slice decides which records this screen can read and edit.

Template draws the form fields.

Load and Model components connect the slice to UI behavior.

Start With A Slice

A slice is a named window into your model. Give it a name that matches the screen, such as `inPublic`, `inAdmin`, or `inProject`.

Post slice

List And Open

`Load.Units` renders the list. `Model.ViewEditModal` can live next to the list and handle detail view plus edit modal behavior.

Post list zone

Create And Edit

Use the same Template for create and update. The wrapper prepares the form state, and the Template only cares about fields.

Create page

Edit modal

Remove In Util

Delete buttons usually appear in many places. Put them in `Post.Util.tsx` so Unit, View, and Zone files stay simple.

Remove helper

Tips

Name slices after screens, not database queries.

Keep Template boring. It should mostly read form state and render fields.

Use Util components for repeated actions such as remove, publish, approve, or open dialog.

## Code Examples

### Code

```ts
export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.postService.queryPublishedPosts();
    }),
  }),
) {}
```

### Code

```ts
export const PublicPosts = ({ init }) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(post) => <Post.Unit.Card key={post.id} post={post} />}
      />
      <Model.ViewEditModal
        slice={fetch.slice.postInPublic}
        renderView={(post) => <Post.View.General post={post} />}
        renderTemplate={() => <Post.Template.General />}
      />
    </>
  );
};
```

### Code

```ts
<Load.Edit
  slice={fetch.slice.postInAdmin}
  edit={{ status: "draft" }}
  type="form"
  onSubmit="/posts"
>
  <Post.Template.General />
</Load.Edit>
```

### Code

```ts
<Model.EditModal id={post.id} slice={fetch.slice.postInAdmin} type="form">
  <Post.Template.General />
</Model.EditModal>
```

### Code

```ts
export const Remove = ({ postId }: { postId: string }) => {
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

