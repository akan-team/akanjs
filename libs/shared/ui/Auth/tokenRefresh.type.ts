export type AuthScope = "user" | "admin";

export interface TokenPayload {
  iat?: number;
  exp?: number;
  self?: { id: string };
  me?: { id: string };
}
