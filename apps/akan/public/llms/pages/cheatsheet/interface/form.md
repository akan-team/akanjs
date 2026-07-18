# Form

- Source: /cheatsheet/interface/form
- Mirror: /llms/pages/cheatsheet/interface/form.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- Form From Schema (#overview)
- Keep Template Simple (#template)
- Create With SSR (#create-page)
- Update Page (#update-page)
- Client Modal Edit (#client-modal)
- Tips (#tips)

## Content

Form

Form From Schema

After the model schema is designed, the form should be a thin UI over that shape. The easiest pattern is: prepare data in the wrapper, draw fields in the Template.

Server page prepares create defaults or parent ids.

Template reads `st.use.articleForm()` and renders fields.

Modal wrappers handle quick client-side edits.

Keep Template Simple

A Template should not decide where the form came from. It only reads the current form state and connects each field to a store setter.

Article template

Create With SSR

Use `Load.Edit` on a server-rendered page when the page already knows default values. This is useful for parent ids, current org, default status, or values from the URL.

New article page

Update Page

For a full edit page, fetch the model on the server and pass it to `Load.Edit`. The Template can stay exactly the same as create.

Edit article page

Client Modal Edit

When the user is already looking at a list or detail card, editing in a modal is often faster than moving to a new page.

Edit current item

View and edit modal

Tips

Reuse one Template for create, update page, and edit modal.

Do not ask the user to choose hidden values such as parent id. Prepare them on the server.

Use `onSubmit` for normal page movement and `submitOption` for special submit paths such as `self`.

If field logic grows, split small field groups, but keep the form owner as the Template.

## Code Examples

### Code

```ts
"use client";

export const General = () => {
  const articleForm = st.use.articleForm();
  const { l } = usePage();

  return (
    <Layout.Template>
      <Field.Text
        label={l("article.title")}
        value={articleForm.title}
        onChange={st.do.setTitleOnArticle}
      />
      <Field.Textarea
        label={l("article.content")}
        value={articleForm.content}
        onChange={st.do.setContentOnArticle}
      />
      <Field.ToggleSelect
        label={l("article.status")}
        value={articleForm.status}
        items={cnst.ArticleStatus}
        onChange={st.do.setStatusOnArticle}
      />
    </Layout.Template>
  );
};
```

### Code

```ts
export default async function Page({ params }: PageProps) {
  const { boardId } = params;
  const board = await fetch.viewBoard(boardId);
  const articleForm: Partial<cnst.Article> = {
    board: board.id,
    status: "draft",
  };

  return (
    <Load.Edit
      slice={fetch.slice.articleInBoard}
      edit={articleForm}
      type="form"
      onCancel="back"
      onSubmit={`/board/${board.id}`}
    >
      <Article.Template.General />
    </Load.Edit>
  );
}
```

### Code

```ts
export default async function Page({ params }: PageProps) {
  const articleEdit = await fetch.editArticle(params.articleId);

  return (
    <Load.Edit
      slice={fetch.slice.articleInBoard}
      edit={articleEdit}
      type="form"
      onSubmit={`/article/${article.id}`}
    >
      <Article.Template.General />
    </Load.Edit>
  );
}
```

### Code

```ts
<Model.EditModal id={article.id} type="form" slice={fetch.slice.articleInBoard}>
  <Article.Template.General />
</Model.EditModal>
```

### Code

```ts
<Model.ViewEditModal
  slice={fetch.slice.articleInPublic}
  renderView={(article) => <Article.View.General article={article} />}
  renderTemplate={() => <Article.Template.General />}
/>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

