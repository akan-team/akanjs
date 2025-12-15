import type { RequestPolicy } from "@urql/core";

export interface FetchPolicy<Returns = any> {
  cache?: boolean | number | RequestPolicy;
  crystalize?: boolean;
  url?: string;
  onError?: (error: string) => void;
  token?: string;
  partial?: string[];
  transport?: "udp" | "websocket" | "graphql" | "restapi";
  timeout?: number;
}

export type SnakeCase<S extends string> = S extends `${infer T}_${infer U}` ? `${Lowercase<T>}_${SnakeCase<U>}` : S;
export type SnakeCaseObj<T> = {
  [K in keyof T as SnakeCase<K & string>]: T[K] extends object ? SnakeCaseObj<T[K]> : T[K];
};
export type SnakeMsg<Msg> = SnakeCaseObj<Msg>;
