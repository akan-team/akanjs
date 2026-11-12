import type { SysExecutor } from "@akanjs/devkit/executors";
import type { AppInfo, LibInfo } from "akanjs";
import { facetBarrelOf } from "akanjs/common";

interface Dict {
  [key: string]: string;
}

interface Options {
  exec?: SysExecutor;
  facet?: string;
}

export default async function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}, options: Options = {}) {
  const { exec, facet } = options;
  if (!exec || !facet || !(await exec.exists(facet))) return null;

  const { files, dirs } = await exec.getFilesAndDirs(facet);
  const content = facetBarrelOf(facet, files, dirs);
  return { filename: "index.ts", content };
}
