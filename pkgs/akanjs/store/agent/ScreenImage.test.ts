import "../../test/registerDom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ScreenImage } from "./ScreenImage";

const render = (html: string) => {
  document.body.innerHTML = html;
};

const loaded = (image: HTMLImageElement, width: number, height: number) => {
  Object.defineProperty(image, "complete", { value: true, configurable: true });
  Object.defineProperty(image, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: height, configurable: true });
  return image;
};

const original = {
  getContext: HTMLCanvasElement.prototype.getContext,
  toBlob: HTMLCanvasElement.prototype.toBlob,
  Image: globalThis.Image,
};

let painted: string[];
let reloads: (string | null)[];

const paintable = (readable: (canvas: HTMLCanvasElement) => boolean) => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const context = {
      fillStyle: "",
      fillRect: () => painted.push(`fill ${context.fillStyle}`),
      drawImage: () => painted.push(`draw ${this.width}×${this.height}`),
    };
    return context;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback) {
    if (!readable(this)) throw new DOMException("The canvas has been tainted by cross-origin data.", "SecurityError");
    callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
  };
};

// A copy loads at once, the way a cached picture does; `cors` decides whether the host answers a CORS request.
const reloadable = ({ loads, cors }: { loads: boolean; cors: boolean }) => {
  globalThis.Image = class {
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    set src(_value: string) {
      reloads.push(this.crossOrigin);
      queueMicrotask(() => (loads && (cors || this.crossOrigin === null) ? this.onload?.() : this.onerror?.()));
    }
  } as unknown as typeof Image;
};

describe("ScreenImage.find", () => {
  test("matches an address the way readScreen printed it, its absolute form, or the attribute as written", () => {
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("https://app.example/board");
    render(`<img alt="card" src="/files/card.jpg" /><img alt="other" src="https://cdn.example/b.png" />`);
    expect(ScreenImage.find("/files/card.jpg")?.alt).toBe("card");
    expect(ScreenImage.find("https://app.example/files/card.jpg")?.alt).toBe("card");
    expect(ScreenImage.find("https://cdn.example/b.png")?.alt).toBe("other");
  });

  test("a picture off the screen, in the chat itself, or outside the zone is not there to view", () => {
    render(`
      <div hidden><img alt="hidden" src="/hidden.png" /></div>
      <div data-agent-ui><img alt="attached" src="/attached.png" /></div>
      <div id="zone"><img alt="inside" src="/inside.png" /></div>
      <img alt="outside" src="/outside.png" />
    `);
    expect(ScreenImage.find("/hidden.png")).toBeNull();
    expect(ScreenImage.find("/attached.png")).toBeNull();
    expect(ScreenImage.find("/nowhere.png")).toBeNull();
    const zone = document.getElementById("zone") ?? undefined;
    expect(ScreenImage.find("/inside.png", zone)?.alt).toBe("inside");
    expect(ScreenImage.find("/outside.png", zone)).toBeNull();
  });
});

describe("ScreenImage.publiclyFetchable", () => {
  test("only an http(s) address off loopback, private and link-local ranges is one a provider can download", () => {
    expect(ScreenImage.publiclyFetchable("https://cdn.example/card.jpg")).toBe(true);
    expect(ScreenImage.publiclyFetchable("http://203.0.113.9/card.jpg")).toBe(true);
    for (const url of [
      "/api/localFile/getBlob/card.jpg",
      "blob:https://app.example/1f2e",
      "http://localhost:8080/card.jpg",
      "http://app.localhost/card.jpg",
      "http://10.0.0.4/card.jpg",
      "http://192.168.0.2/card.jpg",
      "http://172.20.1.1/card.jpg",
      "http://100.100.1.1/card.jpg",
      "http://[::1]/card.jpg",
      "http://[fd00::1]/card.jpg",
    ])
      expect(ScreenImage.publiclyFetchable(url)).toBe(false);
  });
});

describe("ScreenImage.view", () => {
  beforeEach(() => {
    painted = [];
    reloads = [];
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original.getContext;
    HTMLCanvasElement.prototype.toBlob = original.toBlob;
    globalThis.Image = original.Image;
  });

  test("redraws the picture on white, no longer than the long edge, and inlines it as a JPEG", async () => {
    render(`<img alt="Hero shot" src="/files/hero.png" />`);
    paintable(() => true);
    const image = loaded(document.querySelector("img") as HTMLImageElement, 3136, 1568);
    const { attachment, size } = await ScreenImage.view(image);
    expect(painted).toEqual(["fill #ffffff", "draw 1568×784"]);
    expect(attachment).toEqual({ name: "Hero shot", mimeType: "image/jpeg", data: "AQID" });
    expect(size).toBe("3136×1568, sent as 1568×784 JPEG");
    expect(reloads).toEqual([]);
  });

  test("a picture that has not loaded yet is loaded again rather than read as empty", async () => {
    render(`<img src="https://app.example/files/lazy.webp" loading="lazy" />`);
    paintable(() => true);
    reloadable({ loads: true, cors: false });
    const { attachment, size } = await ScreenImage.view(document.querySelector("img") as HTMLImageElement);
    expect(reloads).toEqual([null]);
    expect(attachment.name).toBe("lazy.webp");
    expect(size).toBe("800×600, sent as 800×600 JPEG");
  });

  test("a picture another origin served without CORS is asked for again with CORS before anything else", async () => {
    render(`<img alt="card" src="https://cdn.example/card.jpg" />`);
    paintable(() => reloads.at(-1) === "anonymous");
    reloadable({ loads: true, cors: true });
    const image = loaded(document.querySelector("img") as HTMLImageElement, 800, 600);
    const { attachment } = await ScreenImage.view(image);
    expect(reloads).toEqual(["anonymous"]);
    expect(attachment.data).toBe("AQID");
  });

  test("a public picture the page may not read goes by address, a type it can name and a host a provider reaches", async () => {
    render(`<img alt="card" src="https://cdn.example/card.jpg" />`);
    paintable(() => false);
    reloadable({ loads: true, cors: false });
    const image = loaded(document.querySelector("img") as HTMLImageElement, 800, 600);
    const { attachment, size } = await ScreenImage.view(image);
    expect(attachment).toEqual({ name: "card", mimeType: "image/jpeg", url: "https://cdn.example/card.jpg" });
    expect(size).toBe("800×600, sent by address because this page may not read its pixels");
  });

  test("an address no provider can reach is never sent as one", async () => {
    paintable(() => false);
    reloadable({ loads: false, cors: false });
    for (const src of [
      "blob:https://app.example/1f2e",
      "http://localhost:3000/card.jpg",
      "https://cdn.example/card.heic",
    ]) {
      render(`<img alt="card" src="${src}" />`);
      const image = loaded(document.querySelector("img") as HTMLImageElement, 800, 600);
      await expect(ScreenImage.view(image)).rejects.toThrow("card cannot be viewed");
    }
  });
});
