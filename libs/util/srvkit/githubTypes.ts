import type { PushEvent } from "@octokit/webhooks-types";
import type { Dayjs } from "akanjs/base";

export type GithubPushEvent = PushEvent;

export interface GithubRepoRef {
  owner: string;
  repo: string;
  accessToken: string;
}

export interface GithubRepositoryDto {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  created_at: string;
}

export interface GithubContentDto {
  name: string;
  type: "file" | "dir" | "symlink" | "submodule";
  /** Present only for `type: "file"`, and only under the contents API's size limit. */
  content?: string;
  encoding?: string;
}
export interface GithubCompareDto {
  /** `ahead` when base is an ancestor of head, the only status whose files are the whole difference between them. */
  status?: "ahead" | "behind" | "diverged" | "identical";
  files?: { filename: string; previous_filename?: string }[];
}
export interface GithubWebhookDto {
  id: number;
  active?: boolean;
  config?: { url?: string };
}
export interface GithubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string;
  createdAt: string;
}

export interface GithubAccessTokenDto {
  access_token: string;
  //? Absent when the app does not expire user tokens.
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}
export interface GithubOAuthErrorDto {
  error?: string;
  error_description?: string;
}
export interface GithubAccessToken {
  accessToken: string;
  expiresAt: Dayjs;
  refreshToken?: string;
}

export interface GithubInstallationAccessTokenDto {
  token?: string;
  expires_at?: string;
}

export interface GithubInstallationRepositoriesDto {
  repositories?: GithubRepositoryDto[];
}

export interface GithubInstallationDto {
  id: number;
  account?: {
    login?: string;
  };
}

export interface GithubUserInstallationsDto {
  installations?: GithubInstallationDto[];
}

export interface GithubInstallationAccessToken {
  accessToken: string;
  expiresAt: Dayjs;
}

export interface GithubInstallation {
  id: string;
  accountLogin: string;
}

export interface GithubInfoDto {
  id: number;
  login: string;
  node_id: string;
  type: string;
  name: string;
  site_admin: boolean;
  installation_id: string;
  company: string;
  blog: string;
  location: string;
  email: string;
}

export interface GithubInfo {
  id: string;
  login: string;
  nodeId: string;
  type: string;
  name: string;
  siteAdmin: boolean;
  installationId: string;
  company: string;
  blog: string;
  location: string;
  email: string;
}

export interface GithubApiError {
  message?: string;
  errors?: { resource?: string; field?: string; code?: string; message?: string }[];
  documentation_url?: string;
}

export interface GithubOptions {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  privateKey?: string;
  webhookSecret: string;
}
