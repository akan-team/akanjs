import type { AkanChangeMap, AkanGraph, AkanGraphChange, AkanGraphLocation } from "akanjs/common";
import type { BuildChangesPayload, BuildGraphPayload } from "../../artifact";
import { StudioActions } from "./studioActions";
import { type StudioBox, StudioLayout, type StudioScene, type StudioView } from "./studioLayout";
import { studioRuntime } from "./studioRuntime";
import { StudioRuntimeGraph, type StudioRuntimePayload } from "./studioRuntimeGraph";
import { studioStyle } from "./studioStyle";

export type StudioEditor = "vscode" | "cursor";

export interface StudioQuery {
  view: StudioView;
  module: string | null;
  editor: StudioEditor;
  since: string | null;
}

export interface StudioDocumentProps {
  basePath: string;
  appName: string;
  payload: BuildGraphPayload | BuildChangesPayload | StudioRuntimePayload;
  query: StudioQuery;
}

const editorLabels: { [editor in StudioEditor]: string } = { vscode: "VS Code", cursor: "Cursor" };
const views = ["erd", "signals", "changes", "runtime"] as const;
const viewLabels: { [view in StudioView]: string } = {
  erd: "ERD",
  signals: "Signals",
  changes: "Changes",
  runtime: "Runtime (live)",
};
const viewTitles: { [view in StudioView]?: string } = {
  runtime: "Read from the running server's DI container, not from source: it needs a running server",
};
const changeSigns: { [change in AkanGraphChange]: string } = { added: "+", removed: "−", changed: "~" };
const charWidth = 7.3;
const kindShownIn: { [view in StudioView]: Set<string> } = {
  erd: new Set(["model", "scalar", "enum"]),
  signals: new Set(["endpoint", "slice", "query", "model"]),
  changes: new Set(["endpoint", "slice", "query", "model", "scalar", "enum", "guard"]),
  runtime: new Set(["service", "adaptor", "internal"]),
};
const emptyGraph: AkanGraph = { version: 1, nodes: [], edges: [] };
const clip = (text: string, max: number) => {
  const room = Math.max(8, max);
  return text.length > room ? `${text.slice(0, room - 1)}…` : text;
};

