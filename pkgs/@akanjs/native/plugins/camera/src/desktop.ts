// Desktop: only the permission state is native (plugins.md Q9); capture stays on the web
// implementation (getUserMedia preview, <input type=file>): the manifest's desktop entry lists
// these two methods with `web: true`. The shells answer camera.status / camera.request with an
// AVAuthorizationStatus number on every OS:
// - macOS: the real TCC state from AVCaptureDevice (native/desktop/src/camera.rs).
// - Windows: the capability consent store behind Settings › Privacy & security › Camera
//   (native/desktop/src/win/camera.rs): switched off is denied, else "prompt", because WebView2
//   asks the user itself at getUserMedia and a desktop app has no system prompt to show first.
// - Linux: no permission system for unsandboxed apps and the shell allows WebKitGTK's camera
//   requests (lib.rs permission handler), so "granted" (native/desktop/src/linux/camera.rs).
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { CameraApi, PermissionState } from "./index.ts";

/** AVAuthorizationStatus: 0 notDetermined, 1 restricted, 2 denied, 3 authorized. */
export function permissionState(status: unknown): PermissionState {
  if (status === 3) return "granted";
  if (status === 1 || status === 2) return "denied";
  return "prompt";
}

const status = async (ctx: DesktopContext) => ((await ctx.shell("camera.status")) as { status: number }).status;

export default defineDesktopPlugin<CameraApi>({
  id: "camera",
  methods: {
    checkPermission: async (_args, ctx) => ({ camera: permissionState(await status(ctx)) }),
    // The shell refuses when Info.plist has no NSCameraUsageDescription: TCC would kill the app.
    requestPermission: async (_args, ctx) => {
      const now = await status(ctx);
      if (now !== 0) return { camera: permissionState(now) };
      const after = (await ctx.shell("camera.request")) as { status: number };
      return { camera: permissionState(after.status) };
    },
  },
});
