import { AkanError } from "akanjs/base";
import type { SliceInfo } from "../../signal/sliceInfo";
import { invalidSignal } from "./invalidSignal";

export class LivePause {
  static assertDeclared(refName: string, key: string, sliceInfo: SliceInfo) {
    for (const name of sliceInfo.liveOption?.pauseOn ?? []) {
      const arg = sliceInfo.args.find((candidate) => candidate.name === name);
      if (!arg)
        throw invalidSignal(
          `Live slice "${refName}.${key}" declares pauseOn "${name}", which is not one of its arguments ` +
            `(${sliceInfo.args.map((candidate) => candidate.name).join(", ") || "none"}).`,
        );
      if (!arg.option?.nullable)
        throw invalidSignal(
          `Live slice "${refName}.${key}" declares pauseOn "${name}", which is a required ${arg.type} and is ` +
            `therefore always present — the room would never open. Only a nullable argument can pause live sync.`,
        );
    }
  }

  static assertNotPaused(key: string, sliceInfo: SliceInfo, args: unknown[]) {
    for (const name of sliceInfo.liveOption?.pauseOn ?? []) {
      const idx = sliceInfo.args.findIndex((arg) => arg.name === name);
      if (idx < 0 || args[idx] == null) continue;
      throw new AkanError(
        "livePaused",
        `Live room "${key}" is paused while "${name}" carries a value: the slice declared it in ` +
          `.live({ pauseOn }), so this window updates by refetching instead of subscribing.`,
        { statusCode: 409 },
      );
    }
  }
}
