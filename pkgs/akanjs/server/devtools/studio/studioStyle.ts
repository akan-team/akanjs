export const studioStyle = `
:root { color-scheme: light dark; --bg: #f6f6f7; --fg: #1d1d1f; --muted: #6e6e73; --panel: #ffffff; --line: #c9c9ce;
  --model: #2563eb; --scalar: #0d9488; --enum: #9333ea; --query: #64748b; --slice: #ea580c; --endpoint: #dc2626;
  --method: #0891b2; --action: #16a34a; --component: #ca8a04; --added: #16a34a; --removed: #dc2626; --changed: #d97706; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #111113; --fg: #ececf1; --muted: #9a9aa3; --panel: #1c1c1f; --line: #3d3d44; }
}
body { margin: 0; font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); }
header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
header nav { display: flex; gap: 4px; }
header form { display: flex; gap: 8px; } header form[hidden] { display: none; }
header input[name="since"] { width: 22ch; }
header nav.end { margin-left: auto; }
header a { color: inherit; text-decoration: none; padding: 4px 8px; border-radius: 6px; }
header a[aria-current] { background: var(--line); }
header select, header input { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line);
  border-radius: 6px; padding: 4px 8px; }
header .actions { order: 1; flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
header button { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  padding: 3px 10px; cursor: pointer; }
header button:hover { border-color: var(--muted); }
.muted { color: var(--muted); }
.empty { padding: 48px; color: var(--muted); }
.unmapped { padding: 0 24px 24px; }
.unmapped h2 { font-size: 13px; color: var(--muted); }
.unmapped ul { margin: 0; padding-left: 18px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.unmapped a { color: inherit; }
.unmapped li.added { color: var(--added); } .unmapped li.changed { color: var(--changed); } .unmapped li.removed { color: var(--removed); }
main { overflow: auto; }
svg { display: block; }
svg text { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--fg); }
svg a { cursor: pointer; }
svg a:hover text { text-decoration: underline; }
.column { fill: var(--muted); font-weight: 600; letter-spacing: 0.04em; }
.box { cursor: default; }
.box rect { fill: var(--panel); stroke: var(--line); }
.box rect.bar { fill: currentColor; stroke: none; }
.box .title { font-weight: 600; }
.box .kind, .box .hint { fill: var(--muted); }
.box.model { color: var(--model); } .box.scalar { color: var(--scalar); } .box.enum { color: var(--enum); }
.box.query { color: var(--query); } .box.slice { color: var(--slice); } .box.endpoint { color: var(--endpoint); }
.box.method { color: var(--method); } .box.action { color: var(--action); } .box.component { color: var(--component); }
.box.facet { color: var(--model); } .box.package { color: var(--method); }
.link { fill: none; stroke: var(--line); stroke-width: 1.25; }
.link.fetches { stroke-dasharray: 5 3; }
.link.uses { stroke-dasharray: 2 3; }
.link.lazy { stroke-dasharray: 6 3; }
.link.type { stroke-dasharray: 2 4; opacity: 0.5; }
.channels { padding: 0 24px 24px; }
.channels h2 { font-size: 13px; margin: 20px 0 6px; }
.channels table { border-collapse: collapse; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.channels th { text-align: left; color: var(--muted); font-weight: 600; }
.channels th, .channels td { padding: 3px 16px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.channels a { color: inherit; }
.arrow { fill: var(--muted); }
.box.added rect:not(.bar) { stroke: var(--added); stroke-width: 2; }
.box.changed rect:not(.bar) { stroke: var(--changed); stroke-width: 2; }
.box.removed rect:not(.bar) { stroke: var(--removed); stroke-width: 2; stroke-dasharray: 4 3; }
.box.removed .title { text-decoration: line-through; }
.box.context { opacity: 0.55; }
.box text.added { fill: var(--added); } .box text.changed { fill: var(--changed); } .box text.removed { fill: var(--removed); }
.link.added { stroke: var(--added); }
.link.removed { stroke: var(--removed); stroke-dasharray: 4 3; }
svg.focused .box:not(.hot), svg.focused .link:not(.hot), .box.muted { opacity: 0.16; }
.link.hot { stroke: var(--fg); stroke-width: 2; }
`;
