import type { PushEvent } from "@octokit/webhooks-types";
import type { Dayjs } from "akanjs/base";

export type GithubPushEvent = PushEvent;

export type GithubRepositoryDto = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  created_at: string;
};

export type GithubContentDto = {
  name: string;
  type: "file" | "dir" | "symlink" | "submodule";
};
export type GithubRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string;
  createdAt: string;
};

export type GithubAccessTokenDto = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
};
export type GithubAccessToken = {
  accessToken: string;
  expiresAt: Dayjs;
  refreshToken: string;
};

export type GithubInstallationAccessTokenDto = {
  token?: string;
  expires_at?: string;
};

export type GithubInstallationRepositoriesDto = {
  repositories?: GithubRepositoryDto[];
};

export type GithubInstallationDto = {
  id: number;
  account?: {
    login?: string;
  };
};

export type GithubUserInstallationsDto = {
  installations?: GithubInstallationDto[];
};

export type GithubInstallationAccessToken = {
  accessToken: string;
  expiresAt: Dayjs;
};

export type GithubInstallation = {
  id: string;
  accountLogin: string;
};

export type GithubInfoDto = {
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
};

export type GithubInfo = {
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
};

export type GithubApiError = {
  message?: string;
  errors?: { resource?: string; field?: string; code?: string; message?: string }[];
  documentation_url?: string;
};

export interface GithubOptions {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  privateKey?: string;
  webhookSecret: string;
}
