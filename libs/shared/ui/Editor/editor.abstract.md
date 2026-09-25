# Editor (Rich Text) — Abstract

The shared rich-text editor: a self-implemented **Lexical** editor in `libs/shared/ui/Editor/Lexical/`. `Editor.Rich` edits; `Editor.RichContent` renders read-only. These are the canonical (and only) names across every consumer — the former Slate-based Yoopta implementation, its `@yoopta/*` deps, and the `Editor.Slate`/`Editor.Yoopta`(`Content`) symbols were all removed at the **Phase 4 cutover (2026-07-17)**.

Migration history & working notes: `local/self-implemented-lexical/` (gitignored).

## Public contract (`Editor.Rich`)

The prop signature was kept intentionally identical to the outgoing Yoopta editor, so the cutover renamed symbols without touching call-site props.

- `value` / `defaultValue` — persisted content, a Lexical **`SerializedEditorState`** (`EditorState.toJSON()`), stored opaquely in each model's `content: field(Any)`.
- `onChange(json)` — receives `EditorState.toJSON()`; the caller persists it to `content`.
- `readOnly` / `disabled` — either makes the editor non-editable (`editable: false`).
- `placeholder`, `height`, `className` — presentation.
- `toolbar` / `slashMenu` / `blockActions` — toggle each interaction layer; **default `true`** when editable (mirrors Yoopta). Ignored when read-only/disabled.
- Upload props (`addFilesGql`, `addFile`, `attachments`, `onAttachmentAdd`, `onAttachmentsChange`, `onUploadError`, `uploadPolicy`) — the media/upload pipeline (Phase 3).
- `plugins` — consumer-supplied editor extensions (`EditorPlugin[]`); see "Plugin extension" below. `onDelete` remains declared for signature parity, but per-node deletion cleanup now runs inside a plugin's own mutation listener rather than through this prop.

`Editor.RichContent({ content, className })` — read-only render of the same content.

## Interaction layer (Lexical, Phase 2)

Editable instances mount three self-owned interaction plugins (all in `Lexical/plugins/`, all skinned with daisyUI, no global CSS):

- **`SlashMenuPlugin`** — `/` opens a grouped, searchable block picker (Text / Lists / Structure) built on `LexicalTypeaheadMenuPlugin`; ↑/↓/Enter/Esc handled by the plugin. Block conversions live in `blocks.ts` (`formatParagraph/Heading/Quote/Code`, `formatBulletList/NumberedList/CheckList`, `insertDivider`). Media/Embed/Table/etc. options arrive with their nodes in Phase 3.
- **`FloatingToolbarPlugin`** — selection-anchored toolbar (portaled to `body`): mark toggles (bold/italic/underline/strike/code) with active state + inline link editing (`⌘K` or the Link button; `safeExternalUrl`-validated; replaces the old `window.prompt`). Hidden while collapsed, unfocused, or `editor.isComposing()` (no IME flicker).
- **`DraggableBlockPlugin`** — hover handle over the editor wrapper (`anchorElem`): `+` inserts a paragraph below, the grip drags to reorder top-level blocks (`DraggableBlockPlugin_EXPERIMENTAL`, HTML5 drag) and clicking it opens duplicate/delete. Duplicate clones via `exportJSON → $parseSerializedNode`. Replaces the Yoopta `BlockActions` + `SortableBlock` + `BlockDndContext` stack (single-document model needs no external DnD context).

Rich paste is safe by construction: only registered node types (`AKAN_EDITOR_NODES`) are reconstructed from pasted HTML, so unknown markup is dropped rather than injected. `⌘B/I/U`, list indent (Tab/Shift+Tab), and Enter/Backspace merging come from the core `RichTextPlugin` + `TabIndentationPlugin`.

## Media layer (Lexical, Phase 3)

Five media block types plus an upload pipeline (all in `Lexical/nodes/` + `Lexical/plugins/`):

