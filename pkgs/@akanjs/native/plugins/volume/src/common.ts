import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type { VolumeState } from "./index.ts";

export function checkLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    throw new AkanNativeError("INVALID_ARGS", "level must be a number from 0 to 1");
  return value;
}

export function checkMuted(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AkanNativeError("INVALID_ARGS", "muted must be a boolean");
  return value;
}

export const sameVolume = (a: VolumeState, b: VolumeState) =>
  a.level === b.level && a.muted === b.muted && a.settable === b.settable;

/**
 * `pactl get-sink-volume @DEFAULT_SINK@` ("Volume: front-left: 32768 /  50% / -18.06 dB, front-right: …"):
 * the channels' mean. PulseAudio can boost past 100%, which reads as 1.
 */
export function pactlLevel(output: string): number | null {
  const percents = [...output.matchAll(/(\d+)%/g)].map((match) => Number(match[1]));
  if (!percents.length) return null;
  return Math.min(1, Math.round((percents.reduce((sum, p) => sum + p, 0) / percents.length) * 10) / 1000);
}

export const pactlMuted = (output: string) => /Mute:\s*yes/i.test(output);
