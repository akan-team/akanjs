type FriendName = "planet" | "rocket" | "moon" | "cloud" | "comet";

interface Point {
  x: number;
  y: number;
}

interface Rig {
  el: HTMLElement;
  name: FriendName;
  eyes: HTMLElement[];
  visible: boolean;
  idle: Point;
  nextSaccade: number;
  lastNear: number;
  boops: number[];
}

export class FriendDirector {
  static readonly boopMs = { planet: 1150, rocket: 1750, moon: 2050, cloud: 1450, comet: 1350 } as const;
  static readonly blinkSeconds = { planet: 5.2, rocket: 3.4, moon: 7.2, cloud: 6.4, comet: 4.2 } as const;
  static readonly cometFacing = -38;
  static readonly startleMs = 1000;
  static readonly dozeAfterMs = 5000;
  static readonly dizzyMs = 1700;
  static readonly tapMs = 2600;
  static #shared: FriendDirector | null = null;

  static attach(el: HTMLElement) {
    const director = FriendDirector.#shared ?? new FriendDirector();
    if (!FriendDirector.#shared) {
      FriendDirector.#shared = director;
      director.#start();
    }
    director.#register(el);
    return () => {
      director.#unregister(el);
      if (director.#rigs.size || FriendDirector.#shared !== director) return;
      FriendDirector.#shared = null;
      director.#stop();
    };
  }

  readonly #rigs = new Map<HTMLElement, Rig>();
  readonly #timers = new Set<number>();
  readonly #abort = new AbortController();
  #pointer: Point | null = null;
  #tap: (Point & { until: number }) | null = null;
  #frame: number | null = null;
  #interval = 0;
  #visibility: IntersectionObserver | null = null;

  #start() {
    const { signal } = this.#abort;
    this.#visibility = new IntersectionObserver(this.#onIntersect, { rootMargin: "160px" });
    window.addEventListener("pointermove", this.#onMove, { passive: true, signal });
    window.addEventListener("pointerdown", this.#onDown, { passive: true, capture: true, signal });
    document.addEventListener("mouseout", this.#onOut, { passive: true, signal });
    window.addEventListener("blur", this.#onBlur, { signal });
    window.addEventListener("scroll", this.#queueFrame, { passive: true, capture: true, signal });
    window.addEventListener("resize", this.#queueFrame, { passive: true, signal });
    this.#interval = window.setInterval(this.#onIdle, 200);
  }

  #stop() {
    this.#abort.abort();
    this.#visibility?.disconnect();
    window.clearInterval(this.#interval);
    if (this.#frame !== null) window.cancelAnimationFrame(this.#frame);
    for (const timer of this.#timers) window.clearTimeout(timer);
    this.#timers.clear();
    this.#rigs.clear();
  }

  static #isName(name: string | undefined): name is FriendName {
    return !!name && name in FriendDirector.boopMs;
  }

  static #center(box: DOMRect): Point {
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  //? 1 − e^(−d/k) saturates like a loose googly pupil: a third of the way at 0.16 widths, at the rim past ~1.2.
  static #lookAt(from: Point, to: Point, width: number): Point {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return { x: 0, y: 0 };
    const reach = 1 - Math.exp(-dist / (width * 0.4));
    return { x: (dx / dist) * reach, y: (dy / dist) * reach };
  }

  static #aim(dx: number, dy: number) {
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const diff = ((angle - FriendDirector.cometFacing + 540) % 360) - 180;
    return Math.max(-16, Math.min(16, diff * 0.35));
  }

  static #write(el: HTMLElement, name: string, value: number) {
    const text = String(Math.round(value * 100) / 100 || 0);
    if (el.style.getPropertyValue(name) !== text) el.style.setProperty(name, text);
  }

  static #flag(el: HTMLElement, name: string, on: boolean) {
    if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
  }

  #later(run: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      this.#timers.delete(timer);
      run();
    }, ms);
    this.#timers.add(timer);
  }

