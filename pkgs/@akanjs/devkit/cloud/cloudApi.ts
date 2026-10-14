import type { Workspace } from "../commandDecorators";
import { CloudHttpError } from "./cloudHttpError";
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
    if (!response.ok) throw await CloudHttpError.of(response, url);
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
    if (!response.ok) throw await CloudHttpError.of(response, url);
    return JSON.parse(await response.text()) as T;
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
  updatedBy: string | null;
}

/** What Akan Cloud answers for an uploaded pack or a registered binary; a pack's release also says how it was taken. */
export interface CloudRecord {
  id: string;
  status?: string;
  problems?: string[];
  [key: string]: unknown;
}

export interface UpdateUploadRequest {
  appName: string;
  target: string;
  platform: "ios" | "android";
  channel: string;
  notes: string | null;
  size: number;
  sha256: string;
}

export interface UpdateUploadTicket {
  uploadId: string;
  /** A presigned PUT: whoever holds it writes the staging object, so it is never logged or put in an argv. */
  uploadUrl: string;
  expiresAt: string;
  contentType: string;
}

export type AppBinaryDistribution = "appStore" | "testFlight" | "playStore" | "playTesting" | "direct";

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
  //* The project's guards answer by status: 401 no sign-in it accepts, 403 not allowed, 400 a refused request.
  static refusal(error: unknown, who: string, { unavailable }: { unavailable?: string } = {}) {
    if (!(error instanceof CloudHttpError)) return error;
    if (error.status === 401)
      return new Error("The server did not accept your sign-in: run `akan login`, then try again.", { cause: error });
    if (error.status === 403) return new Error(`The project refused: ${who}.`, { cause: error });
    if (error.status === 400)
      return new Error(`The project refused the request${error.error ? `: ${error.error}` : ""}.`, { cause: error });
    //? A proxy, or the gateway with no replica ready, answers 503 too; only the server's own names a domain Err key.
    const { errKey } = error;
    if (error.status === 503 && unavailable && errKey && errKey !== "base.error.serverUnavailable")
      return new Error(`${unavailable}: ${errKey}.`, { cause: error });
    return error;
  }
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
  async requestUpdateUpload(devProjectId: string, upload: UpdateUploadRequest) {
    return await this.#api.post<UpdateUploadTicket>(`/requestUpdateUpload/${encodeURIComponent(devProjectId)}`, upload);
  }
  // The endpoint declares ten minutes; Cloudflare cuts at 100 s anyway, which is what UpdatePackUpload's retry is for.
  async commitUpdateUpload(devProjectId: string, uploadId: string) {
    return await this.#api.post<CloudRecord>(
      `/commitUpdateUpload/${encodeURIComponent(devProjectId)}`,
      { uploadId },
      { signal: AbortSignal.timeout(11 * 60_000) },
    );
  }
  async registerAppBinary(
    devProjectId: string,
    binary: {
      appName: string;
      target: string;
      distribution: AppBinaryDistribution;
      bundle: Blob;
      /** The pack staged with UpdatePackUpload.stage. */
      packUploadId: string;
      channel?: string;
    },
  ) {
    const formData = new FormData();
    for (const key of ["appName", "target", "distribution"] as const) formData.append(key, binary[key]);
    if (binary.channel) formData.append("channel", binary.channel);
    formData.append("bundle", binary.bundle, "bundle.json");
    formData.append("packUploadId", binary.packUploadId);
    return await this.#api.post<CloudRecord>(`/registerAppBinary/${encodeURIComponent(devProjectId)}`, formData, {
      signal: AbortSignal.timeout(11 * 60_000),
    });
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
