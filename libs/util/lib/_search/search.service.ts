import { capitalize } from "@akanjs/common";
import { constantInfo, type TextDoc } from "@akanjs/constant";
import type { DatabaseClient, SearchClient } from "@akanjs/nest";
import { makeTextFilter } from "@akanjs/server";
import { serve } from "@akanjs/service";

import type * as cnst from "../cnst";

export class SearchService extends serve("search" as const, ({ use }) => ({
  searchClient: use<SearchClient>(),
  databaseClient: use<DatabaseClient>(),
})) {
  async getSearchIndexNames() {
    return await this.searchClient.getIndexNames();
  }
  async getSearchResult(
    searchIndexName: string,
    options: { skip?: number; limit?: number; sort?: string; searchString?: string }
  ): Promise<cnst.SearchResult> {
    return await this.searchClient.getSearchResult(searchIndexName, options);
  }
  async dropSearchDocuments(searchIndexName: string) {
    return await this.searchClient.dropIndex(searchIndexName);
  }
  async resyncSearchDocuments(searchIndexName: string) {
    const BATCH_SIZE = 1000;
    const modelName = capitalize(searchIndexName);
    const modelRef = constantInfo.getDatabase(searchIndexName).full;
    const model = this.databaseClient.getModel(modelName);
    const totalCount = await model.countDocuments({ removedAt: { $exists: false } });
    const filterText = makeTextFilter(modelRef);
    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
      const docs = (await model
        .find({ removedAt: { $exists: false } })
        .skip(i)
        .limit(BATCH_SIZE)) as TextDoc[];
      const textDocs = docs.map((doc) => filterText(doc, { id: doc.id as string }));
      await this.searchClient.upsertDocuments(searchIndexName, textDocs);
    }
  }
}
