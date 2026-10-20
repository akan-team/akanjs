---
"akanjs": minor
---

`page()` takes an `.app(name, description, load)` stage, which declares one component of the screen as an MCP App. `load` receives the page's typed arguments and `lang`, and returns the element. On the web, that element reaches `.render()` as the argument named `name`:

```tsx
export default page()
  .param("ticketId", ID, { desc: "The ticket to show." })
  .app("showTicket", "Show one ticket with its status and assignee.", ({ ticketId }) => {
    const { ticketView } = fetch.viewTicket(ticketId);
    return <Ticket.Zone.View view={ticketView} />;
  })
  .render(({ showTicket }) => <div className="flex flex-col gap-4">{showTicket}</div>);
```

- A page may declare several apps. An app name follows the prompt name rule (`^[A-Za-z0-9_-]{1,64}$`) and needs a description.
- A name that `.render()` already receives fails to compile and throws when the module loads. That covers `lang`, a `.param()` or `.search()` name (in either order), and another app. An app named like the page's own `.prompt()` also throws.
- `load` may only query. A mutation, a file upload, a room subscription or a message sent while `load` runs throws `base.error.mutationInApp` before anything is built or sent. That holds on the server through every `await`, and in a browser for `load`'s synchronous part. The new `AppScope` (`akanjs/fetch`) marks the run.
