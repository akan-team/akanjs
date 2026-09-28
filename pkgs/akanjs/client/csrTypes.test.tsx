import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useCsr } from "./csrTypes";

describe("useCsr outside the CSR shell", () => {
  test("hands out empty refs, so a component reading one on the web sees no element instead of crashing", () => {
    const Probe = () => {
      const { pageContentRef, prevPageContentRef, frameRootRef, topSafeAreaRef, bottomSafeAreaRef } = useCsr();
      const refs = [pageContentRef, prevPageContentRef, frameRootRef, topSafeAreaRef, bottomSafeAreaRef];
      return <p>{refs.map((ref) => String(ref.current)).join(",")}</p>;
    };
    expect(renderToStaticMarkup(<Probe />)).toBe("<p>null,null,null,null,null</p>");
  });
});
