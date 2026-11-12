# `akanjs/client/native/http`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type BodyEncoding = "base64" | "utf8";

export interface FetchOptions {
    method?: string;
    headers?: HeadersInit;
    body?: ArrayBuffer | ArrayBufferView | URLSearchParams | null | string;
    timeout?: number;
    signal?: AbortSignal;
}

export type Http = Plugin<HttpApi>;

export interface HttpApi {
    request(options: HttpRequestOptions & {
        responseType: "json";
    }): Promise<HttpResponse<unknown>>;
    request(options: HttpRequestOptions & {
        responseType?: NativeResponseType;
    }): Promise<HttpResponse<string>>;
    request(options: HttpRequestOptions): Promise<HttpResponse<unknown>>;
}

export type HttpMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";

export interface HttpRequestOptions extends Omit<NativeRequest, "responseType"> {
    responseType?: ResponseType;
}

export interface HttpResponse<T = string> extends Omit<NativeResponse, "data"> {
    data: T;
}

export interface HttpSpec {
    request(options: NativeRequest): Promise<NativeResponse>;
}

export interface NativeRequest {
    url: string;
    method?: HttpMethod;
    headers?: Record<string, string>;
    body?: string;
    bodyEncoding?: BodyEncoding;
    responseType?: NativeResponseType;
    timeout?: number;
}

export interface NativeResponse {
    status: number;
    headers: Record<string, string>;
    data: string;
    url: string;
}

export type NativeResponseType = "base64" | "text";

export type ResponseType = "json" | NativeResponseType;

export declare function fetch(input: URL | string, init?: FetchOptions): Promise<Response>;

export declare const http: Http;
```
