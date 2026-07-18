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
- When To Use (#when)
- Tips (#tips)

## Content

DataList & Enum

Enum and DataList are small helpers you will see often in Akan. Enum is for a fixed set of values. DataList is for a list of items that each have an id.

Enum: status, role, type, category.

DataList: users, files, posts, selected rows.

Enum

Use Enum when the value must be one of a few known choices. This keeps forms, APIs, and labels consistent.

Fixed values

Use values in UI

DataList

Use DataList when you already loaded a list and want to update it by id. It is useful for UI state because you can add, replace, pick, and filter items easily.

`set(item)`: add or replace an item.

`pick(id)`: get one item by id.

`filter(fn)`: make a smaller DataList.

List by id

When To Use

Use Enum when the value is a kind of label: status, role, type, size, visibility.

Use DataList when the data is a collection of records with ids.

Do not use DataList as a database query. It is for data already loaded into the app.

Tips

Give enum names stable `refName`s because dictionaries and schemas can refer to them.

Keep DataList items small. It works best with light models used in lists.

Remember the shortcut: value choices are Enum, id collections are DataList.

## Code Examples

### Code

```ts
export class PostStatus extends enumOf("postStatus", [
  "draft",
  "published",
  "archived",
] as const) {}
```

### Code

```ts
const options = PostStatus.map((status) => ({
  value: status,
  label: status,
}));
```

### Code

```ts
const users = new DataList([
  { id: "u1", nickname: "Akan" },
]);

users.set({ id: "u2", nickname: "Akan" });

const user = users.pick("u1");
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

