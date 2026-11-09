import type { FrameworkFacet, FrameworkImport, FrameworkMap } from "akanjs/common";
import type { StudioColumn, StudioRow } from "./studioLayout";

export type StudioFacetLinkKind = "value" | "lazy" | "type";

export interface StudioFacetBox {
  facet: FrameworkFacet;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: StudioRow[];
}

export interface StudioFacetLink {
  link: FrameworkImport;
  kind: StudioFacetLinkKind;
  path: string;
}

export interface StudioFrameworkScene {
  boxes: StudioFacetBox[];
  links: StudioFacetLink[];
  columns: StudioColumn[];
  width: number;
  height: number;
}

const boxWidth = 248;
const columnGap = 96;
const boxGap = 16;
const headerHeight = 28;
const rowHeight = 18;
const padding = 24;
const columnTop = 40;
const shownClasses = 6;

export class StudioFrameworkLayout {
  static of(map: FrameworkMap): StudioFrameworkScene {
    const layers = [...new Set(map.facets.map(({ layer }) => layer))].sort((a, b) => b - a);
    const boxes: StudioFacetBox[] = [];
    const columns: StudioColumn[] = [];
    let height = 0;
    layers.forEach((layer, idx) => {
      const x = padding + idx * (boxWidth + columnGap);
      columns.push({ label: `Layer ${layer}`, x });
      let y = columnTop;
      for (const facet of map.facets.filter((candidate) => candidate.layer === layer)) {
        const classes = facet.classes.slice(0, shownClasses);
        const boxHeight = headerHeight + classes.length * rowHeight + (classes.length ? 6 : 0);
        const rows = classes.map((cls, rowIdx) => ({
          text: cls.name,
          hint: String(cls.members),
          y: y + headerHeight + rowIdx * rowHeight + rowHeight / 2,
          at: cls.at,
        }));
        boxes.push({ facet, x, y, width: boxWidth, height: boxHeight, rows });
        y += boxHeight + boxGap;
        height = Math.max(height, y);
      }
    });
    const boxOf = new Map(boxes.map((box) => [box.facet.id, box]));
    const links = map.imports.flatMap((link) => {
      const from = boxOf.get(link.from);
      const to = boxOf.get(link.to);
      if (!from || !to) return [];
      const kind: StudioFacetLinkKind = link.value ? "value" : link.dynamic ? "lazy" : "type";
      return [{ link, kind, path: StudioFrameworkLayout.#path(from, to) }];
    });
    return {
      boxes,
      links,
      columns,
      width: padding * 2 + layers.length * boxWidth + Math.max(0, layers.length - 1) * columnGap,
      height: height + padding,
    };
  }

  static #path(from: StudioFacetBox, to: StudioFacetBox): string {
    const y1 = from.y + headerHeight / 2;
    const y2 = to.y + headerHeight / 2;
    const x1 = from.x + from.width;
    if (to.x > x1) {
      const bend = Math.max(40, (to.x - x1) / 2);
      return `M${x1},${y1} C${x1 + bend},${y1} ${to.x - bend},${y2} ${to.x},${y2}`;
    }
    const x2 = to.x + to.width;
    const loop = Math.max(x1, x2) + 48;
    return `M${x1},${y1} C${loop},${y1} ${loop},${y2} ${x2},${y2}`;
  }
}
