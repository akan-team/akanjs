export interface DnsInput {
  name: string;
  type: string;
  content: string;
}
export type Dns = DnsInput & {
  id: string;
};
export interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: unknown[];
}
