import { statSync } from "node:fs";
import { AkanAppConfig } from "../akanConfig/akanConfig";

export interface BuildCacheStamp {
  akanjs: string;
  bun: string;
  code: string;
}

//? Kept across starts, so another akanjs, Bun or edit of the producing module (run from source) must read as a miss.
export const buildCacheStamp = (producers: string[]): BuildCacheStamp => ({
  akanjs: AkanAppConfig.akanVersion,
  bun: `${Bun.version}+${Bun.revision}`,
  code: producers
    .map((file) => {
      const stats = statSync(file, { throwIfNoEntry: false });
      return stats ? `${stats.mtimeMs}:${stats.size}` : "missing";
    })
    .join(","),
});

export const isBuildCacheStamp = (value: Partial<BuildCacheStamp> | null | undefined, stamp: BuildCacheStamp) =>
  value?.akanjs === stamp.akanjs && value.bun === stamp.bun && value.code === stamp.code;
