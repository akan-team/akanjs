import { AscentLabels } from "./ascentLabels.util";
import { AscentScript, type Scene } from "./ascentScript.util";
import { type Camera, Extrusion, type Projected, type Scales, type Vec4 } from "./extrusion.util";

const fullTurn = Math.PI * 2;
const quarterTurn = Math.PI / 2;
const restYaw = -0.58;
const restPitch = 0.36;

export class AscentPilot {
  readonly #svg: SVGSVGElement;
  readonly #bodyEl: SVGGElement | null;
  readonly #script = new AscentScript();
  readonly #labels: AscentLabels;
  readonly #baseAxisEls: SVGGElement[];
  readonly #accentAxisEls: SVGGElement[];
  readonly #baseEls: SVGLineElement[][];
  readonly #accentEls: SVGLineElement[][];
  readonly #ghostGroupEls: (SVGGElement | null)[];
  readonly #ghostEls: SVGLineElement[][];
  readonly #dotEls: SVGCircleElement[];
  readonly #motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #resizeObserver = new ResizeObserver(() => {
    this.#script.scan();
    this.#wake();
  });
  #frameId: number = 0;
  #lastTime: number = 0;
  #lastInput = 0;
  #startTime = 0;
  #lastScroll = 0;
  #xw = 0;
  #zw = 0;

  constructor(svg: SVGSVGElement) {
    this.#svg = svg;
    this.#bodyEl = svg.querySelector<SVGGElement>("[data-role=body]");
    const lines = (selector: string) => [...svg.querySelectorAll<SVGLineElement>(`${selector} line`)];
    const groups = (selector: string) => [...svg.querySelectorAll<SVGGElement>(selector)];
    this.#baseAxisEls = groups("[data-role=base] > g");
    this.#accentAxisEls = groups("[data-role=accent] > g");
    this.#baseEls = this.#baseAxisEls.map((group) => [...group.querySelectorAll("line")]);
    this.#accentEls = this.#accentAxisEls.map((group) => [...group.querySelectorAll("line")]);
    this.#ghostGroupEls = [1, 2, 3].map((axis) => svg.querySelector<SVGGElement>(`[data-role=ghost-${axis}]`));
    this.#ghostEls = [1, 2, 3].map((axis) => lines(`[data-role=ghost-${axis}]`));
    this.#dotEls = [...svg.querySelectorAll<SVGCircleElement>("[data-role=dot] circle")];
    this.#labels = new AscentLabels(svg);
  }

  start() {
    this.#motion.addEventListener("change", this.#onMotionChange);
    if (!this.#motion.matches) this.#run();
  }

  stop() {
    this.#motion.removeEventListener("change", this.#onMotionChange);
    this.#halt();
  }

  #onMotionChange = () => {
    if (this.#motion.matches) this.#halt();
    else this.#run();
  };

  #run() {
    this.#script.scan();
    this.#startTime = performance.now();
    this.#lastScroll = window.scrollY;
    window.addEventListener("scroll", this.#wake, { passive: true, capture: true });
    window.addEventListener("resize", this.#wake, { passive: true });
    this.#resizeObserver.observe(document.body);
    this.#wake();
  }

  #halt() {
    cancelAnimationFrame(this.#frameId);
    this.#frameId = 0;
    this.#lastTime = 0;
    window.removeEventListener("scroll", this.#wake, { capture: true });
    window.removeEventListener("resize", this.#wake);
    this.#resizeObserver.disconnect();
    this.#svg.removeAttribute("data-live");
  }

  #wake = () => {
    this.#lastInput = performance.now();
    if (!this.#frameId) this.#frameId = requestAnimationFrame(this.#tick);
  };

  #tick = (now: number) => {
    this.#frameId = 0;
    const elapsed = this.#lastTime ? Math.min(now - this.#lastTime, 64) : 16;
    this.#lastTime = now;
    const [vw, vh] = [window.innerWidth, window.innerHeight];
    const scene = this.#script.scene(vw, vh);
    if (!scene) return;
    const scrolled = window.scrollY - this.#lastScroll;
    this.#lastScroll = window.scrollY;
    this.#turn(scene.spin, elapsed, scrolled / vh);
    this.#bodyEl?.setAttribute("opacity", scene.alpha.toFixed(3));
    if (scene.alpha > 0.001) this.#draw(scene, now, vw, vh);
    this.#svg.toggleAttribute("data-live", true);
    const isFree = Extrusion.tilt(scene.dim) * (1 - scene.phi) > 0.001 || scene.spin > 0.001;
    const isMoving = scene.alpha > 0.001 && isFree;
    const isAnimating = isMoving || !this.#isSettled();
    if (isAnimating || now - this.#startTime < 3600 || now - this.#lastInput < 400)
      this.#frameId = requestAnimationFrame(this.#tick);
    else this.#lastTime = 0;
  };

  //* The spin only ever settles on whole turns: a quarter turn in XW swaps the x and w axes, so collapsing w there would collapse x instead.
  #turn(drive: number, elapsed: number, scrolled: number) {
    this.#xw += (elapsed * 0.00032 + scrolled * 1.8) * drive;
    this.#zw += (elapsed * 0.0002 + scrolled * 1.1) * drive;
    if (drive >= 1) return;
    const pull = (1 - drive) * Math.min(1, elapsed * 0.004);
    this.#xw += (Math.round(this.#xw / fullTurn) * fullTurn - this.#xw) * pull;
    this.#zw += (Math.round(this.#zw / fullTurn) * fullTurn - this.#zw) * pull;
  }

  #isSettled() {
    return [this.#xw, this.#zw].every((angle) => Math.abs(angle - Math.round(angle / fullTurn) * fullTurn) < 0.001);
  }

  #draw(scene: Scene, now: number, vw: number, vh: number) {
    const { dim, place, phi, attitude } = scene;
    const scales = Extrusion.scales(dim);
    const tilt = Extrusion.tilt(dim) * (1 - phi);
    const xw = this.#xw + (Math.round(this.#xw / quarterTurn) * quarterTurn - this.#xw) * phi;
    const zw = this.#zw + phi * 0.4 * Math.sin((window.scrollY / vh) * 1.6);
    const camera: Camera = {
      yaw: (restYaw + 0.09 * Math.sin(now * 0.00031)) * tilt,
      pitch: (restPitch + 0.035 * Math.sin(now * 0.00023)) * tilt,
      xw,
      zw,
      attitude,
    };
    const rest = Extrusion.center(dim, { yaw: restYaw * tilt, pitch: restPitch * tilt, xw: 0, zw: 0, attitude });
    const toScreen = (projected: Projected): Projected => ({
      x: place.x + (projected.x - rest.x) * place.unit,
      y: place.y - (projected.y - rest.y) * place.unit,
      near: 1 + (projected.near - 1) * tilt,
    });
    const project = (vertex: Vec4) => toScreen(Extrusion.project(vertex, camera));
    const [gap, margin] = vw < 640 ? [4, 5] : [7, 8];
    const points = Extrusion.vertices.map((vertex) => {
      const placed = Extrusion.place(vertex, scales);
      const loose = project(placed);
      if (phi <= 0) return loose;
      const framed = Extrusion.frame(Extrusion.turn(placed, attitude, xw, zw), scene.box, gap, margin);
      return {
        x: loose.x + (framed.x - loose.x) * phi,
        y: loose.y + (framed.y - loose.y) * phi,
        near: loose.near + (framed.near - loose.near) * phi,
      };
    });
    const size = Math.min(1.4, Math.max(0.5, place.unit / 100));
    this.#drawEdges(points, scales, dim, Math.max(scene.spin, phi), size, phi);
    this.#drawGhosts(project, scales, dim, size);
    points.forEach((point, idx) => {
      const dot = this.#dotEls[idx];
      const presence = Extrusion.presence(idx, scales);
      dot.setAttribute("cx", point.x.toFixed(1));
      dot.setAttribute("cy", point.y.toFixed(1));
      dot.setAttribute("r", (presence * (1.2 + 1.8 * point.near) * size).toFixed(2));
      dot.setAttribute("fill-opacity", (0.45 + 0.55 * point.near).toFixed(3));
    });
    this.#labels.draw(scene, points, project, scales);
  }

  #drawEdges(points: Projected[], scales: Scales, dim: number, unified: number, size: number, phi: number) {
    Extrusion.axisEdges.forEach((edges, axis) => {
      const accent = Math.max(unified, AscentPilot.#unit(1 - (dim - axis - 1) * 1.25));
      this.#baseAxisEls[axis].setAttribute("opacity", (1 - accent).toFixed(3));
      this.#accentAxisEls[axis].setAttribute("opacity", accent.toFixed(3));
      edges.forEach(([from, to], idx) => {
        const presence = Extrusion.presence(to, scales);
        const [base, bright] = [this.#baseEls[axis][idx], this.#accentEls[axis][idx]];
        const isShown = presence > 0.001;
        base.setAttribute("display", isShown ? "inline" : "none");
        bright.setAttribute("display", isShown ? "inline" : "none");
        if (!isShown) return;
        const near = (points[from].near + points[to].near) / 2;
        for (const line of [base, bright]) AscentPilot.#stretch(line, points[from], points[to]);
        const fade = presence * (1 - 0.45 * phi);
        base.setAttribute("stroke-opacity", (fade * (0.2 + 0.55 * near)).toFixed(3));
        bright.setAttribute("stroke-opacity", (fade * (0.3 + 0.7 * near)).toFixed(3));
        const width = ((0.9 + 0.9 * near) * size).toFixed(2);
        base.setAttribute("stroke-width", width);
        bright.setAttribute("stroke-width", width);
      });
    });
  }

  #drawGhosts(project: (vertex: Vec4) => Projected, scales: Scales, dim: number, size: number) {
    for (const axis of [1, 2, 3]) {
      const group = this.#ghostGroupEls[axis - 1];
      const weight = AscentPilot.#ghostWeight(axis, dim, scales);
      group?.setAttribute("display", weight > 0.001 ? "inline" : "none");
      if (!group || weight <= 0.001) continue;
      group.setAttribute("opacity", weight.toFixed(3));
      group.setAttribute("stroke-width", (0.9 * size).toFixed(2));
      const edges = Extrusion.ghostEdges(axis);
      const copies = [0, this.#labels.layerCount, this.#labels.platformCount, Extrusion.sweepCopies][axis];
      let lineIdx = 0;
      for (let copy = 1; copy < copies - 1; copy += 1) {
        const offset = -1 + (2 * copy) / (copies - 1);
        for (const [from, to] of edges) {
          const line = this.#ghostEls[axis - 1][lineIdx];
          lineIdx += 1;
          if (!line) continue;
          const [a, b] = [Extrusion.vertices[from], Extrusion.vertices[to]];
          AscentPilot.#stretch(
            line,
            project(Extrusion.ghost(a, axis, offset, scales)),
            project(Extrusion.ghost(b, axis, offset, scales)),
          );
        }
      }
    }
  }

  static #ghostWeight(axis: number, dim: number, scales: Scales) {
    if (axis === 3) return Math.sin(Math.PI * scales[3]) * 0.9;
    return AscentPilot.#unit((dim - axis) * 5) * AscentPilot.#unit(1 - (dim - axis - 1) * 3);
  }

  static #stretch(line: SVGLineElement, from: Projected, to: Projected) {
    line.setAttribute("x1", from.x.toFixed(1));
    line.setAttribute("y1", from.y.toFixed(1));
    line.setAttribute("x2", to.x.toFixed(1));
    line.setAttribute("y2", to.y.toFixed(1));
  }

  static #unit(value: number) {
    return Math.min(1, Math.max(0, value));
  }
}
