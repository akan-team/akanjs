<!-- akan:generated -->

## Auto-Generated API Reference

akan sync automatically generates APIs across all layers. Only write custom logic — never hand-write what the framework generates.

### Signal — Endpoint Auto-Generation

| Auto-Generated | Signature | Description |
|---------------|-----------|-------------|
| `view[Model](id)` | `fetch.viewTask(id)` | Fetch single model for detail view |
| `edit[Model](id)` | `fetch.editTask(id)` | Fetch model for edit view |
| `merge[Model](id, data)` | `fetch.mergeTask(data)` | Create (no id) or update (with id) model |
| `[model]List[Suffix](args, skip, limit, sort)` | `fetch.taskListInTodo(args)` | Paginated list from slice filter |
| `[model]Insight[Suffix](args)` | `fetch.taskInsightInTodo(args)` | Aggregated insight from slice query |
| `init[Model][Suffix](args)` | `fetch.initTaskInTodo(args)` | Initialize slice with list + insight |

**Rule**: Only define `query()`, `mutation()`, `message()`, `pubsub()` endpoints manually when the endpoint needs custom business logic. Standard CRUD is already auto-generated.

### Service — CRUD & Query Auto-Generation

| Auto-Generated | Description |
|---------------|-------------|
| `this.<model>Model` | Auto-injected model adaptor |
| `get<Model>(id)`, `load<Model>(id)` | Single document lookup: `get` throws `NoDocumentError` for a missing or removed id, answered 404 `base.error.documentNotFound`; `load` returns `null` |
| `create<Model>(data)`, `update<Model>(id, data)`, `remove<Model>(id)` | CRUD operations — named after the model, e.g. `createTask`/`updateTask`/`removeTask` (there is no literal `createModel`) |
| `list<Query>(args)`, `find<Query>(args)`, `pick<Query>(args)` | Filter-based queries |
| `exists<Query>(args)`, `count<Query>(args)`, `insight<Query>(args)` | Filter-based helpers |
| `_preCreate`, `_postCreate`, `_preUpdate`, `_postUpdate`, `_preRemove`, `_postRemove` | Lifecycle hooks (override to add logic) |

**Rule**: Use `_preCreate`/`_postCreate` lifecycle hooks for side effects (e.g., push workHistory entries). Write custom service methods only for multi-model orchestration.

### Store — State & Action Auto-Generation

| Auto-Generated | Description |
|---------------|-------------|
| `[model]` (cached full model), `[model]Loading`, `[model]Form`, `[model]Modal` | Base model states |
| `create[Model](data)`, `update[Model](id, data)`, `remove[Model](id)` | CRUD actions |
| `new[Model](partial)`, `edit[Model](model)`, `view[Model](model)` | Form/view state actions |
| `[slice]List`, `[slice]InitList`, `[slice]Insight`, `[slice]Selection`, `hasMoreOf[Slice]` | Slice states |
| `init[Slice](args)`, `refresh[Slice]()`, `setPageOf[Slice](page)`, `loadMoreOf[Slice]()` | Slice actions |
| `invalidate[Model]()` | Marks every slice stale without a request, so the next `Load.Units` / `Load.View` mount refetches — for a custom mutation whose changed rows the store never received |
| `set[Field]On[Model](value)` | Auto-setters for each model field |
| `upload[Field]On[Model](fileList, idx?)` | Upload into a `File` field, scoped to the form that started it |
| `[model]FormUploading` | Pending uploads per `File` field (`{}` when idle); submits save nothing until empty |

**Rule**: Write custom store actions only for toast messages (`msg.loading`/`msg.success`) or multi-step workflows. State fields and CRUD actions are already auto-generated.

### Document — Filter Query Auto-Generation

| Auto-Generated (from Filter definition) | Description |
|----------------------------------------|-------------|
| `list[Query](args)`, `listIds[Query](args)` | List documents matching filter |
| `find[Query](args)`, `findId[Query](args)` | Find one (null if not found) |
| `pick[Query](args)`, `pickId[Query](args)` | Find one (throw if not found) |
| `exists[Query](args)`, `count[Query](args)` | Existence check and count |
| `insight[Query](args)`, `query[Query](args)` | Insight and raw query |
| `remove[Query](args)`, `removeOne[Query](args)` | Query-level soft remove — all matches, or the newest one (`createdAt` desc, not caller-chosen) |
| `purge[Query](args)` | Hard delete of every match, removed rows too, returning the count — no undo |
| `update[Query](args).set(patch)`, `updateOne[Query](args).set(patch)` | Query-level update — the patch lands on a terminal `.set()`, because a filter's trailing args may be optional |

**Rule**: Define `Filter` with `.query()` conditions in `document.ts`. akan sync auto-generates all 15 query helper methods per filter. Write `Document` chain methods only for state transitions with validation.

**The five query-level writes fire no hooks**, so no `_pre`/`_postRemove` and no cascade run — same as `updateManyByQuery`. Reach for them when the model carries no removal side effect; otherwise remove documents one at a time. A filter keyed after its own model (filter `chat` on model `chat`) is rejected at boot, because `removeChat`/`updateChat` would otherwise shadow the generated single-document CRUD.