- **`ImageNode` / `VideoNode` / `EmbedNode`** — `DecoratorNode`s sharing `MediaFrame` (`nodes/shared.tsx`): click-to-select (`useLexicalNodeSelection`), Backspace/Delete removal, a floating menu (align L/C/R, image-only Fit/Fill, reset size, delete), and left/right pointer resize handles. Image adopts its intrinsic size on load. Embed renders an inline URL form until a `youtube`/`vimeo` URL resolves (`embed.ts` → provider `embedUrl`), then an iframe.
- **`FileNode`** — `DecoratorNode` rendering a download card (icon / name / size·format); no resize.
- **`CalloutNode`** — an `ElementNode` (editable text children) with 5 color variants; `CalloutPlugin` shows a variant swatch picker when the caret is inside one. Enter exits to a paragraph; Backspace-at-start unwraps.
- **Uploads** — `Editor.tsx` builds a `uploadFile` (validate → `addFileUntilActive` → track attachment) from the `addFilesGql`/`addFile`/policy props and provides it via `UploadContext`. Consumed by the slash menu media options (image/video/file, shown only when uploads are configured) and `UploadPlugin` (file drop + image paste). `upload.ts` holds the ported policy/validation; `attachments.ts` walks the serialized state to reconcile `attachments`/`onAttachmentsChange` against surviving `fileId`s.

Serialization: each node exports an explicit typed shape (`akan-image`/`-video`/`-file`/`-embed`/`-callout`) that round-trips through `importJSON`/`exportJSON`.

## Structural blocks (Lexical, Phase 3b)

Three higher-complexity blocks completing Yoopta parity:

- **Table** — the built-in `@lexical/table` nodes (`TableNode`/`TableRowNode`/`TableCellNode`) driven by `@lexical/react`'s `TablePlugin` (cell-merge, background color, Tab navigation). Slash "Table" inserts a 3×3 grid with a header row (`blocks.ts insertTable`). `TableActionsPlugin` floats a per-cell toolbar (insert/delete row & column, toggle header row/column, delete table) anchored to the focused cell. Skinned via the theme's `table*` keys.
- **Accordion / Toggle** — three coupled `ElementNode`s in `nodes/Collapsible.ts` (`CollapsibleContainerNode` `<details>`, `CollapsibleTitleNode` `<summary>`, `CollapsibleContentNode` `<div>`). Open state lives on the container, round-trips in serialization, and syncs back from the native `<details>` toggle. `CollapsiblePlugin` owns the insert command (`INSERT_COLLAPSIBLE_COMMAND`) and a transform that keeps every container well-formed as `[title, content]`.
- **Excalidraw** — a `DecoratorNode` (`nodes/ExcalidrawNode.tsx`) that dynamic-imports `@excalidraw/excalidraw` (bundle-isolated) and loads `/libs/shared/excalidraw.css` at runtime. It **renders like an image**: the scene's SVG snapshot (`exportToSvg`) shown bare through the shared `MediaFrame` — no card chrome — with a floating action menu (align, Edit, Reset-drawing, reset-size, delete) and left/right resize handles; width is stored on the node and height follows the SVG's intrinsic aspect ratio. It stores `{ scene, preview, width, align }`; a full-screen modal (portaled to `<body>`) edits the scene, and inline (data-URL) scene images upload via the `UploadContext` on save (`shared.error.excalidrawUploadNotConfigured` when uploads are absent). `attachments.ts` collects the scene's hosted file ids so they reconcile like other media. `MediaFrame` gained an `extraActions` slot so Excalidraw can add its Edit/Reset buttons to the shared menu (image/video/embed pass none).

Read-only renders (`Content.tsx`) need no extra plugins: tables/collapsibles render from their nodes' `createDOM`, `<details>` toggles natively, and Excalidraw's `decorate()` shows the preview only (`useLexicalEditable()` is false).

## Plugin extension (`plugins` prop)

A consuming lib/app extends the editor without the shared editor depending on it (the dependency points the other way). An `EditorPlugin` (`Lexical/plugin.ts`) contributes any of:

- **`nodes`** — custom node classes. Registered in `initialConfig.nodes` and therefore read **once at mount** (Lexical requires node classes up front; later changes are ignored).
- **`slashOptions`** — extra slash-menu entries, merged into `SlashMenuPlugin`'s option set.
- **`render`** — plugin components mounted inside `<LexicalComposer>` (e.g. a mutation listener); may use `useLexicalComposerContext` and the host's own hooks/stores. Editable instances only.

