import type { Account } from "akanjs/fetch";

export type AccessAccount = Account & { tokenType?: string };
export type ReqType = Bun.BunRequest & {
  "user-agent"?: string;
  userAgent?: string;
  account?: Account;
};
