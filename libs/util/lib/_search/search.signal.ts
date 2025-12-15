import { Int } from "@akanjs/base";
import { endpoint, internal } from "@akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class SearchInternal extends internal(srv.search, () => ({})) {}

export class SearchEndpoint extends endpoint(srv.search, ({ query }) => ({
  getSearchIndexNames: query([String]).exec(async function () {
    return this.searchService.getSearchIndexNames();
  }),
  getSearchResult: query(cnst.SearchResult) //! TODO: Add guards, { guards: [Admin] })
    .param("searchIndexName", String)
    .search("searchString", String)
    .search("skip", Int)
    .search("limit", Int)
    .search("sort", String)
    .exec(async function (searchIndexName, searchString, skip, limit, sort) {
      return await this.searchService.getSearchResult(searchIndexName, {
        skip: skip ?? undefined,
        limit: limit ?? undefined,
        sort: sort ?? undefined,
        searchString: searchString ?? undefined,
      });
    }),
  resyncSearchDocuments: query(Boolean) //! TODO: Add guards, { guards: [Admin] })
    .param("searchIndexName", String)
    .exec(async function (searchIndexName) {
      await this.searchService.resyncSearchDocuments(searchIndexName);
      return true;
    }),
  dropSearchDocuments: query(Boolean) //! TODO: Add guards, { guards: [Admin] })
    .param("searchIndexName", String)
    .exec(async function (searchIndexName) {
      await this.searchService.dropSearchDocuments(searchIndexName);
      return true;
    }),
})) {}
