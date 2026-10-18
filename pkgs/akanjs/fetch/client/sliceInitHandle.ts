import { DataList } from "akanjs/base";
import { type BaseInsight, type BaseObject, withSharedInstances } from "akanjs/constant";

import { FetchHandle } from "./fetchHandle";

export interface SliceInitInput {
  refName: string;
  capRefName: string;
  capSuffix: string;
  sliceName: string;
  argLength: number;
  queryArgs: unknown[];
  page: number;
  limit: number;
  sort: string;
  listRequest: Promise<BaseObject[]>;
  /** `null` when the caller passed `{ insight: false }` — the aggregate query is then never made. */
  insightRequest: Promise<BaseInsight | null>;
  light: new (obj?: unknown) => BaseObject;
  insight: new (obj?: unknown) => object;
}

/**
 * `x<Slice>List` resolves when the rows land; `x<Slice>Init` needs the count (`lastPageOf<Model>`) and waits for
 * both. Derived values are memoized, so the awaited shape and the handle share instances.
 */
export class SliceInitHandle {
  readonly #input: SliceInitInput;
  #serverInit?: object;
  #modelList?: DataList<BaseObject>;
  #modelInsight?: object;

  constructor(input: SliceInitInput) {
    this.#input = input;
  }

  build() {
    const { refName, capSuffix, listRequest, insightRequest } = this.#input;
    const keys = {
      init: `${refName}Init${capSuffix}`,
      list: `${refName}List${capSuffix}`,
      insight: `${refName}Insight${capSuffix}`,
    };
    return FetchHandle.of<Record<string, unknown>, Record<string, Promise<unknown>>>(
      [listRequest, insightRequest],
      async () => {
        const [modelObjList, modelObjInsight] = await Promise.all([listRequest, insightRequest]);
        return FetchHandle.lazy({ [keys.init]: this.#serverInitOf(modelObjList, modelObjInsight) }, {
          [keys.list]: () => this.#listOf(modelObjList),
          [keys.insight]: () => this.#insightOf(modelObjInsight),
        } as { [key: string]: () => unknown });
      },
      {
        [keys.init]: () =>
          Promise.all([listRequest, insightRequest]).then(([modelObjList, modelObjInsight]) =>
            this.#serverInitOf(modelObjList, modelObjInsight),
          ),
        [keys.list]: () => listRequest.then((modelObjList) => this.#listOf(modelObjList)),
        [keys.insight]: () => insightRequest.then((modelObjInsight) => this.#insightOf(modelObjInsight)),
      },
    );
  }

  #serverInitOf(modelObjList: BaseObject[], modelObjInsight: BaseInsight | null) {
    const { refName, capRefName, sliceName, argLength, queryArgs, page, limit, sort } = this.#input;
    const lastPage =
      modelObjInsight?.count && limit > 0 ? Math.max(Math.floor((modelObjInsight.count - 1) / limit) + 1, 1) : 1;
    this.#serverInit ??= {
      refName,
      sliceName,
      argLength,
      [`${refName}ObjList`]: modelObjList,
      [`${refName}ObjInsight`]: modelObjInsight,
      [`pageOf${capRefName}`]: page,
      [`lastPageOf${capRefName}`]: lastPage,
      [`limitOf${capRefName}`]: limit,
      // Off the batch, not the count: `{ insight: false }` has none, and the store derives it the same way.
      [`hasMoreOf${capRefName}`]: !!limit && modelObjList.length >= limit,
      [`queryArgsOf${capRefName}`]: queryArgs,
      [`sortOf${capRefName}`]: sort,
      [`${refName}InitAt`]: new Date(),
    };
    return this.#serverInit;
  }

  // A route hands `xInit` down and never reads the list, so the instances are built only for a caller that does.
  #listOf(modelObjList: BaseObject[]) {
    const { light } = this.#input;
    this.#modelList ??= new DataList(
      withSharedInstances(() => modelObjList.map((modelObj) => new light(modelObj) as BaseObject)),
    );
    return this.#modelList;
  }

  #insightOf(modelObjInsight: BaseInsight | null) {
    const { insight } = this.#input;
    this.#modelInsight ??= new insight(modelObjInsight);
    return this.#modelInsight;
  }
}
