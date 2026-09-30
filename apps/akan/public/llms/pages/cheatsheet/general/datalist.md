# DataList & Enum

- Source: /cheatsheet/general/datalist
- Mirror: /llms/pages/cheatsheet/general/datalist.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- DataList & Enum (#overview)
- Enum (#enum)
- DataList (#datalist)
- Which One To Use (#when)
- Tips (#tips)

## Content

DataList & Enum

Enum and DataList are two small helpers you will meet all over Akan code. Enum is for a fixed set of values; DataList is for a list of items that each have an id.

A fixed set of values

Status, role, type, category: a value that is always one of a few known choices.

A list keyed by id

Users, files, posts, selected rows: records you find and replace by id.

Both are imported from `akanjs/base`.

Enum

Use an Enum when a value must be one of a few known choices. Declared once, it keeps forms, APIs and labels in agreement.

1. Declare It In The Constant File

Declare the class above the model classes, then use it as a field type:

**Always add `as const`.** Without it, `PostStatus["value"]` widens to `string` and a typo compiles.

**The first argument is the refName.** It is the class name in camelCase: `PostStatus` → `postStatus`.

**Numbers work too.** Whole numbers make an `Int` field; any decimal makes it `Float`.

**No TypeScript enum.** Akan never uses the `enum` keyword; a choice field is always an `enumOf` class.

2. Give Each Value A Label

Translate every value in the dictionary's `.enum()` stage, keyed by the refName:

**Every value needs an entry.** The stage is typed from `PostStatus`, so a missing value is a type error.

**Each label gets a key.** The value `draft` reads as `l("postStatus.draft")`.

3. Use It On Screen

In a form, hand the class straight to a toggle field:

**Labels come from the dictionary.** `Field.ToggleSelect` and `Field.MultiToggleSelect` take the enum class and label each choice by its key.

**Pass the setter as is.** `onChange={st.do.setStatusOnPost}` without an arrow wrapper keeps the field visible to the in-page agent.

To show a saved value, look up the same key. A module-scope map gives each value its own style:

**The map covers every value.** Typed as `{ [key in cnst.PostStatus["value"]]: string }`, it stops compiling when a new value has no class.

4. Work With Values In Code

The class itself carries the values and a few array helpers:

Member

- PostStatus["value"]: The value type, `"draft" | "published" | "archived"`, for props and parameters.

- values: Every value, in the order you declared them.

- has(value): Whether a value belongs to the enum, checked at runtime.

- indexOf(value): The value's position in `values`, throwing for a value outside the enum.

- map, filter, forEach: The usual array methods, run over `values`.

- find, findIndex: Like the array methods, but they throw when nothing matches.

- refName: The name you passed to `enumOf`, here `postStatus`.

A control that takes label/value pairs, such as `Select`, needs the labels mapped in:

**`Select` shows raw values.** `options={cnst.PostStatus}` works, but the list reads `draft`, not the translated label.

DataList

Use a DataList when a list is already loaded and you want to work with it by id. It suits UI state because adding, replacing, picking and filtering are one call each.

The Basics

A DataList keeps exactly one item per id:

**`set` adds or replaces.** A new id goes to the end; a known id is swapped in place.

**`pick` or `get`.** `pick(id)` throws for a missing id; `get(id)` returns `undefined`.

**`filter` makes a smaller DataList.** The original list stays as it was.

Methods At A Glance

Method

- new DataList(items): Builds a list from an array or another DataList, keeping the last item for a repeated id.

- set(item), delete(id): Add or replace, or remove, by id, changing this list in place and returning it.

- get(id), pick(id), has(id): Look up by id: `get` may return `undefined`, `pick` throws, `has` answers true or false.

- indexOf(id), at(idx), pickAt(idx): Position lookups, where `indexOf` and `pickAt` throw when nothing is there.

- filter, slice, sort: Return a new DataList, but `sort` also reorders the source array, so sort a copy.

- map, find, some, every, reduce, forEach, flatMap: The array methods over the items, where `map` returns a plain array.

- length, values: The item count and the underlying array, and the list itself works in `for…of` too.

- save(): Returns a new DataList with the same items, which is what a store needs.

DataList In The Store

Every slice gives the store three DataList keys, and `Load.Units` hands you one more. For a post model:

Name

- postList: The rows the slice has loaded, suffixed for a named slice as in `postListInPublic`.

- postInitList: The rows as the last `init` loaded them.

- postSelection: The rows a user selected, filled by `st.do.selectPost(post)`.

- renderList: `Load.Units` passes the list to this callback as a DataList.

Change A Store List

A custom store action writes the changed list back with `save()`, as the shared lib's admin store does:

**`set`, then `save`.** `set` changes the list in place; `save()` wraps it in a new DataList so the store sees a new value.

**Generated actions already do this.** Create, update and remove keep `postList` current; write an action only for a custom endpoint such as `addAdminRole`.

**Always hand the store a new DataList.** `adminList.set(admin)` returns the same instance, and the store compares values by reference, so nothing on screen updates. Finish with `.save()`.

Which One To Use

A label-like value is an Enum; a collection of records with ids is a DataList.

Question

- What it holds — One value from a fixed set — Records that each have an `id`

- Examples — Status, role, type, size, visibility — Users, files, posts, selected rows

- Where it lives — `*.constant.ts`, as a field type — Store state, or `new DataList(items)`

- Typical call — `PostStatus.has(value)` — `postList.pick(id)`

**DataList is not a database query.** It only works on data already loaded into the app, so `filter` sees the loaded rows, not the whole table.

**Narrow on the server instead.** To fetch fewer rows, add a query filter or a slice.

Querying

Filter rows on the server before they reach the list.

Form From Schema

Bind enum fields and other inputs to the store.

Tips

**Keep the refName stable.** Dictionaries, label keys like `postStatus.draft` and API schemas find the enum by it, so renaming it leaves them behind.

**Keep DataList items small.** Store lists hold light models, which carry only the fields a list needs.

**Sort a copy.** Write `list.filter(fn).sort(compare)` or `new DataList(list).sort(compare)`, never `sort` on a store list directly.

**Remember the shortcut.** Value choices are Enum; id collections are DataList.

## Code Examples

### apps/myapp/lib/post/post.constant.ts

```ts
import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PostStatus extends enumOf("postStatus", [
  "draft",
  "published",
  "archived",
] as const) {}

export class PostInput extends via((field) => ({
  title: field(String),
  status: field(PostStatus, { default: "draft" }),
})) {}
```

### apps/myapp/lib/post/post.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

import type { Post, PostInsight, PostStatus } from "./post.constant";
import type { PostFilter } from "./post.document";
import type { PostEndpoint, PostSlice } from "./post.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Post", "게시글"]).desc(["A post a user writes", "사용자가 쓰는 게시글"])) // [!code collapse:8]
  .model<Post>((t) => ({
    title: t(["Title", "제목"]).desc(["Post title", "게시글 제목"]),
    status: t(["Status", "상태"]).desc(["Publishing state", "공개 상태"]),
  }))
  .insight<PostInsight>((t) => ({}))
  .query<PostFilter>((fn) => ({}))
  .sort<PostFilter>((t) => ({}))
  .enum<PostStatus>("postStatus", (t) => ({
    draft: t(["Draft", "초안"]).desc(["Not public yet", "공개 전"]),
    published: t(["Published", "공개"]).desc(["Public", "공개됨"]),
    archived: t(["Archived", "보관"]).desc(["Hidden", "숨김"]),
  }))
  .slice<PostSlice>((fn) => ({})) // [!code collapse:4]
  .endpoint<PostEndpoint>((fn) => ({}))
  .error({})
  .translate({});
```

### apps/myapp/lib/post/Post.Template.tsx

```tsx
"use client";
import { cnst, st, usePage } from "@apps/myapp/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const postForm = st.use.postForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.ToggleSelect
        label={l("post.status")}
        desc={l("post.status.desc")}
        value={postForm.status}
        items={cnst.PostStatus}
        onChange={st.do.setStatusOnPost}
      />
    </Layout.Template>
  );
};
```

### apps/myapp/lib/post/Post.Unit.tsx

```tsx
import { type cnst, usePage } from "@apps/myapp/client";
import type { ModelProps } from "akanjs/client";

