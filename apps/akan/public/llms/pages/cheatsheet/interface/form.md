# Form

- Source: /cheatsheet/interface/form
- Mirror: /llms/pages/cheatsheet/interface/form.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- Form From Schema (#overview)
- Keep The Template Simple (#template)
- Create With SSR (#create-page)
- Update Page (#update-page)
- Edit In A Modal (#client-modal)
- Options And Tips (#tips)

## Content

Form

Form From Schema

Once the model's schema is designed, a form is a thin layer over it. The shell around the form prepares the data, and the Template only draws the fields.

Words used on this page

Term

- Template: The client component in `<Model>.Template.tsx` that draws the form's fields.

- articleForm: The store's copy of the record being written. `st.use.articleForm()` reads it.

- edit shell: A wrapper such as `Load.Edit` or `Model.Edit` that fills, opens and saves the form.

- fetch.slice.<name>: Tells a shell which model to save and which list a new record joins.

Pick the shell by where the form opens:

Shell

- Load.Edit: A page that creates or edits one record, such as `page/…/new.tsx` or `page/…/edit.tsx`.

- Model.Edit: An edit button on a list row or a card that opens a modal. It goes in `Article.Util.tsx`.

- Model.ViewEditModal: A card click opens the detail, which then turns into the form. It goes in `Article.Zone.tsx`.

**One Template serves all three.** It reads `st.use.articleForm()` and never checks whether it is creating or editing.

**The shell decides the rest:** what fills the form first, where saving leads, and whether it is a page or a modal.

Keep The Template Simple

A Template does not decide where the form came from. It reads the current form state and connects each field to its store setter.

What it uses

- st.use.articleForm(): The form state: defaults for a new record, the loaded record for an edit.

- st.do.set<Field>OnArticle: One setter per field, such as `setTitleOnArticle`. Hand it to `onChange` as is.

- Field.*: A label plus a control: `Field.Text`, `Field.TextArea`, `Field.ToggleSelect`, `Field.Date` and more.

A Template for an article with a title, a body and a status:

**`"use client"` on line 1, and no `useState`.** Every value lives in `articleForm`, which is what lets create, edit and the modal share this file.

**An enum goes straight into**`items`. `Field.ToggleSelect` labels each value from the dictionary.

**Normalize the input with**`transform`, such as `transform={(v) => v.toLowerCase()}` on `Field.Text`. The setter itself still goes to `onChange` untouched.

**Pass the setter itself, never an arrow around it.** `onChange={(v) => st.do.setTitleOnArticle(v)}` behaves the same but fails lint, and the field no longer publishes its agent tool or `data-akan-action`.

Create With SSR

When the page already knows some values, put them in a seed object and hand it to `Load.Edit`. Parent ids, the current org, a default status and values from the URL all belong here.

A new-article page under a board, rendered on the server with the board already filled in:

**A seed opens a new form.** Fields you leave out take the model's defaults, and the user never has to pick a hidden value such as the parent id.

**`type="form"` draws the form in place** with a save button under it. Leave it out and the form opens in a modal instead.

**`onSubmit` is where to go after saving.** `[articleId]` in the path becomes the new record's id, so `"/article/[articleId]"` opens what was just created.

**A value the page has to fetch**, such as a parent's setting, is awaited in the page and goes into the same seed.

Update Page

For a full edit page, fetch the record on the server and pass it to `Load.Edit`. The Template is exactly the one the create page uses:

**`fetch.editArticle` fills the form with the saved record.** The save button then reads Update instead of Create.

**The `articleEdit` promise goes across un-awaited.** The page is sent at once, and a skeleton (or your `loading`) holds the form's place until the record lands.

**Await when the page needs the record itself**, for a heading or a URL: `const { article, articleEdit } = await fetch.editArticle(articleId)`. The page then waits for the record before it is sent.

Edit In A Modal

When the user is already looking at a list or a card, editing in a modal is faster than moving to a new page. There are two shapes:

An Edit button that opens the form in a modal. Put it in a row, a dropdown or a card.

A card click opens the detail view, and its Edit button turns the same modal into the form.

Model.Edit — an edit button

A Util that draws the button and the modal for one article:

**A click loads the record.** It calls `st.do.editArticle(articleId)`, which fetches the record into `articleForm` and opens the modal.

**Saving closes the modal** and updates the record in every list already on screen.

**`renderTitle="title"` titles the modal** with the model name and the form's `title`. `trigger` replaces the default Edit button.

**Button and modal in different places?** `Model.Edit` is `Model.EditWrapper` (the trigger) plus `Model.EditModal id={articleId}` (the modal), so use the two separately.

Model.ViewEditModal — view, then edit

One modal beside the list serves every card in it:

**`Model.ViewWrapper` opens the view.** A card click calls `st.do.viewArticle(id)`, and the modal draws `renderView`.

**Edit swaps in `renderTemplate`, and Save returns to the view** with the updated record. The ⋮ menu holds Remove, and `menu={false}` hides it.

**`renderTitle`, `editLabel` and `saveLabel`** change the modal title and the two button labels.

**It lives in a Zone, not a page.** `renderView` and `renderTemplate` are functions, and a server page cannot pass a function to a client component.

Options And Tips

`Load.Edit` hands these props on to `Model.EditModal`, which takes them too. On `Model.EditModal`, `onSubmit` and `onCancel` may also be functions.

Load.Edit props

- slice (SliceMeta): Required. `fetch.slice.<name>`: the model to save and the list a new record joins.

- edit (Partial<Model> | ClientEdit): Required. A seed object opens a new form; `fetch.edit<Model>` opens a saved record.

- type ("modal" | "form" | "empty", default "modal"): `form` draws the form in place with a save button; `empty` draws the fields only.

- modal (string, default "edit"): The store's modal name that opens this form. Give a second form of the same model its own name.

- onSubmit (string): After saving: a path, `back`, or `reset`. `[articleId]` in a path becomes the saved id.

- onCancel (string): When the modal closes: a path, `back`, or `reset`. `type=form` draws no cancel control.

- submitOption (CreateOption): Store options for the save. `{ path: "self" }` also writes the saved record into `self`.

- submitText (string): Save button label. Without it, the button reads Create or Update plus the model name.

- renderSubmit (boolean, default true): `false` hides the save button, so you can call `st.do.submitArticle()` from your own.

- checkSubmit (boolean, default true): Keeps save disabled until the form passes the model's input rules.

- loading (ReactNode, default Loading.Skeleton): Shown while an un-awaited `edit` promise is still pending.

- draft (boolean | string, default true): Draft recovery. `false` turns it off; a string names the scope.

- className (string): Wrapper classes. `modalClassName` and `submitClassName` style the modal and the save button.

Tips

**Reuse one Template** for the create page, the update page and the edit modal.

**Do not ask the user for hidden values** such as a parent id. Prepare them on the server and put them in the seed.

**Page moves go in `onSubmit`, store writes in `submitOption`.** On a profile form, `submitOption={{ path: "self" }}` keeps `st.use.self()` current after saving.

**When field logic grows, split it into small field groups**, but keep the Template as the form's owner.

**Never save form values yourself.** The shell keeps a draft as the user types and offers it back on the next open; `draft={false}` turns that off.

## Code Examples

### apps/koyo/lib/article/Article.Template.tsx

```ts
"use client";
import { cnst, st, usePage } from "@apps/koyo/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const articleForm = st.use.articleForm();
  const { l } = usePage();

  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("article.title")}
        value={articleForm.title}
        onChange={st.do.setTitleOnArticle}
      />
      <Field.TextArea
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

### apps/koyo/page/board/[boardId]/article/new.tsx

```ts
import { Article, type cnst, fetch } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("boardId", ID)
  .render(({ boardId }) => {
    const articleForm: Partial<cnst.Article> = {
      board: boardId,
      status: "draft",
    };

    return (
      <Load.Edit
        slice={fetch.slice.articleInBoard}
        edit={articleForm}
        type="form"
        onSubmit={`/board/${boardId}`}
      >
        <Article.Template.General />
      </Load.Edit>
    );
  });
```

### apps/koyo/page/article/[articleId]/edit.tsx

```ts
import { Article, fetch } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("articleId", ID)
  .render(({ articleId }) => {
    const { articleEdit } = fetch.editArticle(articleId);

    return (
      <Load.Edit
        slice={fetch.slice.articleInBoard}
        edit={articleEdit}
        type="form"
        onSubmit={`/article/${articleId}`}
      >
        <Article.Template.General />
      </Load.Edit>
    );
  });
```

### apps/koyo/lib/article/Article.Util.tsx

```ts
"use client";
import { Article, fetch } from "@apps/koyo/client";
import { Model } from "akanjs/ui";

interface EditProps {
  articleId: string;
}
export const Edit = ({ articleId }: EditProps) => {
  return (
    <Model.Edit
      renderTitle="title"
      slice={fetch.slice.articleInBoard}
      modelId={articleId}
    >
      <Article.Template.General />
    </Model.Edit>
  );
};
```

### apps/koyo/lib/article/Article.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import { Article, type cnst, fetch } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"article", cnst.LightArticle>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(article) => (
          <Model.ViewWrapper
            key={article.id}
            slice={fetch.slice.articleInPublic}
            modelId={article.id}
          >
            <Article.Unit.Card article={article} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.articleInPublic}
        renderView={(article) => <Article.View.General article={article} />}
        renderTemplate={() => <Article.Template.General />}
      />
    </>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

