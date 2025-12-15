import { homedir } from "os";

import type { SupportedLlmModel } from "./aiEditor";

export const basePath = `${homedir()}/.akan`;
export const configPath = `${basePath}/config.json`;
export const akanCloudHost =
  process.env.NEXT_PUBLIC_OPERATION_MODE === "local" ? "http://localhost" : "https://cloud.akanjs.com";
export const akanCloudBackendUrl = `${akanCloudHost}${process.env.NEXT_PUBLIC_OPERATION_MODE === "local" ? ":8080" : ""}/backend`;
export const akanCloudClientUrl = `${akanCloudHost}${process.env.NEXT_PUBLIC_OPERATION_MODE === "local" ? ":4200" : ""}`;

export interface HostConfig {
  auth?: {
    token: string;
    self: { id: string; nickname: string };
  };
}
export const defaultHostConfig: HostConfig = {};
export interface AkanGlobalConfig {
  cloudHost: {
    [key: string]: HostConfig;
  };
  llm: {
    model: SupportedLlmModel;
    apiKey: string;
  } | null;
}
export const defaultAkanGlobalConfig: AkanGlobalConfig = { cloudHost: {}, llm: null };
