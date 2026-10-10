import type { Workspace } from "../commandDecorators";
import type { AccessToken, AccessTokenDto, HostConfig } from "./constants";
import { GlobalConfig } from "./globalConfig";

interface HttpRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class HttpClient {
  readonly baseUrl: string;
  readonly headers: Record<string, string> = {};
  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }
  async get<T>(url: string, { headers, signal }: HttpRequestOptions = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      headers: { "Content-Type": "application/json", ...this.headers, ...headers },
      ...(signal ? { signal } : {}),
    });
    return await HttpClient.#body<T>(response, url);
  }
  async getFile(url: string, localPath: string, headers?: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      headers: { ...this.headers, ...headers },
    });
    if (!response.ok) throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    await Bun.write(localPath, response);
  }
  async post<T>(url: string, data: unknown, { headers, signal }: HttpRequestOptions = {}): Promise<T> {
    const isFormData = data instanceof FormData;
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: "POST",
      body: isFormData ? data : JSON.stringify(data),
      headers: isFormData
        ? { ...this.headers, ...headers }
        : { "Content-Type": "application/json", ...this.headers, ...headers },
      ...(signal ? { signal } : {}),
    });
    return await HttpClient.#body<T>(response, url);
  }
  // A missing route answers an HTML error page, so the status is read before the body is parsed as JSON.
  static async #body<T>(response: Response, url: string): Promise<T> {
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  }
  setHeaders(headers: Record<string, string>) {
    Object.assign(this.headers, headers);
    return this;
  }
}

export interface TunnelGrant {
  code: string;
  hostname: string;
  url: string;
  /** Named by the control plane (e.g. `wss://tunnel.akanjs.com`); the CLI never assumes one. */
  gatewayUrl: string;
  /** Whoever holds it becomes the origin behind `hostname`: never written to disk or logged. */
  token: string;
  expiresAt: string | null;
}

/** `scope` is `"*"` for every branch or the one branch it overrides. No call ever returns a value. */
export interface PipelineSecretSummary {
  name: string;
  scope: string;
  updatedAt: string;
}

export interface PipelineSecretListing extends PipelineSecretSummary {
  updatedBy: string;
}

export interface TunnelSummary {
  code: string;
  hostname: string;
  url: string;
  name: string | null;
  createdAt: string;
  expiresAt: string | null;
  connected: boolean;
}

export class CloudApi {
  readonly #api: HttpClient;
  #accessToken: AccessToken | null = null;
  #workspace: Workspace;
  host: string;
  url: string;

  static async fromHost(workspace: Workspace, host?: string) {
    const hostConfig = await GlobalConfig.getHostConfig(host);
    const accessToken = hostConfig.auth?.accessToken;
    // No refresh token on a session in its last hour can be another process's refresh in flight: wait on its lock.
    if (!accessToken || !GlobalConfig.needRefreshToken(accessToken)) return new CloudApi(workspace, hostConfig);
    const tokenless = new CloudApi(workspace, hostConfig);
    const refreshed = await GlobalConfig.refreshHostAuth(hostConfig.host, (refreshToken) =>
      tokenless.refreshAuthToken(refreshToken),
    );
    return new CloudApi(workspace, refreshed);
  }
  constructor(workspace: Workspace, hostConfig: HostConfig) {
    this.#workspace = workspace;
    this.#accessToken = hostConfig.auth?.accessToken ?? null;
    this.host = hostConfig.host;
    this.url = `${this.host}/api`;
    this.#api = new HttpClient(this.url);
    if (this.#accessToken && !GlobalConfig.needRefreshToken(this.#accessToken))
      this.#api.setHeaders({ Authorization: `Bearer ${this.#accessToken.jwt}` });
  }

  #authorize(accessTokenDto: AccessTokenDto) {
    this.#accessToken = GlobalConfig.toAccessToken(accessTokenDto);
    this.#api.setHeaders({ Authorization: `Bearer ${this.#accessToken.jwt}` });
    return this.#accessToken;
  }

  async uploadEnv(devProjectId: string, file: File): Promise<boolean> {
    const formData = new FormData();
    formData.append("devProjectId", devProjectId);
    formData.append("file", file);
    return await this.#api.post<boolean>(`/uploadEnv/${devProjectId}`, formData);
  }
  async uploadSecret(devProjectId: string, secret: { scope: string; name: string; value: string }) {
    return await this.#api.post<PipelineSecretSummary>(`/uploadSecret/${encodeURIComponent(devProjectId)}`, secret);
  }
  async listSecrets(devProjectId: string) {
    return await this.#api.get<PipelineSecretListing[]>(`/listSecrets/${encodeURIComponent(devProjectId)}`);
  }
  async removeSecret(devProjectId: string, secret: { scope: string; name: string }) {
    return await this.#api.post<boolean>(`/removeSecret/${encodeURIComponent(devProjectId)}`, secret);
  }
  async downloadEnv(devProjectId: string): Promise<unknown> {
    const localPath = `${this.#workspace.workspaceRoot}/local/env.tar`;
    await this.#api.getFile(`/downloadEnv/${devProjectId}`, localPath);
    return localPath;
  }
  async getRemoteAuthToken(remoteId: string): Promise<AccessToken | null> {
    try {
      return this.#authorize(await this.#api.get<AccessTokenDto>(`/getRemoteAuthToken/${remoteId}`));
    } catch (_) {
      return null;
    }
  }
  async refreshAuthToken(refreshToken: string): Promise<AccessToken> {
    return this.#authorize(
      await this.#api.post<AccessTokenDto>(
        `/refreshAuthToken`,
        { refreshToken },
        { signal: AbortSignal.timeout(20_000) },
      ),
    );
  }
  // `/tunnel` is the model's refName, which the `_cloud` service routes above lack; dropping it answers 404.
  async requestTunnel(input: { name: string; ttlMinutes?: number }): Promise<TunnelGrant> {
    return await this.#api.post<TunnelGrant>(`/tunnel/requestTunnel`, input);
  }
  /** The generated name of the model's own `inSelf` slice: a hand-written `listTunnels` would collide with it. */
  async tunnelListInSelf(): Promise<TunnelSummary[]> {
    return await this.#api.get<TunnelSummary[]>(`/tunnel/tunnelListInSelf`);
  }
  // Bounded: callers are on the way out and an unreachable control plane would hold the event loop open; a lost
  // release costs nothing, since the share expires on its own TTL.
  async revokeTunnel(code: string): Promise<boolean> {
    return await this.#api.post<boolean>(`/tunnel/revokeTunnel`, { code }, { signal: AbortSignal.timeout(5_000) });
  }
  async getRemoteSelf(): Promise<{ id: string; nickname: string } | null> {
    try {
      return await this.#api.get<{ id: string; nickname: string }>(`/getRemoteSelf`);
    } catch {
      return null;
    }
  }
}
