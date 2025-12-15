import { fetch } from "../../server";

describe("Security Signal", () => {
  it("should ping successfully", async () => {
    const ping = await fetch.ping();
    expect(ping).toEqual("ping");
  });

  it("should ping with body successfully", async () => {
    const pingBody = await fetch.pingBody("pingBody");
    expect(pingBody).toEqual(JSON.stringify("pingBody"));
  });

  it("should ping with param successfully", async () => {
    const pingParam = await fetch.pingParam("pingParam");
    expect(pingParam).toEqual("pingParam");
  });

  it("should ping with query successfully", async () => {
    const pingQuery = await fetch.pingQuery("pingQuery");
    expect(pingQuery).toEqual("pingQuery");
  });

  it("should encrypt successfully", async () => {
    const encrypt = await fetch.encrypt("encrypt");
    expect(typeof encrypt).toEqual("string");
  });
});
