import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { mount, setTestEnv } from "../testHelpers.fixture";

let Back: typeof import("./Action").Back;
const calls: string[] = [];
let canGoBack = true;

beforeAll(async () => {
  setTestEnv("linkactiontest");
  const { router } = await import("akanjs/client");
  router.init({
    type: "csr",
    lang: "en",
    router: {
      push: (href) => void calls.push(`push ${href}`),
      replace: (href) => void calls.push(`replace ${href}`),
      back: () => void calls.push("back"),
      refresh: () => undefined,
      canGoBack: () => canGoBack,
    },
  });
  ({ Back } = await import("./Action"));
});

describe("Link.Back", () => {
  test("is one button, with or without a fallback, and goes back while there is history", async () => {
    const plain = mount(<Back className="text-4xl">back</Back>);
    const withFallback = mount(<Back fallback="/home">back</Back>);
    const plainButton = plain.container.querySelector("button");
    const fallbackButton = withFallback.container.querySelector("button");

    expect(plainButton?.getAttribute("type")).toBe("button");
    expect(plainButton?.className).toContain("text-4xl");
    expect(fallbackButton?.getAttribute("type")).toBe("button");
    calls.length = 0;
    plainButton?.click();
    fallbackButton?.click();
    expect(calls).toEqual(["back", "back"]);

    canGoBack = false;
    calls.length = 0;
    fallbackButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["replace /en/home"]);
    plain.unmount();
    withFallback.unmount();
  });
});
