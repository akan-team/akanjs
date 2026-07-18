export interface FetchPolicy<Returns = unknown> {
  cache?: boolean | number;
  crystalize?: boolean;
  origin?: string;
  onError?: (error: string) => void;
  token?: string;
  partial?: string[];
  timeout?: number;
}

export type SnakeCase<S extends string> = S extends `${infer T}_${infer U}` ? `${Lowercase<T>}_${SnakeCase<U>}` : S;
export type SnakeCaseObj<T> = {
  [K in keyof T as SnakeCase<K & string>]: T[K] extends object ? SnakeCaseObj<T[K]> : T[K];
};
export type SnakeMsg<Msg> = SnakeCaseObj<Msg>;
