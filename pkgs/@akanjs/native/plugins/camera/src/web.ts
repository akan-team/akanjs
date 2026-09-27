import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { CameraApi, PermissionState, Photo, PickImagesOptions, TakePhotoOptions } from "./index.ts";

// Two capture paths:
// - touch devices and "library": <input type=file> (opens the OS camera or picker),
//   as capacitor-plugins/camera/src/web.ts `fileInputExperience` does
// - pointer devices with a webcam (desktop browsers, the macOS WebView): an in-page
//   getUserMedia preview, since <input capture> is ignored there

const cancelled = () => new AkanNativeError("CANCELLED", "photo capture was cancelled");

function isTouchPrimary(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

type Output = Pick<TakePhotoOptions, "quality" | "maxWidth" | "maxHeight">;

const jpegQuality = (output: Output) => Math.min(100, Math.max(1, output.quality ?? 90)) / 100;

/** The largest size within the limits, keeping the aspect ratio. */
function fit(width: number, height: number, output: Output): { width: number; height: number } {
  const scale = Math.min(1, (output.maxWidth ?? width) / width, (output.maxHeight ?? height) / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function checkOutput(output: Output): void {
  if (
    (output.maxWidth !== undefined && !(output.maxWidth >= 1)) ||
    (output.maxHeight !== undefined && !(output.maxHeight >= 1))
  ) {
    throw new AkanNativeError("INVALID_ARGS", "maxWidth and maxHeight must be at least 1");
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AkanNativeError("INTERNAL", "could not encode the photo"))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * A picked file as the page gets it (index.ts): kept when it is a JPEG within the limits and no
 * quality was asked for; otherwise decoded upright (createImageBitmap applies EXIF orientation),
 * scaled, put on white and encoded as JPEG. A file the browser cannot decode stays as it is.
 */
async function normalized(file: File, output: Output): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { url: URL.createObjectURL(file), mime: file.type || "application/octet-stream", size: file.size }; // e.g. HEIC outside Safari
  }
  try {
    const size = fit(bitmap.width, bitmap.height, output);
    // A JPEG's EXIF orientation is applied when it is shown too, so a fitting one needs no work.
    if (
      file.type === "image/jpeg" &&
      size.width === bitmap.width &&
      size.height === bitmap.height &&
      output.quality === undefined
    ) {
      return { url: URL.createObjectURL(file), mime: "image/jpeg", size: file.size, ...size };
    }
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, size.width, size.height);
    g.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await toJpeg(canvas, jpegQuality(output));
    return { url: URL.createObjectURL(blob), mime: "image/jpeg", size: blob.size, ...size };
  } finally {
    bitmap.close();
  }
}

/** Must run synchronously inside the user's click: input.click() needs user activation. */
function pickFile(capture: "user" | "environment" | null, output: Output): Promise<Photo> {
  return pickFiles(capture, 1, output).then((photos) => photos[0]!);
}

function pickFiles(capture: "user" | "environment" | null, limit: number, output: Output): Promise<Photo[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = limit > 1;
    if (capture) input.setAttribute("capture", capture);
    input.style.display = "none";
    // Keep it in the document while the picker is open (Capacitor does the same).
    document.body.appendChild(input);
    input.addEventListener(
      "change",
      async () => {
        const files = [...(input.files ?? [])].slice(0, limit);
        input.remove();
        if (files.length === 0) return reject(cancelled());
        try {
          resolve(await Promise.all(files.map((file) => normalized(file, output))));
        } catch (error) {
          reject(AkanNativeError.from(error));
        }
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        input.remove();
        reject(cancelled());
      },
      { once: true },
    );
    input.click();
  });
}

function mediaError(error: unknown): AkanNativeError {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return new AkanNativeError("PERMISSION_DENIED", "camera access was denied");
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return new AkanNativeError("UNSUPPORTED", "no camera is available");
  return AkanNativeError.from(error);
}

