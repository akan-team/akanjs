import { DEFAULT_PAGE_SIZE, type TextDoc } from "@akanjs/constant";
import { Inject, Injectable } from "@nestjs/common";
import { default as MeiliSearch } from "meilisearch";

@Injectable()
export class SearchClient {
  @Inject("MEILI_CLIENT") meili: MeiliSearch;

  async getIndexNames() {
    const { results } = await this.meili.getIndexes({ limit: 1000 });
    return results.map((index) => index.uid);
  }
  async getSearchResult(
    indexName: string,
    option: { skip?: number; limit?: number; sort?: string; searchString?: string }
  ) {
    const { skip = 0, limit = DEFAULT_PAGE_SIZE, sort = "", searchString } = option;
    if (!searchString) {
      const { results, total } = await this.meili.index(indexName).getDocuments({ offset: skip, limit });
      return { docs: results, skip, limit, sort, total };
    }
    const { hits, estimatedTotalHits } = await this.meili
      .index(indexName)
      .search(searchString, { offset: skip, limit });
    return { docs: hits, skip, limit, sort, total: estimatedTotalHits, query: searchString };
  }
  async upsertDocuments(indexName: string, documents: TextDoc[]) {
    const task = await this.meili.index(indexName).addDocuments(documents);
    return task;
  }
  async dropIndex(indexName: string) {
    const task = await this.meili.index(indexName).delete();
    return task;
  }
}
