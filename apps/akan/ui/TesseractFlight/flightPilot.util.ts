import { FlightPlan, type Pose, reachUnits } from "./flightPlan.util";
import { Hypercube, quarterTurn } from "./hypercube.util";

interface Point {
  x: number;
  y: number;
  near: number;
}

export class FlightPilot {
  readonly #svg: SVGSVGElement;
  readonly #bodyEl: SVGGElement | null;
  readonly #labels: string[];
  readonly #plan = new FlightPlan();
  readonly #edgeEls: SVGLineElement[];
  readonly #haloEls: SVGLineElement[];
  readonly #glowEls: SVGLineElement[];
  readonly #heatEls: SVGGElement[];
  readonly #dotEls: SVGCircleElement[];
  readonly #labelEl: SVGTextElement | null;
  readonly #stepEl: SVGTSpanElement | null;
  readonly #nameEl: SVGTSpanElement | null;
  readonly #motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #resizeObserver = new ResizeObserver(() => {
    this.#plan.scan();
    this.#wake();
  });
  #frameId = 0;
  #lastTime = 0;
  #lastInput = 0;
  #startTime = 0;
  #drift = 0;
  #labelIdx = -1;

  constructor(svg: SVGSVGElement, labels: string[]) {
    this.#svg = svg;
    this.#labels = labels;
    this.#bodyEl = svg.querySelector<SVGGElement>("[data-role=body]");
    this.#edgeEls = [...svg.querySelectorAll<SVGLineElement>("[data-role=edge] line")];
    this.#haloEls = [...svg.querySelectorAll<SVGLineElement>("[data-role=halo] line")];
    this.#glowEls = [...svg.querySelectorAll<SVGLineElement>("[data-role=glow] line")];
    this.#heatEls = [...svg.querySelectorAll<SVGGElement>("[data-role=halo], [data-role=glow]")];
    this.#dotEls = [...svg.querySelectorAll<SVGCircleElement>("[data-role=dot] circle")];
    this.#labelEl = svg.querySelector<SVGTextElement>("[data-role=label]");
    this.#stepEl = svg.querySelector<SVGTSpanElement>("[data-role=step]");
    this.#nameEl = svg.querySelector<SVGTSpanElement>("[data-role=name]");
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
    this.#plan.scan();
    this.#startTime = performance.now();
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
    const pose = this.#plan.pose(vw, vh);
    if (!pose) return;
    const intro = Math.min(1, (now - this.#startTime) / 1800);
    if (!pose.phi) this.#drift += (elapsed / 1000) * (0.3 + 1.6 * (1 - intro) ** 2);
    this.#draw(pose, vw, vh, intro);
    this.#svg.toggleAttribute("data-live", true);
    if (pose.phi < 0.999 || intro < 1 || now - this.#lastInput < 320) this.#frameId = requestAnimationFrame(this.#tick);
    else this.#lastTime = 0;
  };

  #draw(pose: Pose, vw: number, vh: number, intro: number) {
    const [gap, margin] = vw < 640 ? [4, 5] : [7, 8];
    const { phi } = pose;
    const snap = Math.round(this.#drift / quarterTurn) * quarterTurn;
    const [xw, zw] = [this.#drift + (snap - this.#drift) * phi, phi * 0.4 * Math.sin((pose.scroll / vh) * 1.6)];
    const [yaw, pitch] = [0.62 * (1 - phi), -0.36 * (1 - phi)];
    const unit = pose.place.unit * (0.45 + 0.55 * (1 - (1 - intro) ** 3));
    const points = Hypercube.vertices.map((vertex): Point => {
      const turned = Hypercube.turn(vertex, pose.attitude, xw, zw);
      const loose = Hypercube.perspective(turned, yaw, pitch);
      const [x, y] = [pose.place.x + loose.x * unit, pose.place.y - loose.y * unit];
      if (!phi) return { x, y, near: loose.near };
      const framed = Hypercube.frame(turned, pose.box, gap, margin);
      return {
        x: x + (framed.x - x) * phi,
        y: y + (framed.y - y) * phi,
        near: loose.near + (framed.near - loose.near) * phi,
      };
    });
    const heat = this.#heat(pose);
    Hypercube.edges.forEach(([a, b], idx) => {
      const [from, to] = [points[a], points[b]];
      const near = (from.near + to.near) / 2;
      FlightPilot.#stretch(this.#edgeEls[idx], from, to);
      this.#edgeEls[idx].setAttribute("stroke-opacity", (0.12 + (0.6 - 0.18 * phi) * near - 0.04 * phi).toFixed(3));
      this.#edgeEls[idx].setAttribute("stroke-width", (0.5 + (0.9 - 0.35 * phi) * near).toFixed(2));
      if (!heat) return;
      FlightPilot.#stretch(this.#haloEls[idx], from, to);
      FlightPilot.#stretch(this.#glowEls[idx], from, to);
      this.#haloEls[idx].setAttribute("stroke-opacity", (heat[idx] * pose.halo).toFixed(3));
      this.#glowEls[idx].setAttribute("stroke-opacity", heat[idx].toFixed(3));
    });
    for (const group of this.#heatEls) group.setAttribute("display", heat ? "inline" : "none");
    points.forEach((point, idx) => {
      const dot = this.#dotEls[idx];
      dot.setAttribute("cx", point.x.toFixed(1));
      dot.setAttribute("cy", point.y.toFixed(1));
      dot.setAttribute("r", ((0.7 + 1.6 * point.near) * (1 - 0.4 * phi)).toFixed(2));
      dot.setAttribute("fill-opacity", (0.2 + 0.75 * point.near).toFixed(3));
    });
    this.#label(pose, unit);
    this.#bodyEl?.setAttribute("opacity", pose.place.alpha.toFixed(3));
  }

  #heat({ lit, cellEdges, cellWeight, glowWeight }: Pose) {
    if (!lit.length && glowWeight < 0.001) return null;
    const heat = new Float32Array(Hypercube.edges.length).fill(glowWeight * 0.5);
    const current = lit.findLastIndex((amount) => amount > 0.5);
    lit.forEach((amount, cellIdx) => {
      const strength = amount * cellWeight * (cellIdx === current ? 1 : 0.4);
      for (const edgeIdx of cellEdges[cellIdx]) heat[edgeIdx] = Math.max(heat[edgeIdx], strength);
    });
    return heat;
  }

  #label(pose: Pose, unit: number) {
    if (!this.#labelEl) return;
    const current = pose.lit.findLastIndex((amount) => amount > 0.5);
    const opacity = current < 0 ? 0 : pose.cellWeight;
    this.#labelEl.setAttribute("opacity", opacity.toFixed(3));
    if (!opacity) return;
    this.#labelEl.setAttribute("x", pose.place.x.toFixed(1));
    this.#labelEl.setAttribute("y", (pose.place.y + unit * reachUnits + 20).toFixed(1));
    if (current === this.#labelIdx) return;
    this.#labelIdx = current;
    const pad = (num: number) => String(num).padStart(2, "0");
    if (this.#stepEl) this.#stepEl.textContent = `${pad(current + 1)} / ${pad(this.#labels.length)}`;
    if (this.#nameEl) this.#nameEl.textContent = this.#labels[current] ?? "";
  }

  static #stretch(line: SVGLineElement, from: Point, to: Point) {
    line.setAttribute("x1", from.x.toFixed(1));
    line.setAttribute("y1", from.y.toFixed(1));
    line.setAttribute("x2", to.x.toFixed(1));
    line.setAttribute("y2", to.y.toFixed(1));
  }
}
