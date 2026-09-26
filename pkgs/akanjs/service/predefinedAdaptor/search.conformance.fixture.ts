import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into } from "akanjs/document";

// The models `search.conformance.test.ts` searches, shared with the processes it boots in `search.conformance.instance.ts`.
class SearchConfHistory extends via((f) => ({
  action: f(String, { text: "tag" }),
  labels: f([String], { text: "tag" }),
})) {}
class SearchConfInput extends via((f) => ({
  headline: f(String, { text: "title" }),
  summary: f(String, { text: "desc" }).optional(),
  keywords: f([String], { text: "tag" }),
  cover: f(String, { text: "thumb" }).optional(),
  scope: f(String, { text: "filter" }).optional(),
  histories: f([SearchConfHistory]),
  rank: f(Int, { default: 0 }),
})) {}
class SearchConfObject extends via(SearchConfInput, (f) => ({ secretToken: f.secret(String).optional() })) {}
class SearchConfLight extends via(SearchConfObject, ["headline"] as const, () => ({})) {}
class SearchConfFull extends via(SearchConfObject, SearchConfLight, () => ({})) {}
class SearchConfInsight extends via(SearchConfFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
export const searchConfConstant = ConstantRegistry.buildModel(
  "searchConf",
  SearchConfInput,
  SearchConfObject,
  SearchConfFull,
  SearchConfLight,
  SearchConfInsight,
  { SearchConfInput, SearchConfObject, SearchConfFull, SearchConfLight, SearchConfInsight, SearchConfHistory },
);
class SearchConfFilter extends from(SearchConfFull, () => ({ query: {}, sort: {} })) {}
class SearchConfDoc extends by(SearchConfFull) {}
class SearchConfModel extends into(SearchConfDoc, SearchConfFilter, searchConfConstant, () => ({})) {}
export const searchConfDatabase = DatabaseRegistry.buildModel(
  "searchConf",
  SearchConfInput as unknown as DatabaseCls<InstanceType<typeof SearchConfInput>>,
  SearchConfDoc,
  SearchConfModel,
  SearchConfObject,
  SearchConfInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  SearchConfFilter,
);
