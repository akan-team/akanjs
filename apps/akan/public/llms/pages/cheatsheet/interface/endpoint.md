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
- Put Rules In Service (#service)
- Call It From Store (#store)
- Make One Util (#util)
- Tips (#tips)

## Content

Endpoint

Endpoint Actions

CRUD handles the common actions. Endpoint is for one clear business action, such as publish, approve, reject, archive, or send notification.

A good rule is: one button action, one store action, one endpoint, one service method.

The Flow

User clicks a button in a Util component.

The button calls a store action.

The store action calls the generated fetch endpoint.

The endpoint delegates real work to the service.

Button to service

Declare Endpoint

Keep the endpoint thin. It receives parameters, checks guards if needed, and calls the service method.

Publish endpoint

Put Rules In Service

The service is where you write business rules. For example, a post can be published only when it has a title and content.

Service method

Call It From Store

Store actions make the UI code short. They can call fetch, show a message, close a modal, or refresh data after the endpoint succeeds.

Store action

Make One Util

Put the button in `Post.Util.tsx`. Then every card, detail page, or admin page can reuse the same action.

Publish button

Tips

Use endpoint names as verbs: `publishPost`, `approveTicket`, `archiveProject`.

Do not put business rules in the button. Put them in the service.

If the same action appears twice, make a Util component before copying the button.

## Code Examples

### Code

```ts
Post.Util.PublishButton
  -> st.do.publishPost(postId)
  -> fetch.publishPost(postId)
  -> postService.publishPost(postId)
```

### Code

```ts
export class PostEndpoint extends endpoint(srv.post, ({ mutation }) => ({
  publishPost: mutation(cnst.Post)
    .param("postId", ID)
    .exec(async function (postId) {
      return await this.postService.publishPost(postId);
    }),
})) {}
```

### Code

```ts
export class PostService extends serve(db.post, () => ({})) {
  async publishPost(postId: string) {
    const post = await this.getPost(postId);
    if (!post.title || !post.content) throw new Error("Post is not ready");
    return await post.set({ status: "published" }).save();
  }
}
```

### Code

```ts
export class PostStore extends store(sig.post, () => ({})) {
  async publishPost(postId: string) {
    const post = await fetch.publishPost(postId);
    msg.success("post.publishSuccess");
    this.setPost(post);
  }
}
```

### Code

```ts
"use client";
interface PublishProps {
  className?: string;
  postId: string;
}

export const Publish = ({ postId }: PublishProps) => {
  const { l } = usePage();
  return (
    <button className={clsx("btn btn-primary", className)} onClick={() => st.do.publishPost(postId)}>
      {l("post.signal.publishPost")}
    </button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