**Nested pages** are the sole user. `social`'s `pageBlockEditorPlugin()` supplies a `PageBlockNode` (a `DecoratorNode` rendering a link into a child page — not a nested editor), the "New Page" slash entry, and a deletion listener. Inserting one creates a child `pageBlock` record (via `fetch.addPageBlock`) and opens it; removing one reads the child id from the *previous* editor state and deactivates the record (`st.do.deletePageBlock`). `baseUrl`/`parentId` reach each node's decorate component through `PageBlockEditorProvider` (a React context `social` wraps around `Editor.Rich`), so they stay out of the serialized node. The parent's content — the node's presence — is owned by the editor's own save; the server no longer edits parent content on child create/delete (see `pageBlock.abstract.md`).

## Invariants

- **Serialization = `SerializedEditorState`.** No markdown/HTML layer; the JSON is the source of truth and round-trips losslessly (`toJSON → parseEditorState → toJSON` is stable — see `Lexical/serialization.test.ts`).
- **Fail-safe on bad input.** Any `value` that is not a valid `SerializedEditorState` (legacy Yoopta/Slate JSON, primitives, arrays, corrupt data) initializes to an **empty document** rather than crashing. Enforced by `isSerializedEditorState` + a parse try/catch in `createEditorConfig` (`config.ts` / `softGuard.ts`). This is the runtime half of the data-wipe policy (Phase 4 hard-wipes `content`/`contentFiles`; the soft guard defends any residue).
- **No global CSS injection.** The editor is skinned purely through `EditorThemeClasses` (Tailwind/daisyUI) in `theme.ts`, so it cannot clobber the app's layered utilities.
- **`value` is applied at mount, then re-applied imperatively** by `ExternalValuePlugin` when the prop changes — guarded against the onChange→setState→value feedback loop by skipping while the root is focused and when the incoming JSON already equals the current document. `onChange` is debounced (300ms) with an unmount flush so no edit is dropped.

## Supported blocks / marks (target parity)

- Marks (6): bold, italic, underline, strikethrough, code, highlight.
- Blocks: paragraph, heading 1–3, blockquote, bulleted/numbered/todo list, code, divider, link, callout (5 variants), image, video, file, embed, table, accordion/toggle, excalidraw.

All phases ship (0–4): foundation (history/save/read-only/fail-safe), all 6 marks, every text block (heading/quote/lists incl. todo/code+highlight/divider/link), markdown typing shortcuts, the full interaction layer (slash menu, floating toolbar, block drag/duplicate/delete), the media layer (image/video/file/embed/callout with upload, resize/align, and attachment reconcile), the structural blocks (table, accordion, excalidraw), and — via the `plugins` prop — `social`'s nested-page block. This is full block/mark parity with the removed Yoopta editor. The Phase 4 cutover switched every consumer (edit paths `Field.tsx`/`PageBlock.Zone.tsx`, all read-only views) to `Editor.Rich`/`Editor.RichContent` and deleted Yoopta. **Data note:** the cutover carries a hard-wipe policy for existing `content`/`contentFiles` (backend/ops task, run separately); the soft guard renders any un-wiped legacy JSON as empty.

## Serialization schema (regression anchor)

A minimal valid document (what `onChange` emits / `value` expects):

```json
{
  "root": {
    "type": "root",
    "format": "",
    "indent": 0,
    "version": 1,
    "direction": null,
    "children": [
      {
        "type": "paragraph",
        "format": "",
        "indent": 0,
        "version": 1,
        "direction": null,
        "children": [
          { "type": "text", "text": "…", "format": 0, "style": "", "mode": "normal", "detail": 0, "version": 1 }
        ]
      }
    ]
  }
}
```

The `root.type === "root"` shape is exactly what the soft guard checks; legacy Yoopta content (`{ "block-id": { … } }`) has no `root` and is rejected.

## Testing note (bun)

`Lexical/serialization.test.ts` imports only `lexical` core + the pure `softGuard`. It must **not** import `./config` (or any `@lexical/list|link|code|rich-text`), because those packages' dev ESM builds hit a circular-import TDZ under `bun test`'s default `development` export condition. This is a test-runtime-only issue — the app's webpack/Next build resolves fine. Tests that genuinely need the full node set must run with `bun test --conditions=production`.
