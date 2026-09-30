# Endpoint

- Source: /cheatsheet/interface/endpoint
- Mirror: /llms/pages/cheatsheet/interface/endpoint.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- Endpoint Actions (#overview)
- The Flow (#flow)
- Declare Endpoint (#endpoint)
- Put Rules In Service And Document (#service)
- Call It From Store (#store)
- Make One Util (#util)
- Tips (#tips)

## Content

Endpoint

Endpoint Actions

Every model already comes with create, update and remove. When a screen needs one clear business action on top — publish, approve, reject, archive, send a notification — you write an endpoint for it.

CRUD — generated

Comes with every model. You write no endpoint for it.

Endpoint — you write it

One business action, named with a verb.

The rule of thumb: **one button, one store action, one endpoint, one service method.**

Words used on this page

Term

- endpoint: A server function the client calls by name. You declare it in `<model>.signal.ts`.

- guard: A class that decides who may call an endpoint. It runs before the handler.

- service: The server class in `<model>.service.ts` that loads, checks and saves.

- document chain method: A method on the document class that checks and changes one record, then returns `this`.

- store action: A client method called as `st.do.x()`. It calls `fetch` and updates the screen.

- Util: A small client component in `<Model>.Util.tsx` for one domain action.

The Flow

Here is a post's Publish button, followed from the click to the database. Each layer does one job and hands the rest down:

File

What it does

- Post.Util.tsx: **Button.** The user clicks it, and it only calls the store action. — Example: `st.do.publishPost(postId)`

- post.store.ts: **Store action.** Calls the generated fetch function, stores the result, shows a toast. — Example: `fetch.publishPost(postId)`

- post.signal.ts: **Endpoint.** Runs the guards, then hands the work to the service. — Example: `this.postService.publish(postId, self.id)`

- post.service.ts: **Service.** Loads the post, checks it belongs to the caller, and saves it. — Example: `post.publish().save()`

- post.document.ts: **Document.** Checks that the post is ready, then changes its state. — Example: `this.status = "published"`

**You never write the client call.** `fetch.publishPost` is generated from the endpoint you declare in the signal.

**The model name comes back at the edges.** The document and service say `publish()`; the signal, store and dictionary say `publishPost`.

Declare Endpoint

Keep the endpoint thin: take the arguments, name the guards, and call the service. The endpoint goes in the Endpoint class of the model's signal file:

**`mutation` changes data, `query` only reads.** Both come from the `endpoint()` callback, and the first argument is the return type.

**`.with(Self)` is the signed-in user.** The server fills it in, so never take the acting user's id from the client.

**`exec` gets the arguments in order.** First the client arguments, then the `.with()` values. Write it as a `function`, not an arrow, so `this.postService` resolves.

**Declare all three classes, even when empty.** `PostInternal`, `PostSlice` and `PostEndpoint` sit together, and the slice's `root` guard is always `Admin`.

Arguments

Builder

- .param(name, Type): A required path segment: one scalar or `enumOf`, not a model or array. No optional arg before it. — Example: `.param("postId", ID)`

- .body(name, Type, options?): A request-body value, mostly for mutations. `{ nullable: true }` makes it optional. — Example: `.body("data", cnst.PostInput)`

- .search(name, Type): A query-string value. Always optional, so `exec` may receive `undefined`. — Example: `.search("keyword", String)`

- .with(InternalArg, options?): Server-filled, never sent by the client. Without `{ nullable: true }`, a `null` refuses the call. — Example: `.with(Self)`

Common options

The second argument of `mutation()` or `query()` is the options object:

- guards (GuardCls[], default none): Guard classes that must all pass, run in order before the handler.

- timeout (number (ms), default 30 s (client)): Declare it for work over 30 s. Past it the caller gets `base.error.gatewayTimeout`.

- mcp (boolean, default true): `false` keeps it away from AI agents. Guards and HTTP stay the same.

- nullable (boolean, default false): Allows a `null` return. Without it, `exec` may not return `null`.

**The first guard that refuses answers the call.** The guards after it and the handler never run.

**A timeout answers the caller; it does not stop the work.** The handler still runs to the end, with nobody waiting for its result.

**Every custom endpoint names its own guards.** The slice's guard map covers only the generated CRUD, never `publishPost`. An endpoint without `guards` is open to anyone over HTTP and is left out of the MCP catalogue; so is a mutation guarded only by `Public`.

Put Rules In Service And Document

Business rules never go in the button or the endpoint. Where each check goes depends on what it looks at:

The check

Guard — post.signal.ts

Service — post.service.ts

Document — post.document.ts

- Who is calling

  - may call at all: Request policy. `guards: [Every]` refuses anyone who is not signed in.

  - owns this post: The service checks ownership again, even after a guard passed.

- What is changing

  - rule across documents: Load every document the rule reads, then save, then notify.

  - state precondition: The post needs a title and content before it becomes `published`.

Goes here

Not here

1. Document: the state change

A post can be published only when it has a title and content. That check lives on the record itself:

**Validate, change, return.** Check first, change `this`, and end with `return this`.

**It never saves.** The caller saves once, so chain methods can be combined.

2. Service: load, check, save

The service loads the post, checks it belongs to the caller, then runs the chain and saves:

**`getPost` comes with `serve(db.post)`.** Every model service gets a `get<Model>(id)` loader.

**Two gates, not one.** `Every` only checks that someone is signed in; the service checks the post is theirs.

**Keep the tail explicit.** Write `return await …save()` as it is.

3. Dictionary: register the keys

A key like `post.error.notReady` exists only once the module dictionary registers it as an `[en, ko]` pair:

**`.error()` keys** are thrown as `new Err("post.error.notReady")`.

**`.endpoint()` labels** are read with `l("post.signal.publishPost")`. `.arg()` names every argument.

**`.translate()` keys** feed toasts such as `msg.success("post.publishSuccess")`.

**Refuse with `new Err("<module>.error.<key>")`, never `throw new Error`.** A raw `Error` carries no key the dictionary could translate for the reader, and lint rejects it.

Call It From Store

Client components do not call `fetch` themselves; a store action does. A custom endpoint gets no generated action, so write one:

**About three lines.** `await fetch.x()`, a generated setter such as `this.setPost()`, then the toast.

**More fits here too.** After the endpoint succeeds, the action can also close a modal or refresh data.

**An action returns nothing.** Write the result into state with a setter or `this.set({ … })`; a returned value never reaches the caller.

Make One Util

Put the button in `Post.Util.tsx`. Every card, detail page and admin page can then reuse the same action:

**Always a client component.** `"use client"` sits on line 1 because the button has an `onClick` and uses the store.

**Named for the verb.** Export `Publish`, not `PublishPostButton`; a page renders `<Post.Util.Publish postId={post.id} />`.

**Take an id, not a model.** A Util prop typed as `cnst.Post` fails lint; pass `postId: string`.

Tips

**Start endpoint names with a verb:** `publishPost`, `approveTicket`, `archiveProject`.

**Keep rules out of the button.** They belong in the service or the document.

**Seen the same action twice?** Make it a Util component before you copy the button.

**Never reuse a generated CRUD name.** `post`, `lightPost`, `createPost`, `updatePost`, `removePost`, `viewPost`, `editPost` and `mergePost` already exist. Declaring one again in the Endpoint class fails lint.

Read next

- CRUD — The create, update and remove actions every model already has.

- Every endpoint option — cache, method, path, prefix and the rest of the options object.

- MCP server — How guarded endpoints become tools an AI agent can call.

- Agent chat — Let the in-page agent press the same button with st.tool.

## Code Examples

### apps/myapp/lib/post/post.signal.ts

```ts
import { Admin, Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class PostInternal extends internal(srv.post, () => ({})) {}

export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  () => ({}),
) {}

export class PostEndpoint extends endpoint(srv.post, ({ mutation }) => ({
  publishPost: mutation(cnst.Post, { guards: [Every] })
    .param("postId", ID)
    .with(Self)
    .exec(async function (postId, self) {
      return await this.postService.publish(postId, self.id);
    }),
})) {}
```

### apps/myapp/lib/post/post.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Post extends by(cnst.Post) {
  // draft -> published
  publish() {
    if (!this.title || !this.content) throw new Err("post.error.notReady");
    this.status = "published";
    return this;
  }
}
```

### apps/myapp/lib/post/post.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class PostService extends serve(db.post, () => ({})) {
  async publish(postId: string, userId: string) {
    const post = await this.getPost(postId);
    if (post.author !== userId) throw new Err("post.error.notAuthor");
    return await post.publish().save();
  }
}
```

### apps/myapp/lib/post/post.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

import type { Post, PostInsight, PostStatus } from "./post.constant";
import type { PostFilter } from "./post.document";
import type { PostEndpoint, PostSlice } from "./post.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Post", "게시글"]).desc([
      "A post a member writes",
      "회원이 작성하는 게시글",
    ]),
  )
  .model<Post>((t) => ({ // [!code collapse:14]
    title: t(["Title", "제목"]).desc(["Title of the post", "게시글 제목"]),
    content: t(["Content", "내용"]).desc(["Body of the post", "게시글 본문"]),
    status: t(["Status", "상태"]).desc(["Publish state", "발행 상태"]),
    author: t(["Author", "작성자"]).desc(["Who wrote it", "작성한 사용자"]),
  }))
  .insight<PostInsight>((t) => ({}))
  .query<PostFilter>((fn) => ({}))
  .sort<PostFilter>((t) => ({}))
  .enum<PostStatus>("postStatus", (t) => ({
    draft: t(["Draft", "초안"]).desc(["Not public yet", "아직 비공개"]),
    published: t(["Published", "발행됨"]).desc(["Public", "공개됨"]),
  }))
  .slice<PostSlice>((fn) => ({}))
  .endpoint<PostEndpoint>((fn) => ({
    publishPost: fn(["Publish Post", "게시글 발행"])
      .desc([
        "Publish a draft post so readers can see it",
        "초안 게시글을 발행해 독자에게 공개합니다",
      ])
      .arg((t) => ({
        postId: t(["Post ID", "게시글 ID"]).desc([
          "The post to publish",
          "발행할 게시글",
        ]),
      })),
  }))
  .error({
    notReady: [
      "Post is not ready to publish",
      "게시글을 발행할 준비가 되지 않았습니다.",
    ],
    notAuthor: [
      "Only the author can publish this post",
      "작성자만 이 게시글을 발행할 수 있습니다.",
    ],
  })
  .translate({
    publishSuccess: ["Post published", "게시글을 발행했습니다."],
  });
```

### apps/myapp/lib/post/post.store.ts

```ts
import { store } from "akanjs/store";

import { fetch, msg, sig } from "../useClient";

export class PostStore extends store(sig.post, () => ({})) {
  async publishPost(postId: string) {
    this.setPost(await fetch.publishPost(postId));
    msg.success("post.publishSuccess");
  }
}
```

### apps/myapp/lib/post/Post.Util.tsx

```ts
"use client";
import { st, usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";

interface PublishProps {
  className?: string;
  postId: string;
}
export const Publish = ({ className, postId }: PublishProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => st.do.publishPost(postId)}
    >
      {l("post.signal.publishPost")}
    </button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

