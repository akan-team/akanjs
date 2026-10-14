import type { App } from "@akanjs/devkit/commandDecorators";
import { getMobileTargetChoices } from "@akanjs/devkit/mobile";

const targetChoices = async ({ app }: { app: App }) => await getMobileTargetChoices(app);

export const writeOption = { desc: "write code generation", default: true } as const;

export const nativeTargetOption = {
  desc: "native target name (a key of native.targets) or all",
  ask: "Select native target",
  enum: targetChoices,
};

export const oneNativeTargetOption = {
  desc: "native target name (a key of native.targets)",
  ask: "Select native target",
  enum: targetChoices,
};

export const nativeEnvs = ["debug", "develop", "main", "local"] as const;

export const releaseEnvOption = { enum: nativeEnvs, desc: "backend environment", default: "main" } as const;

export const allowLocalOption = (what: string) =>
  ({ flag: "l", desc: `allow ${what} with --env local`, default: false }) as const;

export const hostOption = {
  desc: "host of the cloud to target (default: cloud.host of the root akan.config.ts, else Akan Cloud)",
  nullable: true,
} as const;

export const subspaceOption = (whose: string) =>
  ({ desc: `the subspace whose project ${whose}`, nullable: true }) as const;
