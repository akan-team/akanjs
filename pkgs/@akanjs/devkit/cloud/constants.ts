import type { Dayjs } from "dayjs";
import { GlobalConfig } from "./globalConfig";

export const basePath = `${Bun.env.HOME ?? Bun.env.USERPROFILE}/.akan`;
export const configPath = `${basePath}/config.json`;

export interface HostConfig {
  host: string;
  auth?: {
    accessToken?: AccessToken;
    self?: { id: string; nickname: string };
  };
}
export interface HostConfigDto {
  host: string;
  auth?: {
    accessToken?: AccessTokenDto;
    self?: { id: string; nickname: string };
  };
}
export const getDefaultHostConfig = (host = GlobalConfig.akanCloudHost): HostConfig => ({ host });
export interface RemoteEnvServerConfig {
  host: string;
  username?: string;
  port?: number;
}
export type PlatformGatePolicy = "gate" | "warn";
export interface LinuxTestTargetConfig {
  cpus?: number;
  memory?: string;
  policy?: PlatformGatePolicy;
}
export interface WindowsTestTargetConfig {
  host: string;
  user: string;
  identityFile: string;
  knownHostsFile?: string;
  utmVm?: string;
  workRoot?: string;
  tolerateScriptFailures?: string[];
  policy?: PlatformGatePolicy;
  greenStreak?: number;
}
export interface TestTargetsConfig {
  linux?: LinuxTestTargetConfig;
  windows?: WindowsTestTargetConfig;
}
export interface AkanGlobalConfig {
  cloudHost: { [key: string]: HostConfigDto };
  remoteEnvServers: Record<string, RemoteEnvServerConfig>;
  testTargets: TestTargetsConfig;
}
export const defaultAkanGlobalConfig: AkanGlobalConfig = {
  cloudHost: {},
  remoteEnvServers: {},
  testTargets: {},
};

export interface AccessTokenDto {
  jwt: string;
  refreshToken: string | null;
  expiresAt: string | null;
}
export interface AccessToken {
  jwt: string;
  refreshToken: string | null;
  expiresAt: Dayjs | null;
}
