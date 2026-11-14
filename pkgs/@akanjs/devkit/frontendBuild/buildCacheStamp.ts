import { AkanAppConfig } from "../akanConfig/akanConfig";

export interface BuildCacheStamp {
  akanjs: string;
  bun: string;
}

//? `akan start` keeps `.akan/cache`, so an entry another akanjs or Bun wrote must read as a miss, never as a hit.
export const buildCacheStamp = (): BuildCacheStamp => ({
  akanjs: AkanAppConfig.akanVersion,
  bun: `${Bun.version}+${Bun.revision}`,
});

export const isBuildCacheStamp = (value: Partial<BuildCacheStamp> | null | undefined, stamp: BuildCacheStamp) =>
  value?.akanjs === stamp.akanjs && value.bun === stamp.bun;
