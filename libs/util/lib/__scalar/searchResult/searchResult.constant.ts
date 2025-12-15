import { Int, JSON } from "@akanjs/base";
import { DEFAULT_PAGE_SIZE, type TextDoc, via } from "@akanjs/constant";

export class SearchResult extends via((field) => ({
  docs: field<TextDoc[]>(JSON, { default: [] }),
  skip: field(Int, { default: 0 }),
  limit: field(Int, { default: DEFAULT_PAGE_SIZE }),
  sort: field(String, { default: "notImplemented" }),
  total: field(Int, { default: 0 }),
})) {}
