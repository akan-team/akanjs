interface VideoSource {
  src: string;
  compactSrc?: string;
  poster?: string;
}

//* One video holds a decoder at a time: two 1080p decoders pushed a 4 GB iPhone's GPU process past its memory limit.
export class VideoDirector {
  static readonly compactWidth = 1280;
  static #shared: VideoDirector | null = null;

  static attach(video: HTMLVideoElement, source: VideoSource) {
    const director = VideoDirector.#shared ?? new VideoDirector();
    VideoDirector.#shared = director;
    director.#register(video, source);
    return () => {
      director.#unregister(video);
      if (director.#sources.size || VideoDirector.#shared !== director) return;
      VideoDirector.#shared = null;
      director.#observer.disconnect();
    };
  }

  static #release(video: HTMLVideoElement) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  readonly #sources = new Map<HTMLVideoElement, VideoSource>();
  readonly #ratios = new Map<HTMLVideoElement, number>();
  readonly #observer: IntersectionObserver;
  #active: HTMLVideoElement | null = null;

  constructor() {
    this.#observer = new IntersectionObserver(this.#onIntersect, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  }

  #register(video: HTMLVideoElement, source: VideoSource) {
    this.#sources.set(video, source);
    if (document.readyState === "complete") this.#observe(video);
    else window.addEventListener("load", () => this.#observe(video), { once: true });
  }

  #observe(video: HTMLVideoElement) {
    const source = this.#sources.get(video);
    if (!source) return;
    // A poster attribute downloads as soon as it is parsed, preload="none" or not.
    if (source.poster) video.poster = source.poster;
    this.#observer.observe(video);
  }

  #unregister(video: HTMLVideoElement) {
    this.#observer.unobserve(video);
    this.#sources.delete(video);
    this.#ratios.delete(video);
    if (this.#active !== video) return;
    VideoDirector.#release(video);
    this.#active = null;
    this.#cast();
  }

  #onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      if (!(entry.target instanceof HTMLVideoElement)) continue;
      if (entry.isIntersecting) this.#ratios.set(entry.target, entry.intersectionRatio);
      else this.#ratios.delete(entry.target);
    }
    this.#cast();
  };

  #cast() {
    let next = this.#active && this.#ratios.has(this.#active) ? this.#active : null;
    let best = next ? (this.#ratios.get(next) ?? 0) : -1;
    for (const [video, ratio] of this.#ratios) {
      if (ratio <= best) continue;
      next = video;
      best = ratio;
    }
    if (next === this.#active) return;
    if (this.#active) VideoDirector.#release(this.#active);
    this.#active = next;
    if (next) this.#play(next);
  }

  #play(video: HTMLVideoElement) {
    const source = this.#sources.get(video);
    if (!source) return;
    const isCompact = video.clientWidth * window.devicePixelRatio <= VideoDirector.compactWidth;
    const src = isCompact && source.compactSrc ? source.compactSrc : source.src;
    if (video.getAttribute("src") !== src) video.src = src;
    // play() rejects under iOS Low Power Mode or when a pause() lands first; the video just stays still.
    video.play().catch(() => undefined);
  }
}
