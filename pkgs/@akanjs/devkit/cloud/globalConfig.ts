import { chmod, mkdir } from "node:fs/promises";
import dayjs from "dayjs";
import { FileSys } from "../fileSys";
import {
  type AccessToken,
  type AccessTokenDto,
  type AkanGlobalConfig,
  basePath,
  configPath,
  defaultAkanGlobalConfig,
  getDefaultHostConfig,
  type HostConfig,
  type HostConfigDto,
  type RemoteEnvServerConfig,
  type TestTargetsConfig,
} from "./constants";

export class GlobalConfig {
  static akanCloudHost =
    process.env.USE_AKANJS_PKGS === "true"
      ? `http://localhost:${process.env.CLOUD_HOST_PORT ?? 8283}`
      : "https://cloud.akanjs.com";
  static async #getAkanGlobalConfig(): Promise<AkanGlobalConfig> {
    const exists = await FileSys.fileExists(configPath);
    const akanConfig = exists ? await FileSys.readJson<Partial<AkanGlobalConfig>>(configPath) : {};
    return {
      ...defaultAkanGlobalConfig,
      ...akanConfig,
      cloudHost: akanConfig.cloudHost ?? defaultAkanGlobalConfig.cloudHost,
      remoteEnvServers: akanConfig.remoteEnvServers ?? defaultAkanGlobalConfig.remoteEnvServers,
      testTargets: akanConfig.testTargets ?? defaultAkanGlobalConfig.testTargets,
    };
  }
  /**
   * This file holds the cloud jwt and a refresh token that does not expire, so it is
   * written owner-only — the same `0600` the runtime gives its control socket. `Bun.write` takes no mode
   * and lands on `0666 & ~umask` (0644 on a default shell), so the mode is applied after the write; an
   * existing world-readable file is tightened by the next write rather than left as it was found.
   */
  static async #setAkanGlobalConfig(akanConfig: AkanGlobalConfig) {
    await mkdir(basePath, { recursive: true, mode: 0o700 });
    await Bun.write(configPath, JSON.stringify(akanConfig, null, 2));
    await chmod(configPath, 0o600);
  }
  static async getHostConfig(host = GlobalConfig.akanCloudHost): Promise<HostConfig> {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    return GlobalConfig.toHostConfig(akanConfig.cloudHost[host] ?? getDefaultHostConfig(host));
  }
  static async setHostConfig(config: HostConfig = getDefaultHostConfig()) {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    akanConfig.cloudHost[config.host] = GlobalConfig.toHostConfigDto(config);
    await GlobalConfig.#setAkanGlobalConfig(akanConfig);
  }
  static async getRemoteEnvServers(): Promise<AkanGlobalConfig["remoteEnvServers"]> {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    return akanConfig.remoteEnvServers;
  }
  static async setRemoteEnvServer(name: string, config: RemoteEnvServerConfig) {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    await GlobalConfig.#setAkanGlobalConfig({
      ...akanConfig,
      remoteEnvServers: {
        ...akanConfig.remoteEnvServers,
        [name]: config,
      },
    });
  }
  static async removeRemoteEnvServer(name: string) {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    const { [name]: _, ...remoteEnvServers } = akanConfig.remoteEnvServers;
    await GlobalConfig.#setAkanGlobalConfig({
      ...akanConfig,
      remoteEnvServers,
    });
  }
  static async getTestTargets(): Promise<TestTargetsConfig> {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    return akanConfig.testTargets;
  }
  static async setTestTargets(testTargets: TestTargetsConfig) {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    await GlobalConfig.#setAkanGlobalConfig({
      ...akanConfig,
      testTargets: { ...akanConfig.testTargets, ...testTargets },
    });
  }
  static needRefreshToken(accessToken: AccessToken): boolean {
    return !!accessToken?.expiresAt?.isBefore(dayjs().add(1, "hour"));
  }
  static toAccessToken(accessToken: AccessTokenDto): AccessToken {
    return {
      jwt: accessToken.jwt,
      refreshToken: accessToken.refreshToken ?? null,
      expiresAt: accessToken.expiresAt ? dayjs(accessToken.expiresAt) : null,
    };
  }
  static toAccessTokenDto(accessToken: AccessToken): AccessTokenDto {
    return {
      jwt: accessToken.jwt,
      refreshToken: accessToken.refreshToken ?? null,
      expiresAt: accessToken.expiresAt?.toString() ?? null,
    };
  }
  static toHostConfigDto(hostConfig: HostConfig): HostConfigDto {
    return {
      host: hostConfig.host,
      auth: {
        accessToken: hostConfig.auth?.accessToken
          ? GlobalConfig.toAccessTokenDto(hostConfig.auth.accessToken)
          : undefined,
        self: hostConfig.auth?.self,
      },
    };
  }
  static toHostConfig(hostConfigDto: HostConfigDto): HostConfig {
    return {
      host: hostConfigDto.host,
      auth: {
        accessToken: hostConfigDto.auth?.accessToken
          ? GlobalConfig.toAccessToken(hostConfigDto.auth.accessToken)
          : undefined,
        self: hostConfigDto.auth?.self,
      },
    };
  }
}