export class StudioDocument {
  static render({ basePath, appName, payload, query }: StudioDocumentProps) {
    const live = "deps" in payload ? payload : null;
    const runtime = live ? StudioRuntimeGraph.of(live) : null;
    const changes = "changes" in payload ? payload.changes : null;
    const changeMap = changes && "nodes" in changes ? changes : null;
    const failure =
      changes && "error" in changes
        ? changes.error
        : live && "error" in live.deps
          ? `The running server's DI graph could not be read: ${live.deps.error}`
          : null;
    const graph = "graph" in payload ? payload.graph : (changeMap ?? emptyGraph);
    const listed = runtime ? runtime.modules : StudioLayout.modulesOf(graph);
    const modules = query.module && !listed.includes(query.module) ? [query.module, ...listed] : listed;
    const scene = runtime
      ? StudioLayout.runtime(runtime, query.module)
      : query.view === "erd"
        ? StudioLayout.erd(graph, query.module)
        : query.view === "signals"
          ? StudioLayout.signals(graph, query.module ?? modules[0] ?? null)
          : StudioLayout.changes(graph, query.module);
    const hrefOf = (next: Partial<StudioQuery>) => StudioDocument.href(basePath, { ...query, ...next });
    const workspaceRoot = "workspaceRoot" in payload ? payload.workspaceRoot : null;
    const openOf = (at: AkanGraphLocation | null) =>
      at && workspaceRoot !== null ? StudioDocument.editorHref(query.editor, workspaceRoot, at) : undefined;
    const graphHref =
      query.view === "changes" || query.view === "runtime"
        ? StudioDocument.href(`${basePath}/graph`, query)
        : `${basePath}/graph`;
    const unmapped = changeMap ? StudioLayout.unmappedIn(changeMap.unmapped, query.module) : [];
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{`Akan Studio · ${appName}`}</title>
          <style>{studioStyle}</style>
        </head>
        <body>
          <header>
            <strong>Akan Studio</strong>
            <span className="muted">{appName}</span>
            <nav>
              {views.map((view) => (
                <a
                  key={view}
                  href={hrefOf({ view })}
                  title={viewTitles[view]}
                  aria-current={view === query.view ? "page" : undefined}
                >
                  {viewLabels[view]}
                </a>
              ))}
            </nav>
            <form method="get" action={basePath}>
              <input type="hidden" name="view" value={query.view} />
              <input type="hidden" name="editor" value={query.editor} />
              <select name="module" defaultValue={query.module ?? ""} data-studio-module="">
                {query.view !== "signals" ? <option value="">All modules</option> : null}
                {modules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
              {query.view === "changes" ? (
                <input
                  type="text"
                  name="since"
                  defaultValue={query.since ?? ""}
                  placeholder="Since: default branch"
                  aria-label="Since"
                />
              ) : query.since ? (
                <input type="hidden" name="since" value={query.since} />
              ) : null}
              <noscript>
                <button type="submit">Show</button>
              </noscript>
            </form>
            <input type="search" placeholder="Filter by name" data-studio-filter="" />
            {changeMap ? <span className="muted">{StudioDocument.#summary(changeMap)}</span> : null}
            {live ? (
              <span className="live" title={viewTitles.runtime}>
                {StudioDocument.#liveSummary(live)}
              </span>
            ) : null}
            <span className="muted">{`${scene.boxes.length} nodes · ${scene.links.length} edges`}</span>
            <div
              className="actions"
              data-studio-actions=""
              data-label={appName}
              data-actions={JSON.stringify(StudioActions.ofApp(appName))}
            />
            <nav className="end">
              {(["vscode", "cursor"] as const).map((editor) => (
                <a key={editor} href={hrefOf({ editor })} aria-current={editor === query.editor ? "true" : undefined}>
                  {editorLabels[editor]}
                </a>
              ))}
              <a href={graphHref}>JSON</a>
            </nav>
          </header>
          <main>
            {failure ? (
              <p className="empty">{failure}</p>
            ) : scene.boxes.length ? (
              StudioDocument.#svg(scene, query.view, openOf)
            ) : (
              <p className="empty">
                {changeMap && !query.module
                  ? `No node changed since ${changeMap.since}.`
                  : "Nothing to draw here. Pick another module or view."}
              </p>
            )}
            {live && "error" in live.signal && runtime ? (
              <p className="notice">{`Jobs are not drawn: the signal serializer failed (${live.signal.error}).`}</p>
            ) : null}
            {live && !("error" in live.deps) && live.deps.disabledModules.length ? (
              <section className="unmapped">
                <h2>Modules this server left out</h2>
                <ul>
                  {live.deps.disabledModules.map(({ refName, reason }) => (
                    <li key={refName}>{`${refName}: ${reason}`}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {unmapped.length ? (
              <section className="unmapped">
                <h2>Changed files no node covers</h2>
                <ul>
                  {unmapped.map(({ file, change }) => (
                    <li key={file} className={change}>
                      {`${changeSigns[change]} `}
                      {change === "removed" ? file : <a href={openOf({ file, line: 1, column: 1 })}>{file}</a>}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </main>
          {StudioDocument.#runtime()}
        </body>
      </html>
    );
  }

  static unavailable(appName: string, reason: string) {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>{`Akan Studio · ${appName}`}</title>
          <style>{studioStyle}</style>
        </head>
        <body>
          <p className="empty">{reason}</p>
          {StudioDocument.#runtime()}
        </body>
      </html>
    );
  }

  static #runtime() {
    return (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the Studio runtime, a function the server owns
      <script dangerouslySetInnerHTML={{ __html: `(${studioRuntime.toString()})();` }} />
    );
  }

  static href(basePath: string, { view, module, editor, since }: StudioQuery): string {
    const search = new URLSearchParams({ view, editor });
    if (module) search.set("module", module);
    if (since) search.set("since", since);
    return `${basePath}?${search.toString()}`;
  }

  static #summary({ since, summary }: AkanChangeMap): string {
    return `since ${since} · +${summary.added} −${summary.removed} ~${summary.changed}`;
  }

  static #liveSummary({ app }: StudioRuntimePayload): string {
    return `live from pid ${app.pid} · ${app.serverMode} replica ${app.replicaIdx}`;
  }

  static editorHref(editor: StudioEditor, workspaceRoot: string, at: AkanGraphLocation): string {
    const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
    const file = `${root.startsWith("/") ? "" : "/"}${root}/${at.file}`;
    return `${editor}://file${encodeURI(file)}:${at.line}:${at.column}`;
  }

  static #svg(scene: StudioScene, view: StudioView, openOf: (at: AkanGraphLocation | null) => string | undefined) {
    return (
      <svg data-studio="" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="arrow" />
          </marker>
        </defs>
        {scene.columns.map((column) =>
          column.label ? (
            <text key={column.x} className="column" x={column.x} y={24}>
              {column.label}
            </text>
          ) : null,
        )}
        <g>
          {scene.links.map(({ edge, path }) => (
            <path
              key={`${edge.from}>${edge.to}>${edge.kind}>${edge.label ?? ""}`}
              d={path}
              className={edge.change ? `link ${edge.kind} ${edge.change}` : `link ${edge.kind}`}
              data-from={edge.from}
              data-to={edge.to}
              markerEnd="url(#arrow)"
            >
              <title>
                {`${edge.change ? `${edge.change} ` : ""}${edge.kind} ${edge.label ?? ""}${edge.count > 1 ? ` ×${edge.count}` : ""}`}
              </title>
            </path>
          ))}
        </g>
        <g>{scene.boxes.map((box) => StudioDocument.#box(box, view, openOf))}</g>
      </svg>
    );
  }

  static #box(
    { node, x, y, width, height, rows }: StudioBox,
    view: StudioView,
    openOf: (at: AkanGraphLocation | null) => string | undefined,
  ) {
    const lib = node.owner?.startsWith("libs/") ? node.owner.slice(5) : null;
    const kind = [lib, kindShownIn[view].has(node.kind) ? node.kind : null].filter(Boolean).join(" · ");
    const chars = Math.floor((width - 24) / charWidth);
    const mark = view === "changes" ? (node.change ?? "context") : null;
    const actions = StudioActions.of(node);
    return (
      <g
        key={node.id}
        className={mark ? `box ${node.kind} ${mark}` : `box ${node.kind}`}
        data-node={node.id}
        data-label={node.label}
        data-actions={actions.length ? JSON.stringify(actions) : undefined}
      >
        <title>{node.at ? `${node.label}\n${node.at.file}:${node.at.line}` : node.label}</title>
        <rect x={x} y={y} width={width} height={height} rx={6} />
        <rect className="bar" x={x} y={y} width={4} height={height} rx={2} />
        <a href={openOf(node.change === "removed" ? null : node.at)}>
          <text className="title" x={x + 12} y={y + 18}>
            {clip(
              node.change ? `${changeSigns[node.change]} ${node.label}` : node.label,
              kind ? chars - kind.length - 1 : chars,
            )}
          </text>
        </a>
        <text className="kind" x={x + width - 10} y={y + 18} textAnchor="end">
          {kind}
        </text>
        {rows.map((row, idx) => (
          <a key={idx} href={openOf(row.at)}>
            {row.skipped ? <title>{row.skipped}</title> : null}
            <text className={row.skipped ? "skipped" : row.change} x={x + 12} y={row.y + 4}>
              {clip(
                row.change ? `${changeSigns[row.change]} ${row.text}` : row.text,
                row.hint ? chars - row.hint.length - 1 : chars,
              )}
            </text>
            <text className="hint" x={x + width - 10} y={row.y + 4} textAnchor="end">
              {row.hint}
            </text>
          </a>
        ))}
      </g>
    );
  }
}
