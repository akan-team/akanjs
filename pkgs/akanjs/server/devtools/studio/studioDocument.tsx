import type { AkanGraphLocation } from "akanjs/common";
import type { BuildGraphPayload } from "../../artifact";
import { type StudioBox, StudioLayout, type StudioScene, type StudioView } from "./studioLayout";
import { studioRuntime } from "./studioRuntime";
import { studioStyle } from "./studioStyle";

export type StudioEditor = "vscode" | "cursor";

export interface StudioQuery {
  view: StudioView;
  module: string | null;
  editor: StudioEditor;
}

export interface StudioDocumentProps {
  basePath: string;
  appName: string;
  payload: BuildGraphPayload;
  query: StudioQuery;
}

const editorLabels: { [editor in StudioEditor]: string } = { vscode: "VS Code", cursor: "Cursor" };
const viewLabels: { [view in StudioView]: string } = { erd: "ERD", signals: "Signals" };
const charWidth = 7.3;
const kindShownIn: { [view in StudioView]: Set<string> } = {
  erd: new Set(["model", "scalar", "enum"]),
  signals: new Set(["endpoint", "slice", "query", "model"]),
};
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export class StudioDocument {
  static render({ basePath, appName, payload, query }: StudioDocumentProps) {
    const modules = StudioLayout.modulesOf(payload.graph);
    const scene =
      query.view === "erd"
        ? StudioLayout.erd(payload.graph, query.module)
        : StudioLayout.signals(payload.graph, query.module ?? modules[0] ?? null);
    const hrefOf = (next: Partial<StudioQuery>) => StudioDocument.href(basePath, { ...query, ...next });
    const openOf = (at: AkanGraphLocation | null) =>
      at ? StudioDocument.editorHref(query.editor, payload.workspaceRoot, at) : undefined;
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
              {(["erd", "signals"] as const).map((view) => (
                <a key={view} href={hrefOf({ view })} aria-current={view === query.view ? "page" : undefined}>
                  {viewLabels[view]}
                </a>
              ))}
            </nav>
            <form method="get" action={basePath}>
              <input type="hidden" name="view" value={query.view} />
              <input type="hidden" name="editor" value={query.editor} />
              <select name="module" defaultValue={query.module ?? ""} data-studio-module="">
                {query.view === "erd" ? <option value="">All modules</option> : null}
                {modules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit">Show</button>
              </noscript>
            </form>
            <input type="search" placeholder="Filter by name" data-studio-filter="" />
            <span className="muted">{`${scene.boxes.length} nodes · ${scene.links.length} edges`}</span>
            <nav className="end">
              {(["vscode", "cursor"] as const).map((editor) => (
                <a key={editor} href={hrefOf({ editor })} aria-current={editor === query.editor ? "true" : undefined}>
                  {editorLabels[editor]}
                </a>
              ))}
              <a href={`${basePath}/graph`}>JSON</a>
            </nav>
          </header>
          <main>
            {scene.boxes.length ? (
              StudioDocument.#svg(scene, query.view, openOf)
            ) : (
              <p className="empty">Nothing to draw here. Pick another module or view.</p>
            )}
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

  static href(basePath: string, { view, module, editor }: StudioQuery): string {
    const search = new URLSearchParams({ view, editor });
    if (module) search.set("module", module);
    return `${basePath}?${search.toString()}`;
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
              className={`link ${edge.kind}`}
              data-from={edge.from}
              data-to={edge.to}
              markerEnd="url(#arrow)"
            >
              <title>{`${edge.kind} ${edge.label ?? ""}${edge.count > 1 ? ` ×${edge.count}` : ""}`}</title>
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
    return (
      <g key={node.id} className={`box ${node.kind}`} data-node={node.id} data-label={node.label}>
        <title>{node.at ? `${node.label}\n${node.at.file}:${node.at.line}` : node.label}</title>
        <rect x={x} y={y} width={width} height={height} rx={6} />
        <rect className="bar" x={x} y={y} width={4} height={height} rx={2} />
        <a href={openOf(node.at)}>
          <text className="title" x={x + 12} y={y + 18}>
            {clip(node.label, kind ? chars - kind.length - 1 : chars)}
          </text>
        </a>
        <text className="kind" x={x + width - 10} y={y + 18} textAnchor="end">
          {kind}
        </text>
        {rows.map((row, idx) => (
          <a key={idx} href={openOf(row.at)}>
            <text x={x + 12} y={row.y + 4}>
              {clip(row.text, row.hint ? chars - row.hint.length - 1 : chars)}
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
