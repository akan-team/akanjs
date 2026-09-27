import { beforeAll, describe, expect, test } from "bun:test";
import { getOrSetupSignalTestFetch } from "akanjs/test";

type UtilFetch = typeof import("../../server").fetch;

let fetch: UtilFetch;

describe("Security Signal", () => {
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<UtilFetch>();
  });

  test("should ping successfully", async () => {
    const ping = await fetch.ping();
    expect(ping).toEqual("ping");
  });

  test("should ping with body successfully", async () => {
    const pingBody = await fetch.pingBody("pingBody");
    expect(pingBody).toEqual("pingBody: pingBody");
  });

  test("should ping with param successfully", async () => {
    const pingParam = await fetch.pingParam("pingParam");
    expect(pingParam).toEqual("pingParam: pingParam");
  });

  test("should ping with query successfully", async () => {
    const pingQuery = await fetch.pingQuery("pingQuery");
    expect(pingQuery).toEqual("pingQuery: pingQuery");
  });

  test("should encrypt successfully", async () => {
    const encrypt = await fetch.encrypt("encrypt");
    expect(typeof encrypt).toEqual("string");
    expect(encrypt.length).toBeGreaterThan(0);
    expect(encrypt).not.toEqual("encrypt");
  });
});
