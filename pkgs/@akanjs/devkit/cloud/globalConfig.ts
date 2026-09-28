import { mkdir, rm, writeFile } from "node:fs/promises";
import dayjs from "dayjs";
import { FileSys } from "../fileSys";
import { ConfigLock } from "./configLock";
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
  // Holds the cloud jwt and refresh token, so owner-only 0600: written to a 0600 sibling and renamed over the file,
  // which also replaces a world-readable one and never shows another CLI process a half-written file.
  static async #setAkanGlobalConfig(akanConfig: AkanGlobalConfig) {
    await mkdir(basePath, { recursive: true, mode: 0o700 });
    const temp = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(akanConfig, null, 2), { mode: 0o600 });
      // Every CLI reads this file outside the lock, which on Windows makes the rename wait for the reader.
      await FileSys.replace(temp, configPath);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }
  static readonly #lockPath = `${configPath}.lock`;
  // Every write re-reads under the lock: one built on an earlier read could restore a rotated-away refresh token.
  static async #update(mutate: (akanConfig: AkanGlobalConfig) => AkanGlobalConfig) {
    await ConfigLock.run(GlobalConfig.#lockPath, async () => {
      await GlobalConfig.#setAkanGlobalConfig(mutate(await GlobalConfig.#getAkanGlobalConfig()));
    });
  }
  static async getHostConfig(host = GlobalConfig.akanCloudHost): Promise<HostConfig> {
    const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
    return GlobalConfig.toHostConfig(akanConfig.cloudHost[host] ?? getDefaultHostConfig(host));
  }
  static async setHostConfig(config: HostConfig = getDefaultHostConfig()) {
    await GlobalConfig.#update((akanConfig) => GlobalConfig.#withHost(akanConfig, config));
  }
  static #withHost(akanConfig: AkanGlobalConfig, config: HostConfig): AkanGlobalConfig {
    return {
      ...akanConfig,
      cloudHost: { ...akanConfig.cloudHost, [config.host]: GlobalConfig.toHostConfigDto(config) },
    };
  }
  // The cloud rotates the refresh token and revokes every session of the account when one is presented twice, so it
  // leaves the disk before it is sent: a refresh killed in flight leaves nothing to replay, only a sign-in to redo.
  static async refreshHostAuth(host: string, refresh: (refreshToken: string) => Promise<AccessToken>) {
    try {
      return await ConfigLock.run(GlobalConfig.#lockPath, async () => {
        const akanConfig = await GlobalConfig.#getAkanGlobalConfig();
        const current = GlobalConfig.toHostConfig(akanConfig.cloudHost[host] ?? getDefaultHostConfig(host));
        const accessToken = current.auth?.accessToken;
        const refreshToken = accessToken?.refreshToken;
        if (!accessToken || !refreshToken || !GlobalConfig.needRefreshToken(accessToken)) return current;
        const claimed: HostConfig = {
          ...current,
          auth: { ...current.auth, accessToken: { ...accessToken, refreshToken: null } },
        };
        await GlobalConfig.#setAkanGlobalConfig(GlobalConfig.#withHost(akanConfig, claimed));
        const next = await refresh(refreshToken).catch(() => null);
        if (!next?.jwt) return claimed;
        const refreshed: HostConfig = { ...current, auth: { ...current.auth, accessToken: next } };
        await GlobalConfig.#setAkanGlobalConfig(
          GlobalConfig.#withHost(await GlobalConfig.#getAkanGlobalConfig(), refreshed),
        );
        return refreshed;
      });
    } catch {
      // No lock, or a write that failed: what is stored is used as it is, and nothing is refreshed outside the lock.
      return await GlobalConfig.getHostConfig(host);
    }
  }
  static async getRemoteEnvServers(): Promise<AkanGlobalConfig["remoteEnvServers"]> {
    return (await GlobalConfig.#getAkanGlobalConfig()).remoteEnvServers;
  }
  static async setRemoteEnvServer(name: string, config: RemoteEnvServerConfig) {
    await GlobalConfig.#update((akanConfig) => ({
      ...akanConfig,
      remoteEnvServers: { ...akanConfig.remoteEnvServers, [name]: config },
    }));
  }
  static async removeRemoteEnvServer(name: string) {
    await GlobalConfig.#update((akanConfig) => {
      const { [name]: _, ...remoteEnvServers } = akanConfig.remoteEnvServers;
      return { ...akanConfig, remoteEnvServers };
    });
  }
  static async getTestTargets(): Promise<TestTargetsConfig> {
    return (await GlobalConfig.#getAkanGlobalConfig()).testTargets;
  }
  static async setTestTargets(testTargets: TestTargetsConfig) {
    await GlobalConfig.#update((akanConfig) => ({
      ...akanConfig,
      testTargets: { ...akanConfig.testTargets, ...testTargets },
    }));
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
