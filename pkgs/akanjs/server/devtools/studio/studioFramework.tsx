import type { AkanGraphLocation, FrameworkChannel, FrameworkMap, FrameworkSite } from "akanjs/common";
import { type StudioFacetBox, StudioFrameworkLayout } from "./studioFrameworkLayout";

type OpenOf = (at: AkanGraphLocation | null) => string | undefined;

const charWidth = 7.3;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);

export class StudioFramework {
  static summary(map: FrameworkMap): string {
    return `${map.facets.length} facets · ${map.imports.length} imports · ${map.channels.length} channels`;
  }

  static render(map: FrameworkMap, openOf: OpenOf) {
    const scene = StudioFrameworkLayout.of(map);
    return (
      <>
        <svg data-studio="" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="arrow" />
            </marker>
          </defs>
          {scene.columns.map((column) => (
            <text key={column.x} className="column" x={column.x} y={24}>
              {column.label}
            </text>
          ))}
          <g>
            {scene.links.map(({ link, kind, path }) => (
              <path
                key={`${link.from}>${link.to}`}
                d={path}
                className={`link ${kind}`}
                data-from={link.from}
                data-to={link.to}
                markerEnd="url(#arrow)"
              >
                <title>{`${link.from} → ${link.to}: ${link.value} value, ${link.dynamic} lazy, ${link.type} type-only`}</title>
              </path>
            ))}
          </g>
          <g>{scene.boxes.map((box) => StudioFramework.#box(box, openOf))}</g>
        </svg>
        {map.missing.length ? <p className="empty">{`Channels not found: ${map.missing.join("; ")}`}</p> : null}
        {map.cycles.length ? (
          <p className="empty">{`Facets that load values from each other: ${map.cycles.map((cycle) => cycle.join(" ⇄ ")).join("; ")}`}</p>
        ) : null}
        <section className="channels">
          {map.channels.map((channel) => StudioFramework.#channel(channel, openOf))}
        </section>
      </>
    );
  }

  static #box({ facet, x, y, width, height, rows }: StudioFacetBox, openOf: OpenOf) {
    const kind = `${facet.files} files`;
    const chars = Math.floor((width - 24) / charWidth);
    return (
      <g
        key={facet.id}
        className={facet.packageName === "akanjs" ? "box facet" : "box package"}
        data-node={facet.id}
        data-label={facet.name}
      >
        <title>{`${facet.id}\n${facet.classes.length} classes`}</title>
        <rect x={x} y={y} width={width} height={height} rx={6} />
        <rect className="bar" x={x} y={y} width={4} height={height} rx={2} />
        <text className="title" x={x + 12} y={y + 18}>
          {clip(facet.name, chars - kind.length - 1)}
        </text>
        <text className="kind" x={x + width - 10} y={y + 18} textAnchor="end">
          {kind}
        </text>
        {rows.map((row) => (
          <a key={row.text} href={openOf(row.at)}>
            <text x={x + 12} y={row.y + 4}>
              {clip(row.text, chars - row.hint.length - 1)}
            </text>
            <text className="hint" x={x + width - 10} y={row.y + 4} textAnchor="end">
              {row.hint}
            </text>
          </a>
        ))}
      </g>
    );
  }

  static #channel(channel: FrameworkChannel, openOf: OpenOf) {
    return (
      <section key={channel.name}>
        <h2>
          <a href={openOf(channel.at)}>{channel.name}</a> <span className="muted">{channel.label}</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Message</th>
              <th>Sent by</th>
              <th>Handled by</th>
            </tr>
          </thead>
          <tbody>
            {channel.messages.map((message) => (
              <tr key={message.type}>
                <td>
                  <a href={openOf(message.at)}>{message.type}</a>
                </td>
                <td>{StudioFramework.#sites(message.senders, openOf)}</td>
                <td>{StudioFramework.#sites(message.handlers, openOf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  static #sites(sites: FrameworkSite[], openOf: OpenOf) {
    if (!sites.length) return <span className="muted">—</span>;
    return sites.map((site, idx) => (
      <span key={site.owner}>
        {idx ? ", " : null}
        <a href={openOf(site.at)}>{site.owner}</a>
        {site.count > 1 ? <span className="muted">{` ×${site.count}`}</span> : null}
      </span>
    ));
  }
}
