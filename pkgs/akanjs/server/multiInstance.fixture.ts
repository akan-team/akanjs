import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into } from "akanjs/document";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint } from "../signal/endpoint";
import { Public } from "../signal/guards";
import { internal } from "../signal/internal";
import { serverSignal } from "../signal/serverSignal";
import { DatabaseSignal } from "../signal/signalRegistry";
import { slice } from "../signal/slice";
import { AkanLib } from "./akanLib";
import { AkanOption } from "./akanOption";

// One model with a live list, served by several instances of one app in `multiInstance.conformance.test.ts`.
const CrossItemInput = via((f) => ({ title: f(String), category: f(String), score: f(Int, { default: 0 }) }));
const CrossItemObject = via(CrossItemInput, () => ({}));
const CrossItemLight = via(CrossItemObject, ["title", "category", "score"] as const, () => ({}));
const CrossItemFull = via(CrossItemObject, CrossItemLight, () => ({}));
const CrossItemInsight = via(CrossItemFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) }));
const crossItemConstant = ConstantRegistry.buildModel(
  "crossItem",
  CrossItemInput,
  CrossItemObject,
  CrossItemFull,
  CrossItemLight,
  CrossItemInsight,
  { CrossItemInput, CrossItemObject, CrossItemFull, CrossItemLight, CrossItemInsight },
);

class CrossItemFilter extends from(CrossItemFull, (filter) => ({
  query: {
    inCategory: filter()
      .arg("category", String)
      .query((category) => ({ category })),
  },
  sort: {},
})) {}
class CrossItemDoc extends by(CrossItemFull) {}
class CrossItemModel extends into(CrossItemDoc, CrossItemFilter, crossItemConstant, () => ({})) {}
const crossItemDatabase = DatabaseRegistry.buildModel(
  "crossItem",
  CrossItemInput as unknown as DatabaseCls<InstanceType<typeof CrossItemInput>>,
  CrossItemDoc,
  CrossItemModel,
  CrossItemObject,
  CrossItemInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  CrossItemFilter,
);

class CrossItemService extends serve(crossItemDatabase, () => ({})) {}
const crossItemServiceModel = ServiceModel.fromModel(CrossItemService, crossItemConstant, crossItemDatabase);

class CrossItemInternal extends internal(crossItemServiceModel, () => ({})) {}
class CrossItemEndpoint extends endpoint(crossItemServiceModel, () => ({})) {}
class CrossItemSlice extends slice(
  crossItemServiceModel,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inCategory: init()
      .param("category", String)
      .live()
      .exec(function (category) {
        return (this as unknown as { crossItemService: CrossItemService }).crossItemService.queryInCategory(category);
      }),
  }),
) {}
class CrossItemServerSignal extends serverSignal(CrossItemEndpoint, CrossItemInternal) {}

export const createCrossLib = () =>
  new AkanLib("crossTest", {
    databases: [
      {
        constant: crossItemConstant,
        database: crossItemDatabase,
        service: crossItemServiceModel,
        signal: new DatabaseSignal(CrossItemInternal, CrossItemEndpoint, CrossItemSlice, CrossItemServerSignal),
      },
    ],
    services: [],
    scalars: [],
    option: new AkanOption(),
  });
