export type LoginAuth = "user" | "admin" | "public";
export interface LoginForm {
  auth: LoginAuth;
  redirect?: string;
  unauthorize?: string;
  jwt?: string | null;
}