  #register(el: HTMLElement) {
    const name = el.dataset.friend;
    if (!FriendDirector.#isName(name)) return;
    const period = FriendDirector.blinkSeconds[name] * (0.75 + Math.random() * 0.6);
    el.style.setProperty("--blink-period", `${period.toFixed(2)}s`);
    el.style.setProperty("--blink-delay", `${(-Math.random() * period).toFixed(2)}s`);
    if (Math.random() < 0.35) el.style.setProperty("--blink-name", "friend-blink-twice");
    this.#rigs.set(el, {
      el,
      name,
      eyes: [...el.querySelectorAll<HTMLElement>("[data-friend-eye]")],
      visible: false,
      idle: { x: 0, y: 0 },
      nextSaccade: 0,
      lastNear: Number.NEGATIVE_INFINITY,
      boops: [],
    });
    this.#visibility?.observe(el);
  }

  #unregister(el: HTMLElement) {
    this.#visibility?.unobserve(el);
    this.#rigs.delete(el);
  }

  #onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const rig = this.#rigs.get(entry.target as HTMLElement);
      if (rig) rig.visible = entry.isIntersecting;
    }
    this.#queueFrame();
  };

  #onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.#pointer = { x: event.clientX, y: event.clientY };
    this.#queueFrame();
  };

  #onDown = (event: PointerEvent) => {
    const now = performance.now();
    if (event.pointerType === "touch") {
      this.#tap = { x: event.clientX, y: event.clientY, until: now + FriendDirector.tapMs };
      this.#queueFrame();
    }
    if (!(event.target instanceof Element)) return;
    const el = event.target.closest(".friend-hit")?.closest<HTMLElement>("[data-friend]");
    const rig = el ? this.#rigs.get(el) : undefined;
    if (rig) this.#boop(rig, now);
  };

  #onOut = (event: MouseEvent) => {
    if (event.relatedTarget) return;
    this.#pointer = null;
    this.#queueFrame();
  };

  #onBlur = () => {
    this.#pointer = null;
    this.#queueFrame();
  };

  #queueFrame = () => {
    this.#frame ??= window.requestAnimationFrame(this.#tick);
  };

  #tick = () => {
    this.#frame = null;
    if (document.hidden) return;
    const now = performance.now();
    if (this.#tap && this.#tap.until < now) this.#tap = null;
    const target = this.#pointer ?? this.#tap;
    const measured = [...this.#rigs.values()]
      .filter((rig) => rig.visible && rig.el.isConnected)
      .map((rig) => ({
        rig,
        box: rig.el.getBoundingClientRect(),
        eyes: rig.eyes.map((eye) => eye.getBoundingClientRect()),
      }))
      .filter(({ box }) => box.width > 0);
    for (const { rig, box, eyes } of measured) this.#follow(rig, box, eyes, target, now);
  };

  #follow(rig: Rig, box: DOMRect, eyes: DOMRect[], target: Point | null, now: number) {
    if (!target) {
      for (const eye of rig.eyes) {
        FriendDirector.#write(eye, "--look-x", rig.idle.x);
        FriendDirector.#write(eye, "--look-y", rig.idle.y);
      }
      FriendDirector.#write(rig.el, "--lean-x", 0);
      FriendDirector.#write(rig.el, "--lean-y", 0);
      FriendDirector.#write(rig.el, "--aim", 0);
      FriendDirector.#flag(rig.el, "data-near", false);
      return;
    }
    rig.eyes.forEach((eye, idx) => {
      const look = FriendDirector.#lookAt(FriendDirector.#center(eyes[idx]), target, box.width);
      FriendDirector.#write(eye, "--look-x", look.x);
      FriendDirector.#write(eye, "--look-y", look.y);
    });
    const center = FriendDirector.#center(box);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const dist = Math.hypot(dx, dy) || 1;
    const falloff = Math.max(0, 1 - dist / (box.width * 6));
    FriendDirector.#write(rig.el, "--lean-x", (dx / dist) * falloff);
    FriendDirector.#write(rig.el, "--lean-y", (dy / dist) * falloff);
    if (rig.name === "comet") FriendDirector.#write(rig.el, "--aim", FriendDirector.#aim(dx, dy) * falloff);
    const isNear = dist < Math.max(box.width * 1.35, 80);
    FriendDirector.#flag(rig.el, "data-near", isNear);
    if (!isNear) return;
    rig.lastNear = now;
    if (rig.name === "moon" && !rig.el.hasAttribute("data-awake")) this.#wake(rig, now);
  }

  #wake(rig: Rig, now: number) {
    rig.lastNear = now;
    rig.el.setAttribute("data-awake", "");
    rig.el.setAttribute("data-startle", "");
    this.#later(() => rig.el.removeAttribute("data-startle"), FriendDirector.startleMs);
  }

  #boop(rig: Rig, now: number) {
    rig.boops = [...rig.boops.filter((at) => now - at < 2000), now];
    if (rig.boops.length >= 3) {
      rig.boops = [];
      rig.el.setAttribute("data-dizzy", "");
      this.#later(() => rig.el.removeAttribute("data-dizzy"), FriendDirector.dizzyMs);
    }
    if (rig.name === "moon" && !rig.el.hasAttribute("data-awake")) {
      this.#wake(rig, now);
      return;
    }
    if (rig.el.hasAttribute("data-boop") || rig.el.hasAttribute("data-startle")) return;
    rig.el.setAttribute("data-boop", "");
    this.#later(() => rig.el.removeAttribute("data-boop"), FriendDirector.boopMs[rig.name]);
  }

  #onIdle = () => {
    if (document.hidden) return;
    const now = performance.now();
    const target = this.#pointer ?? this.#tap;
    let isDirty = !!target;
    for (const rig of this.#rigs.values()) {
      if (rig.name === "moon" && this.#isDozing(rig, now)) rig.el.removeAttribute("data-awake");
      if (target || !rig.visible || now < rig.nextSaccade) continue;
      rig.idle = this.#wander(rig);
      rig.nextSaccade = now + 700 + Math.random() * 2600;
      isDirty = true;
    }
    if (isDirty) this.#queueFrame();
  };

  #isDozing(rig: Rig, now: number) {
    return (
      rig.el.hasAttribute("data-awake") &&
      !rig.el.hasAttribute("data-boop") &&
      !rig.el.matches(":hover") &&
      now - rig.lastNear > FriendDirector.dozeAfterMs
    );
  }

  #wander(rig: Rig): Point {
    const roll = Math.random();
    if (roll < 0.15) return { x: 0, y: 0 };
    if (roll < 0.4) {
      const neighbor = this.#neighbor(rig);
      if (neighbor) return neighbor;
    }
    const angle = Math.random() * Math.PI * 2;
    const reach = 0.35 + Math.random() * 0.6;
    const lift = rig.name === "rocket" ? -0.35 : 0;
    return { x: Math.cos(angle) * reach, y: Math.max(-1, Math.min(1, Math.sin(angle) * reach * 0.8 + lift)) };
  }

  #neighbor(rig: Rig): Point | null {
    const others = [...this.#rigs.values()].filter((other) => other !== rig && other.visible);
    const other = others[Math.floor(Math.random() * others.length)];
    if (!other) return null;
    const from = rig.el.getBoundingClientRect();
    return FriendDirector.#lookAt(
      FriendDirector.#center(from),
      FriendDirector.#center(other.el.getBoundingClientRect()),
      from.width,
    );
  }
}