async function openStream(direction: "rear" | "front"): Promise<MediaStream> {
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia)
    throw new AkanNativeError("UNSUPPORTED", "getUserMedia is not available (insecure context?)");
  try {
    return await devices.getUserMedia({
      video: { facingMode: direction === "front" ? "user" : "environment" },
      audio: false,
    });
  } catch (error) {
    // Laptops have a single camera that may not match the requested facing mode.
    if ((error as { name?: string })?.name !== "OverconstrainedError") throw mediaError(error);
    try {
      return await devices.getUserMedia({ video: true, audio: false });
    } catch (retry) {
      throw mediaError(retry);
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, attrs: Record<string, string> = {}) {
  const node = document.createElement(tag);
  // CSSOM, not a style attribute: a strict CSP (style-src without 'unsafe-inline') blocks the latter.
  node.style.cssText = style;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

async function captureWithPreview(options: TakePhotoOptions): Promise<Photo> {
  const direction = options.direction ?? "rear";
  const quality = jpegQuality(options);
  const stream = await openStream(direction);

  const root = el(
    "div",
    "position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;flex-direction:column;font:16px system-ui,sans-serif",
    { role: "dialog", "aria-label": "Camera" },
  );
  const video = el(
    "video",
    `flex:1;min-height:0;width:100%;object-fit:contain${direction === "front" ? ";transform:scaleX(-1)" : ""}`,
    {
      playsinline: "",
      muted: "",
      autoplay: "",
    },
  );
  const bar = el(
    "div",
    "display:flex;align-items:center;justify-content:space-between;padding:16px 24px calc(16px + env(safe-area-inset-bottom))",
  );
  const cancel = el("button", "background:none;border:0;color:#fff;font:inherit;padding:8px;cursor:pointer", {
    type: "button",
  });
  cancel.textContent = "Cancel";
  const shutter = el(
    "button",
    "width:64px;height:64px;border-radius:50%;border:4px solid #fff;background:#fff;box-shadow:inset 0 0 0 3px #000;cursor:pointer",
    { type: "button", "aria-label": "Take photo" },
  );
  const spacer = el("span", "width:60px");
  bar.append(cancel, shutter, spacer);
  root.append(video, bar);
  video.srcObject = stream;
  document.body.appendChild(root);

  try {
    await video.play().catch(() => {});
    return await new Promise<Photo>((resolve, reject) => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") finish(() => reject(cancelled()));
      };
      const finish = (settle: () => void) => {
        window.removeEventListener("keydown", onKey);
        settle();
      };
      window.addEventListener("keydown", onKey);
      cancel.onclick = () => finish(() => reject(cancelled()));
      shutter.onclick = () => {
        if (!video.videoWidth || !video.videoHeight) return; // no frame yet
        const { width, height } = fit(video.videoWidth, video.videoHeight, options);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) =>
            finish(() =>
              blob
                ? resolve({ url: URL.createObjectURL(blob), mime: "image/jpeg", size: blob.size, width, height })
                : reject(new AkanNativeError("INTERNAL", "could not encode the photo")),
            ),
          "image/jpeg",
          quality,
        );
      };
    });
  } finally {
    for (const track of stream.getTracks()) track.stop();
    root.remove();
  }
}

async function queryPermission(): Promise<PermissionState> {
  try {
    // "camera" is not a valid permission name in every browser, hence the try
    // (capacitor-plugins/camera/src/web.ts checkPermissions).
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state;
  } catch {
    return "prompt";
  }
}

export const web = defineWebPlugin<CameraApi>({
  methods: {
    takePhoto(options = {}) {
      checkOutput(options);
      const source = options.source ?? "camera";
      if (source === "library") return pickFile(null, options);
      if (isTouchPrimary() || !navigator.mediaDevices?.getUserMedia) {
        return pickFile(options.direction === "front" ? "user" : "environment", options);
      }
      return captureWithPreview(options);
    },
    pickImages(options: PickImagesOptions = {}) {
      checkOutput(options);
      const limit = Math.min(20, Math.max(1, Math.floor(options.limit ?? 10)));
      return pickFiles(null, limit, options).then((photos) => ({ photos }));
    },
    checkPermission: async () => ({ camera: await queryPermission() }),
    async requestPermission() {
      try {
        const stream = await openStream("rear");
        for (const track of stream.getTracks()) track.stop();
        return { camera: "granted" };
      } catch (error) {
        if (error instanceof AkanNativeError && error.code === "PERMISSION_DENIED") return { camera: "denied" };
        throw error;
      }
    },
  },
});
