import { describe, expect, test } from "bun:test";
import { ENDPOINT_META } from "akanjs/base";
import { modelNames } from "akanjs/common";
import type { EndpointInfo } from "../../signal/endpointInfo";
import { Public } from "../../signal/guards";
import { type SliceCls, slice } from "../../signal/slice";
import { serverResolverTestServiceModel } from "./resolver.contract.fixture";
import { SignalResolver } from "./signal.resolver";

const crudShelves = (sliceCls: SliceCls) => {
  const meta = SignalResolver.resolveSlice(sliceCls)[ENDPOINT_META] as { [key: string]: EndpointInfo };
  const names = modelNames("serverResolverTestItem");
  return [names.model, names.lightModel, names.createModel, names.updateModel, names.removeModel].map(
    (key) => meta[key]?.signalOption.mcp,
  );
};

describe("SliceCrud", () => {
  test("puts each verb's mcp shelf on its generated endpoint, where a server-side reader finds it", () => {
    class ShelvedSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: Public, cru: Public }, mcp: { get: false, cru: "agent", remove: true } },
      () => ({}),
    ) {}
    class ListedSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: Public, cru: Public } },
      () => ({}),
    ) {}
    expect(crudShelves(ShelvedSlice)).toEqual([false, false, "agent", "agent", undefined]);
    expect(crudShelves(ListedSlice)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});
