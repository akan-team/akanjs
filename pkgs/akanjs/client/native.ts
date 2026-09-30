import { isNative, platform } from "@akanjs/native/core";
import { browser } from "@akanjs/native/plugins/browser";
import { opener } from "@akanjs/native/plugins/opener";

export type { LiveValue, Plugin } from "@akanjs/native/core";
export {
  AkanNativeError,
  createLiveValue,
  definePlugin,
  defineWebPlugin,
  fileBlob,
  isAkanNativeError,
  releaseFile,
  shallowEqual,
} from "@akanjs/native/core";
export { app } from "@akanjs/native/plugins/app";
export { appState } from "@akanjs/native/plugins/app-state";
export type { AuthSessionApi } from "@akanjs/native/plugins/auth-session";
export { authSession } from "@akanjs/native/plugins/auth-session";
export type { Photo } from "@akanjs/native/plugins/camera";
export type { Contact } from "@akanjs/native/plugins/contacts";
export type { DeviceInfo } from "@akanjs/native/plugins/device";
export { device } from "@akanjs/native/plugins/device";
export { dialog } from "@akanjs/native/plugins/dialog";
export type {
  DirectoryFile,
  PickDirectoryOptions,
  PickDirectoryResult,
  PickedFile,
  PickFilesOptions,
  SaveFileOptions,
  SaveFileResult,
} from "@akanjs/native/plugins/file-picker";
export { filePicker } from "@akanjs/native/plugins/file-picker";
export type { Position } from "@akanjs/native/plugins/geolocation";
export { haptics } from "@akanjs/native/plugins/haptics";
export type { IapProduct, IapTransaction } from "@akanjs/native/plugins/iap";
export { keyboard } from "@akanjs/native/plugins/keyboard";
export { preferences } from "@akanjs/native/plugins/preferences";
export type {
  PushAction,
  PushMessage,
  PushPermissionState,
  PushToken as NativePushToken,
} from "@akanjs/native/plugins/push";
export { push } from "@akanjs/native/plugins/push";
export { secureStorage } from "@akanjs/native/plugins/secure-storage";
export type { UpdateCheck, UpdateProgress, UpdateState } from "@akanjs/native/plugins/updates";
export { markReady, updates, useUpdateState } from "@akanjs/native/plugins/updates";
export type { VolumeState } from "@akanjs/native/plugins/volume";
export { volume } from "@akanjs/native/plugins/volume";
export { useLiveValue, usePluginEvent } from "@akanjs/native/react";
export { browser, opener };

//* Kept out of the page's first chunk: a photo is re-encoded in the page on the web, and few screens ask for any.
export const loadCamera = () => import("@akanjs/native/plugins/camera");
export const loadContacts = () => import("@akanjs/native/plugins/contacts");
export const loadGeolocation = () => import("@akanjs/native/plugins/geolocation");
export const loadIap = () => import("@akanjs/native/plugins/iap");

/** Inside an iOS or Android shell of the native runtime; a mobile target opened in a browser is not. */
export const isNativeApp = () => isNative && (platform === "ios" || platform === "android");

/** Inside any shell of the native runtime, desktop included. */
export const isNativeShell = () => isNative;

export const nativePlatform = () => (isNativeApp() ? (platform as "ios" | "android") : null);

export const desktopPlatform = () =>
  isNative && (platform === "macos" || platform === "windows" || platform === "linux") ? platform : null;

/** http(s) in the in-app browser, anything else (mailto:, tel:) in the app the system picks. */
export const openExternalUrl = async (url: string) => {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (/^https?:/i.test(url)) await browser.open({ url });
  else await opener.openUrl({ url });
};
