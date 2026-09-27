// The platforms akan-native can build today, without the builders (env.ts needs the list too).

export type TargetPlatform = "web" | "macos" | "windows" | "linux" | "ios" | "android";
export const TARGETS: readonly TargetPlatform[] = ["web", "macos", "windows", "linux", "ios", "android"];

/** What `all` means on this machine: desktop apps and iOS build only on their own OS. */
export function hostTargets(host: NodeJS.Platform = process.platform): TargetPlatform[] {
  if (host === "darwin") return ["web", "macos", "ios", "android"];
  if (host === "win32") return ["web", "windows"];
  if (host === "linux") return ["web", "linux"];
  return ["web"];
}
