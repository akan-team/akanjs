import type { Account } from "akanjs/fetch";

export type AccessAccount = Account & { tokenType?: string };
export type ReqType = Bun.BunRequest & {
  userAgent?: string;
  account?: Account;
};
