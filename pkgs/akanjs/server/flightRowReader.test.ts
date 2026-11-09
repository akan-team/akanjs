import { describe, expect, test } from "bun:test";
import path from "node:path";
import { FLIGHT_LENGTH_PREFIXED_TAGS } from "./flightRowReader";

describe("Flight row reader", () => {
  test("reads by length exactly the row tags the installed Flight client reads by length", async () => {
    const packageDir = path.dirname(Bun.resolveSync("react-server-dom-webpack/package.json", import.meta.dir));
    const client = await Bun.file(
      path.join(packageDir, "cjs/react-server-dom-webpack-client.browser.production.js"),
    ).text();
    const tagState = /rowState = \w+\[i\];([^?]*)\?\s*\(\(rowTag = rowState\), \(rowState = 2\)/g;
    const [tagCheck = ""] = Array.from(client.matchAll(tagState), ([, block]) => block);
    const tags = [...tagCheck.matchAll(/(\d+) === rowState/g)].map(([, code]) => String.fromCharCode(Number(code)));

    expect(new Set(tags)).toEqual(new Set(FLIGHT_LENGTH_PREFIXED_TAGS));
  });
});
