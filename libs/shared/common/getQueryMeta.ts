import { QueryMeta } from "./queryMeta";
import type { AnyFilterShape } from "./queryMeta.helper";

export const getQueryMeta = <Filter = AnyFilterShape>(refName: string) => new QueryMeta<Filter>(refName);
