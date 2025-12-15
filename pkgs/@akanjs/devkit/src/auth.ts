import fs from "fs";

import {
  akanCloudBackendUrl,
  akanCloudHost,
  AkanGlobalConfig,
  basePath,
  configPath,
  defaultAkanGlobalConfig,
  defaultHostConfig,
  type HostConfig,
} from "./constants";

export const getAkanGlobalConfig = () => {
  const akanConfig = fs.existsSync(configPath)
    ? (JSON.parse(fs.readFileSync(configPath, "utf8")) as AkanGlobalConfig)
    : defaultAkanGlobalConfig;
  return akanConfig;
};
export const setAkanGlobalConfig = (akanConfig: AkanGlobalConfig) => {
  fs.mkdirSync(basePath, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(akanConfig, null, 2));
};
export const getHostConfig = (host = akanCloudHost) => {
  const akanConfig = getAkanGlobalConfig();
  return akanConfig.cloudHost[host] ?? defaultHostConfig;
};
export const setHostConfig = (host = akanCloudHost, config: HostConfig = {}) => {
  const akanConfig = getAkanGlobalConfig();
  akanConfig.cloudHost[host] = config;
  setAkanGlobalConfig(akanConfig);
};
export const getSelf = async (token: string) => {
  try {
    const res = await fetch(`${akanCloudBackendUrl}/user/getSelf`, { headers: { Authorization: `Bearer ${token}` } });
    const user = (await res.json()) as { id: string; nickname: string };
    return user;
  } catch (e) {
    return null;
  }
};
