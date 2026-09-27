// bun:ffi binding of native/desktop (C ABI, docs/architecture.md §9). Used by main and the Worker.

import { dlopen } from "bun:ffi";
import { dirname, join } from "node:path";

export interface DesktopPaths {
  /** The native library: libakan_native_desktop.dylib, akan_native_desktop.dll or libakan_native_desktop.so */
  lib: string;
  /** boot.json, env.runtime.json, shell.json, app/ (platforms/desktop.ts in the CLI) */
  resources: string;
  appDir: string;
}

/**
 * Paths relative to the executable, as the CLI lays them out (packages/cli/src/platforms/*.ts):
 *   macOS    <App>.app/Contents/MacOS/<exe>, Frameworks/libakan_native_desktop.dylib, Resources/
 *   Windows  <App>\<exe>.exe, akan_native_desktop.dll, resources\
 *   Linux    <app>/<exe>, lib/libakan_native_desktop.so, resources/
 * process.execPath is absolute even when the app is started with `open` (cwd = /) or through a
 * symlink. Nothing in the environment overrides them: the app would load whatever library a
 * variable (or a .env file next to it, before the build turned autoloading off) names.
 */
export function resolvePaths(platform: NodeJS.Platform = process.platform, execPath = process.execPath): DesktopPaths {
  const exeDir = dirname(execPath);
  const [lib, resources] =
    platform === "darwin"
      ? [join(exeDir, "..", "Frameworks", "libakan_native_desktop.dylib"), join(exeDir, "..", "Resources")]
      : platform === "win32"
        ? [join(exeDir, "akan_native_desktop.dll"), join(exeDir, "resources")]
        : [join(exeDir, "lib", "libakan_native_desktop.so"), join(exeDir, "resources")];
  return { lib, resources, appDir: join(resources, "app") };
}

/** The C ABI major version this code speaks (lib.rs ABI >> 16). */
export const ABI_MAJOR = 0;

export const SYMBOLS = {
  akan_native_abi: { args: [], returns: "u32" },
  akan_native_init: { args: ["u8"], returns: "i32" },
  akan_native_last_error: { args: ["ptr", "u64"], returns: "u64" },
  akan_native_run: { args: ["ptr"], returns: "i32" },
  akan_native_set_wake: { args: ["ptr"], returns: "void" },
  akan_native_poll: { args: ["ptr", "u32"], returns: "u32" },
  akan_native_respond: { args: ["u64", "u16", "ptr", "ptr", "u32"], returns: "void" },
  akan_native_emit: { args: ["u32", "ptr"], returns: "void" },
  akan_native_register_file: { args: ["ptr", "ptr", "ptr"], returns: "void" },
  akan_native_unregister_file: { args: ["ptr"], returns: "u8" },
  akan_native_quit: { args: ["i32"], returns: "void" },
  akan_native_quit_cancel: { args: [], returns: "void" },
  akan_native_external_open_allowed: { args: [], returns: "u8" },
  akan_native_shell: { args: ["u64", "ptr"], returns: "void" },
} as const;

export function openNative(libPath: string) {
  return dlopen(libPath, SYMBOLS);
}

/** The native library's last error (akan_native_last_error), or "". */
export function lastError(lib: NativeLib): string {
  const size = Number(lib.symbols.akan_native_last_error(null, 0));
  if (size === 0) return "";
  const buf = new Uint8Array(size);
  lib.symbols.akan_native_last_error(buf, size);
  return new TextDecoder().decode(buf);
}

export type NativeLib = ReturnType<typeof openNative>;

const encoder = new TextEncoder();
/** NUL-terminated UTF-8. Native code copies it during the call, so it may be collected afterwards. */
export const cstr = (text: string) => encoder.encode(`${text}\0`);

/** Message kinds in akan_native_poll frames: [u8 kind][u64 reqId LE][u32 webviewId LE][body]. */
export const FRAME_IPC = 1;
export const FRAME_EVENT = 2;
export const FRAME_HEADER = 13;