const statusClass: { [key in cnst.PostStatus["value"]]: string } = {
  draft: "text-foreground/60",
  published: "text-success",
  archived: "text-foreground/40",
} as const;

export const Card = ({ className, post }: ModelProps<"post", cnst.LightPost>) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <div className="font-semibold">{post.title}</div>
      <span className={statusClass[post.status]}>
        {l(`postStatus.${post.status}`)}
      </span>
    </div>
  );
};
```

### apps/myapp/lib/post/Post.Zone.tsx

```tsx
const { l } = usePage();
const statusOptions = cnst.PostStatus.map((status) => ({
  value: status,
  label: l(`postStatus.${status}`),
}));
```

### apps/myapp/lib/user/user.test.ts

```ts
import { describe, expect, test } from "bun:test";
import { DataList } from "akanjs/base";

describe("DataList", () => {
  test("keeps one item per id", () => {
    const users = new DataList([{ id: "u1", nickname: "Akan" }]);

    users.set({ id: "u2", nickname: "Akan" });
    users.set({ id: "u1", nickname: "Renamed" });

    expect(users.length).toBe(2);
    expect(users.pick("u1").nickname).toBe("Renamed");
    expect(users.get("u3")).toBeUndefined();
    expect(() => users.pick("u3")).toThrow();
    expect(users.filter((user) => user.nickname === "Akan").length).toBe(1);
  });
});
```

### libs/shared/lib/admin/admin.store.ts

```ts
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, () => ({
  me: new cnst.Admin(),
})) {
  async addAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.addAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

