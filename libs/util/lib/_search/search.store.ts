import { store, Toast } from "@akanjs/store";

import * as cnst from "../cnst";
import { fetch } from "../useClient";

export class SearchStore extends store("search" as const, {
  searchIndexName: null as string | null,
  searchIndexNames: [] as string[],
  searchDocumentsLoading: false,
  searchString: "",
  searchResult: cnst.searchResult.getDefault() as unknown as cnst.SearchResult,
  pageOfSearchDocuments: 1,
}) {
  async getSearchIndexNames() {
    const searchIndexNames = await fetch.getSearchIndexNames();
    this.set({ searchIndexNames });
  }
  async setSearchIndexName(searchIndexName: string) {
    this.set({ searchIndexName, searchDocumentsLoading: true });
    const searchResult = await fetch.getSearchResult(searchIndexName);
    this.set({ searchResult, searchDocumentsLoading: false });
  }
  @Toast()
  async resyncSearchDocuments() {
    const { searchIndexName } = this.get();
    if (!searchIndexName) throw new Error("searchIndexName is required");
    await fetch.resyncSearchDocuments(searchIndexName);
    await this.setSearchIndexName(searchIndexName);
  }
  async setSearchString(searchString: string) {
    const { searchIndexName, searchResult } = this.get();
    if (!searchIndexName) return;
    this.set({ searchString, searchDocumentsLoading: true });
    const newSearchResult = await fetch.getSearchResult(
      searchIndexName,
      searchString,
      searchResult.skip,
      searchResult.limit
    );
    this.set({ searchResult: newSearchResult, searchDocumentsLoading: false });
  }
  async setPageOfSearchDocuments(page: number) {
    const { searchIndexName, searchResult, searchString } = this.get();
    if (!searchIndexName) return;
    this.set({ pageOfSearchDocuments: page, searchDocumentsLoading: true });
    const newSearchResult = await fetch.getSearchResult(
      searchIndexName,
      searchString,
      (page - 1) * searchResult.limit,
      searchResult.limit
    );
    this.set({ searchResult: newSearchResult, searchDocumentsLoading: false });
  }
}
