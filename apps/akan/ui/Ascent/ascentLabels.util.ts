import { type LabelSet, labelSets, type Scene } from "./ascentScript.util";
import { Extrusion, type Projected, type Scales, type Vec4 } from "./extrusion.util";

type LabelEls = { [key in LabelSet]: SVGTextElement[] };

export class AscentLabels {
  readonly #groupEls: { [key in LabelSet]: SVGGElement | null };
  readonly #textEls: LabelEls;
  readonly #hudEl: SVGTextElement | null;
  #hudText = "";

  constructor(svg: SVGSVGElement) {
    const [line, layers, platforms, audiences, surfaces] = labelSets.map((set) =>
      svg.querySelector<SVGGElement>(`[data-set=${set}]`),
    );
    this.#groupEls = { line, layers, platforms, audiences, surfaces };
    const texts = (group: SVGGElement | null) => [...(group?.querySelectorAll("text") ?? [])];
    this.#textEls = {
      line: texts(line),
      layers: texts(layers),
      platforms: texts(platforms),
      audiences: texts(audiences),
      surfaces: texts(surfaces),
    };
    this.#hudEl = svg.querySelector<SVGTextElement>("[data-role=hud]");
  }

  get layerCount() {
    return this.#textEls.layers.length;
  }

  get platformCount() {
    return this.#textEls.platforms.length;
  }

  draw(scene: Scene, points: Projected[], project: (vertex: Vec4) => Projected, scales: Scales) {
    const weights = {
      line: scene.show.line * Extrusion.presence(1, scales),
      layers: scene.show.layers * AscentLabels.#unit((scales[1] - 0.35) * 2),
      platforms: scene.show.platforms * AscentLabels.#unit((scales[2] - 0.35) * 2),
      audiences: scene.show.audiences * AscentLabels.#unit((scales[3] - 0.5) * 2),
      surfaces: scene.show.surfaces,
    };
    for (const set of labelSets) {
      this.#groupEls[set]?.setAttribute("display", weights[set] > 0.001 ? "inline" : "none");
      this.#groupEls[set]?.setAttribute("opacity", weights[set].toFixed(3));
    }
    if (weights.line > 0.001) this.#drawLine(points);
    if (weights.layers > 0.001) this.#drawLayers(project, scales);
    if (weights.platforms > 0.001) this.#drawPlatforms(project, scales);
    if (weights.audiences > 0.001) this.#drawAudiences(points);
    if (weights.surfaces > 0.001) this.#drawSurfaces(points);
    this.#drawReadout(scene, points, scales);
  }

  #drawLine([start, end]: Projected[]) {
    AscentLabels.#spot(this.#textEls.line[0], (start.x + end.x) / 2, Math.min(start.y, end.y) - 18, 1);
  }

  #drawLayers(project: (vertex: Vec4) => Projected, scales: Scales) {
    this.#textEls.layers.forEach((label, copy, all) => {
      const offset = -1 + (2 * copy) / (all.length - 1);
      const anchor = project(Extrusion.ghost(Extrusion.vertices[0], 1, offset, scales));
      AscentLabels.#spot(label, anchor.x + 8, anchor.y - 7, 1);
    });
  }

  //? Alternate copies are labelled on opposite corners; on a phone the receding edge is too short for six names in a row.
  #drawPlatforms(project: (vertex: Vec4) => Projected, scales: Scales) {
    this.#textEls.platforms.forEach((label, copy, all) => {
      const offset = 1 - (2 * copy) / (all.length - 1);
      const isLower = copy % 2 === 1;
      const anchor = project(Extrusion.ghost(Extrusion.vertices[isLower ? 1 : 2], 2, offset, scales));
      const [dx, dy] = isLower ? [8, 14] : [-8, -6];
      label.setAttribute("text-anchor", isLower ? "start" : "end");
      AscentLabels.#spot(label, anchor.x + dx, anchor.y + dy, 0.35 + 0.65 * anchor.near);
    });
  }

  #drawAudiences(points: Projected[]) {
    this.#textEls.audiences.forEach((label, cube) => {
      const top = points.slice(cube * 8, cube * 8 + 8).reduce((best, point) => (point.y < best.y ? point : best));
      AscentLabels.#spot(label, top.x, top.y - 14, 1);
    });
  }

  #drawSurfaces(points: Projected[]) {
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    this.#textEls.surfaces.forEach((label, idx) => {
      const point = points[idx];
      const [dx, dy] = [point.x - centerX, point.y - centerY];
      const length = Math.hypot(dx, dy) || 1;
      label.setAttribute("text-anchor", dx < -4 ? "end" : dx > 4 ? "start" : "middle");
      AscentLabels.#spot(label, point.x + (dx / length) * 12, point.y + (dy / length) * 12 + 4, 0.2 + 0.8 * point.near);
    });
  }

  #drawReadout(scene: Scene, points: Projected[], scales: Scales) {
    const axes = scales.filter((scale) => scale > 0.001).length;
    const bottom = Math.max(
      ...points.map((point, idx) => (Extrusion.presence(idx, scales) > 0.001 ? point.y : -Infinity)),
    );
    this.#hudEl?.setAttribute("display", scene.stage > 0.001 ? "inline" : "none");
    if (this.#hudEl && scene.stage > 0.001) {
      const hud = `${scene.dim.toFixed(2)}D  ·  V ${2 ** axes}  ·  E ${axes * 2 ** Math.max(0, axes - 1)}`;
      AscentLabels.#spot(this.#hudEl, scene.place.x, bottom + 40, scene.stage);
      if (hud !== this.#hudText) this.#hudEl.textContent = hud;
      this.#hudText = hud;
    }
  }

  static #spot(el: SVGTextElement | undefined, x: number, y: number, opacity: number) {
    if (!el) return;
    el.setAttribute("x", x.toFixed(1));
    el.setAttribute("y", y.toFixed(1));
    el.setAttribute("opacity", opacity.toFixed(3));
  }

  static #unit(value: number) {
    return Math.min(1, Math.max(0, value));
  }
}
