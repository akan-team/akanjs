import { describe, expect, test } from "bun:test";
import { CloudHttpError } from "./cloudHttpError";

describe("CloudHttpError", () => {
  test("reads the server's Err key from the whole body, while the message keeps 200 characters of it", () => {
    const body = JSON.stringify({ details: "x".repeat(300), error: "release.error.uploadEmbedded", statusCode: 409 });
    const error = new CloudHttpError(409, "Conflict", "/commitUpdateUpload/p", body);

    expect(error.status).toBe(409);
    expect(error.errKey).toBe("release.error.uploadEmbedded");
    expect(error.message).toBe(`409 Conflict from /commitUpdateUpload/p: ${body.slice(0, 200)}`);
    expect(CloudHttpError.statusOf(error)).toBe(409);
    expect(CloudHttpError.statusOf(new Error("409 Conflict from /x: {}"))).toBeNull();
  });

  test("names no Err key for a proxy's page or an error that is not one", () => {
    expect(new CloudHttpError(503, "Service Unavailable", "/x", "<html>503</html>").errKey).toBeNull();
    const plain = new CloudHttpError(400, "Bad Request", "/x", '{"error":"Bad Request"}');
    expect(plain.error).toBe("Bad Request");
    expect(plain.errKey).toBeNull();
  });

  test("takes Retry-After as seconds or as a date, and nothing else", () => {
    expect(CloudHttpError.retryAfterMs("7")).toBe(7000);
    expect(CloudHttpError.retryAfterMs(new Date(Date.now() + 60_000).toUTCString())).toBeGreaterThan(55_000);
    expect(CloudHttpError.retryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
    expect(CloudHttpError.retryAfterMs("soon")).toBeNull();
    expect(CloudHttpError.retryAfterMs(null)).toBeNull();
    const headers = new Headers({ "Retry-After": "3" });
    expect(new CloudHttpError(429, "Too Many Requests", "/x", "", headers).retryAfterMs).toBe(3000);
  });
});
