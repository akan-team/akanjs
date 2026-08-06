export type AuthScope = "user" | "admin";

export interface TokenPayload {
  exp?: number;
  self?: { id: string };
  me?: { id: string };
}
