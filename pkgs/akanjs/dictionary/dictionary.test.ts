import { describe, expect, test } from "bun:test";
import type { ENDPOINT_DICT_SHAPE, FILTER_DICT_SHAPE, SLICE_DICT_SHAPE } from "akanjs/base";
import type { FilterCls, FilterInfo } from "akanjs/document";
import type { ServiceModel } from "akanjs/service";
import type { EndpointCls, EndpointInfo, SliceCls, SliceInfo } from "akanjs/signal";
import { modelDictionary, scalarDictionary, serviceDictionary } from "./dictInfo";
import { makeDictionary, makeTrans } from "./trans";

type AssertTrue<T extends true> = T;

type TestModel = {
  title: string;
  status: string;
};
type TestInsight = {
  total: number;
};
type TestFilter = {
  query: {
    byTitle: FilterInfo<["title"]>;
  };
  sort: {
    popular: -1;
  };
};
type TestEnum = {
  refName: "dictionaryTestStatus";
  value: "active" | "archived";
};
type TestSlice = {
  active: SliceInfo<
    "dictionaryTestItem",
    unknown,
    unknown,
    unknown,
    unknown,
    TestFilter,
    Record<string, unknown>,
    ["status"]
  >;
};
type TestEndpoint = {
  publish: EndpointInfo<"query", Record<string, unknown>, ["payload"]>;
};
type TestFilterCls = FilterCls<TestFilter>;
type TestEndpointCls = EndpointCls<ServiceModel, TestEndpoint>;
type TestSliceCls = SliceCls<ServiceModel, TestSlice & { "": SliceInfo }>;
type TestFilterInstance = TestFilterCls["prototype"];
type TestEndpointInstance = TestEndpointCls["prototype"];
type TestSliceInstance = TestSliceCls["prototype"];
type _FilterInstanceCarriesDictShape = AssertTrue<
  TestFilterInstance extends { readonly [FILTER_DICT_SHAPE]: infer Shape extends { query: object } }
    ? "byTitle" extends keyof Shape["query"]
      ? true
      : false
    : false
>;
type _EndpointInstanceCarriesDictShape = AssertTrue<
  TestEndpointInstance extends { readonly [ENDPOINT_DICT_SHAPE]: infer Shape }
    ? "publish" extends keyof Shape
      ? true
      : false
    : false
>;
type _SliceInstanceCarriesDictShape = AssertTrue<
  TestSliceInstance extends { readonly [SLICE_DICT_SHAPE]: infer Shape }
    ? "active" extends keyof Shape
      ? true
      : false
    : false
>;
type TestScalar = {
  value: number;
};
type TestScalarEnum = {
  refName: "dictionaryTestScalarUnit";
  value: "byte";
};
type TestServiceEndpoint = {
  ping: EndpointInfo<"query", Record<string, unknown>, ["body"]>;
};

const languages: [string, string, string, string] = ["en", "ko", "zhChs", "ja"];

const assertDictionaryTypeCoverage = () => {
  // @ts-expect-error missing model field translations must be rejected
  modelDictionary(languages).model<TestModel>((t) => ({
    title: t(["Title", "제목", "标题", "タイトル"]),
  }));

  // @ts-expect-error missing insight field translations must be rejected
  modelDictionary(languages).insight<TestInsight>((t) => ({}));

  // @ts-expect-error missing query translations must be rejected
  modelDictionary(languages).query<TestFilter>((fn) => ({}));

  // @ts-expect-error missing query translations from static filter metadata must be rejected
  modelDictionary(languages).query<TestFilterCls>((fn) => ({}));

  // @ts-expect-error missing query translations from filter instance metadata must be rejected
  modelDictionary(languages).query<TestFilterInstance>((fn) => ({}));

  modelDictionary(languages).query<TestFilterInstance>((fn) => ({
    // @ts-expect-error query arg translations must match filter instance metadata
    byTitle: fn(["By Title", "제목별 조회", "按标题查询", "タイトルで検索"]),
  }));

  // @ts-expect-error missing enum value translations must be rejected
  modelDictionary(languages).enum<TestEnum>("dictionaryTestStatus", (t) => ({
    active: t(["Active", "활성", "启用", "有効"]),
  }));

  // @ts-expect-error missing slice translations from static slice metadata must be rejected
  modelDictionary(languages).slice<TestSliceCls>((fn) => ({}));

  // @ts-expect-error missing slice translations from slice instance metadata must be rejected
  modelDictionary(languages).slice<TestSliceInstance>((fn) => ({}));

  modelDictionary(languages).slice<TestSliceInstance>((fn) => ({
    // @ts-expect-error slice arg translations must match slice instance metadata
    active: fn(["Active Items", "활성 항목", "启用项目", "有効な項目"]),
  }));

  // @ts-expect-error missing endpoint translations from static endpoint metadata must be rejected
  modelDictionary(languages).endpoint<TestEndpointCls>((fn) => ({}));

  // @ts-expect-error missing endpoint translations from endpoint instance metadata must be rejected
  modelDictionary(languages).endpoint<TestEndpointInstance>((fn) => ({}));

  modelDictionary(languages).endpoint<TestEndpointCls>((fn) => ({
    // @ts-expect-error endpoint arg translations must match endpoint metadata
    publish: fn(["Publish", "게시", "发布", "公開"]),
  }));

  modelDictionary(languages).endpoint<TestEndpointInstance>((fn) => ({
    // @ts-expect-error endpoint arg translations must match endpoint instance metadata
    publish: fn(["Publish", "게시", "发布", "公開"]),
  }));

  // @ts-expect-error service endpoint translations use the same static endpoint metadata
  serviceDictionary(languages).endpoint<TestEndpointCls>((fn) => ({}));

  // @ts-expect-error service endpoint translations use endpoint instance metadata too
  serviceDictionary(languages).endpoint<TestEndpointInstance>((fn) => ({}));
};
void assertDictionaryTypeCoverage;

const modelDict = modelDictionary(languages)
  .of((t) =>
    t(["Dictionary Test Item", "사전 테스트 항목", "字典测试项目", "辞書テスト項目"]).desc([
      "Dictionary test item description",
      "사전 테스트 항목 설명",
      "字典测试项目说明",
      "辞書テスト項目の説明",
    ]),
  )
  .model<TestModel>((t) => ({
    title: t(["Title", "제목", "标题", "タイトル"]).desc([
      "Title description",
      "제목 설명",
      "标题说明",
      "タイトルの説明",
    ]),
    status: t(["Status", "상태", "状态", "ステータス"]).desc([
      "Status description",
      "상태 설명",
      "状态说明",
      "ステータスの説明",
    ]),
  }))
  .insight<TestInsight>((t) => ({
    total: t(["Total", "합계", "总计", "合計"]).desc(["Total description", "합계 설명", "总计说明", "合計の説明"]),
  }))
  .query<TestFilter>((fn) => ({
    byTitle: fn(["By Title", "제목별 조회", "按标题查询", "タイトルで検索"])
      .desc(["Search by title", "제목으로 조회", "按标题搜索", "タイトルで検索する"])
      .arg((t) => ({
        title: t(["Title Query", "제목 쿼리", "标题查询", "タイトルクエリ"]).desc([
          "Title query description",
          "제목 쿼리 설명",
          "标题查询说明",
          "タイトルクエリの説明",
        ]),
      })),
  }))
  .sort<TestFilter>((t) => ({
    popular: t(["Popular", "인기순", "热门", "人気順"]).desc([
      "Popular description",
      "인기순 설명",
      "热门说明",
      "人気順の説明",
    ]),
  }))
  .enum<TestEnum>("dictionaryTestStatus", (t) => ({
    active: t(["Active", "활성", "启用", "有効"]).desc(["Active status", "활성 상태", "启用状态", "有効状態"]),
    archived: t(["Archived", "보관됨", "已归档", "アーカイブ済み"]).desc([
      "Archived status",
      "보관된 상태",
      "已归档状态",
      "アーカイブ済み状態",
    ]),
  }))
  .applyBaseSignal("dictionaryTestItem")
  .slice<TestSlice>((fn) => ({
    active: fn(["Active Items", "활성 항목", "启用项目", "有効な項目"])
      .desc(["Active item slice", "활성 항목 슬라이스", "启用项目切片", "有効な項目スライス"])
      .arg((t) => ({
        status: t(["Status Arg", "상태 인자", "状态参数", "ステータス引数"]).desc([
          "Status arg description",
          "상태 인자 설명",
          "状态参数说明",
          "ステータス引数の説明",
        ]),
      })),
  }))
  .endpoint<TestEndpoint>((fn) => ({
    publish: fn(["Publish", "게시", "发布", "公開"])
      .desc(["Publish description", "게시 설명", "发布说明", "公開の説明"])
      .arg((t) => ({
        payload: t(["Payload", "페이로드", "负载", "ペイロード"]).desc([
          "Payload description",
          "페이로드 설명",
          "负载说明",
          "ペイロードの説明",
        ]),
      })),
  }))
  .error({
    notFound: ["Item not found", "항목을 찾을 수 없습니다", "找不到项目", "項目が見つかりません"],
  })
  .translate({
    empty: ["Empty item", "빈 항목", "空项目", "空の項目"],
  });

const scalarDict = scalarDictionary(languages)
  .of((t) =>
    t(["Dictionary Test Scalar", "사전 테스트 스칼라", "字典测试标量", "辞書テストスカラー"]).desc([
      "Scalar description",
      "스칼라 설명",
      "标量说明",
      "スカラーの説明",
    ]),
  )
  .model<TestScalar>((t) => ({
    value: t(["Value", "값", "值", "値"]).desc(["Value description", "값 설명", "值说明", "値の説明"]),
  }))
  .enum<TestScalarEnum>("dictionaryTestScalarUnit", (t) => ({
    byte: t(["Byte", "바이트", "字节", "バイト"]).desc(["Byte description", "바이트 설명", "字节说明", "バイトの説明"]),
  }))
  .error({
    invalid: ["Invalid scalar", "유효하지 않은 스칼라", "无效标量", "無効なスカラー"],
  })
  .translate({
    summary: ["Scalar summary", "스칼라 요약", "标量摘要", "スカラー概要"],
  });

const serviceDict = serviceDictionary(languages)
  .endpoint<TestServiceEndpoint>((fn) => ({
    ping: fn(["Ping", "핑", "Ping", "Ping"])
      .desc(["Ping description", "핑 설명", "Ping说明", "Pingの説明"])
      .arg((t) => ({
        body: t(["Body", "본문", "正文", "本文"]).desc(["Body description", "본문 설명", "正文说明", "本文の説明"]),
      })),
  }))
  .error({
    unavailable: ["Service unavailable", "서비스를 사용할 수 없습니다", "服务不可用", "サービスを利用できません"],
  })
  .translate({
    ready: ["Service ready", "서비스 준비됨", "服务已就绪", "サービス準備完了"],
  });

const trans = makeTrans({
  dictionaryTestItem: { dict: modelDict } as never,
  dictionaryTestScalar: { dict: scalarDict } as never,
  dictionaryTestService: { dict: serviceDict } as never,
});

describe("makeTrans", () => {
  test("translates registered model dictionary paths", () => {
    expect(trans.translate("en", "dictionaryTestItem.modelName" as never)).toBe("Dictionary Test Item");
    expect(trans.translate("ko", "dictionaryTestItem.modelName" as never)).toBe("사전 테스트 항목");
    expect(trans.translate("zhChs", "dictionaryTestItem.modelName" as never)).toBe("字典测试项目");
    expect(trans.translate("ja", "dictionaryTestItem.modelName" as never)).toBe("辞書テスト項目");
    expect(trans.translate("en", "dictionaryTestItem.modelDesc" as never)).toBe("Dictionary test item description");
    expect(trans.translate("zhChs", "dictionaryTestItem.modelDesc" as never)).toBe("字典测试项目说明");
    expect(trans.translate("ja", "dictionaryTestItem.modelDesc" as never)).toBe("辞書テスト項目の説明");

    expect(trans.translate("en", "dictionaryTestItem.title" as never)).toBe("Title");
    expect(trans.translate("ko", "dictionaryTestItem.title.desc" as never)).toBe("제목 설명");
    expect(trans.translate("zhChs", "dictionaryTestItem.title" as never)).toBe("标题");
    expect(trans.translate("ja", "dictionaryTestItem.title.desc" as never)).toBe("タイトルの説明");
    expect(trans.translate("en", "dictionaryTestItem.id" as never)).toBe("ID");
    expect(trans.translate("ko", "dictionaryTestItem.createdAt.desc" as never)).toBe("데이터 생성 시각");

    expect(trans.translate("en", "dictionaryTestItem.insight.total" as never)).toBe("Total");
    expect(trans.translate("ko", "dictionaryTestItem.insight.total.desc" as never)).toBe("합계 설명");
    expect(trans.translate("zhChs", "dictionaryTestItem.insight.total.desc" as never)).toBe("总计说明");
    expect(trans.translate("ja", "dictionaryTestItem.insight.total" as never)).toBe("合計");
    expect(trans.translate("en", "dictionaryTestItem.insight.count" as never)).toBe("Count");
  });

  test("translates model query, sort, enum, and signal paths", () => {
    expect(trans.translate("en", "dictionaryTestItem.query.byTitle" as never)).toBe("By Title");
    expect(trans.translate("ko", "dictionaryTestItem.query.byTitle.desc" as never)).toBe("제목으로 조회");
    expect(trans.translate("zhChs", "dictionaryTestItem.query.byTitle" as never)).toBe("按标题查询");
    expect(trans.translate("ja", "dictionaryTestItem.query.byTitle.desc" as never)).toBe("タイトルで検索する");
    expect(trans.translate("en", "dictionaryTestItem.query.byTitle.arg.title" as never)).toBe("Title Query");
    expect(trans.translate("ko", "dictionaryTestItem.query.byTitle.arg.title.desc" as never)).toBe("제목 쿼리 설명");
    expect(trans.translate("zhChs", "dictionaryTestItem.query.byTitle.arg.title.desc" as never)).toBe("标题查询说明");
    expect(trans.translate("ja", "dictionaryTestItem.query.byTitle.arg.title" as never)).toBe("タイトルクエリ");
    expect(trans.translate("en", "dictionaryTestItem.query.any" as never)).toBe("Any");

    expect(trans.translate("en", "dictionaryTestItem.sort.popular" as never)).toBe("Popular");
    expect(trans.translate("ko", "dictionaryTestItem.sort.latest" as never)).toBe("최신순");
    expect(trans.translate("zhChs", "dictionaryTestItem.sort.popular.desc" as never)).toBe("热门说明");
    expect(trans.translate("ja", "dictionaryTestItem.sort.popular" as never)).toBe("人気順");

    expect(trans.translate("en", "dictionaryTestStatus.active" as never)).toBe("Active");
    expect(trans.translate("ko", "dictionaryTestStatus.archived.desc" as never)).toBe("보관된 상태");
    expect(trans.translate("zhChs", "dictionaryTestStatus.active.desc" as never)).toBe("启用状态");
    expect(trans.translate("ja", "dictionaryTestStatus.archived" as never)).toBe("アーカイブ済み");

    expect(trans.translate("en", "dictionaryTestItem.signal.createDictionaryTestItem" as never)).toBe(
      "Create DictionaryTestItem",
    );
    expect(trans.translate("ko", "dictionaryTestItem.signal.createDictionaryTestItem.arg.data" as never)).toBe(
      "데이터",
    );
    expect(trans.translate("en", "dictionaryTestItem.signal.dictionaryTestItemListActive" as never)).toBe(
      "Slice List - Active Items",
    );
    expect(trans.translate("en", "dictionaryTestItem.signal.dictionaryTestItemListActive.arg.skip" as never)).toBe(
      "skip",
    );
    expect(trans.translate("zhChs", "dictionaryTestItem.signal.dictionaryTestItemListActive" as never)).toBe(
      "Slice List - 启用项目",
    );
    expect(trans.translate("ja", "dictionaryTestItem.signal.dictionaryTestItemInsightActive" as never)).toBe(
      "Slice Insight - 有効な項目",
    );
    expect(
      trans.translate("ko", "dictionaryTestItem.signal.dictionaryTestItemInsightActive.arg.status.desc" as never),
    ).toBe("상태 인자 설명");
    expect(
      trans.translate("zhChs", "dictionaryTestItem.signal.dictionaryTestItemInsightActive.arg.status.desc" as never),
    ).toBe("状态参数说明");
    expect(trans.translate("ja", "dictionaryTestItem.signal.dictionaryTestItemListActive.arg.status" as never)).toBe(
      "ステータス引数",
    );
    expect(trans.translate("en", "dictionaryTestItem.signal.publish.arg.payload.desc" as never)).toBe(
      "Payload description",
    );
    expect(trans.translate("zhChs", "dictionaryTestItem.signal.publish.desc" as never)).toBe("发布说明");
    expect(trans.translate("ja", "dictionaryTestItem.signal.publish.arg.payload.desc" as never)).toBe(
      "ペイロードの説明",
    );
  });

  test("translates scalar and service dictionaries", () => {
    expect(trans.translate("en", "dictionaryTestScalar.modelName" as never)).toBe("Dictionary Test Scalar");
    expect(trans.translate("ko", "dictionaryTestScalar.modelDesc" as never)).toBe("스칼라 설명");
    expect(trans.translate("zhChs", "dictionaryTestScalar.modelName" as never)).toBe("字典测试标量");
    expect(trans.translate("ja", "dictionaryTestScalar.modelDesc" as never)).toBe("スカラーの説明");
    expect(trans.translate("en", "dictionaryTestScalar.value.desc" as never)).toBe("Value description");
    expect(trans.translate("ko", "dictionaryTestScalarUnit.byte" as never)).toBe("바이트");
    expect(trans.translate("zhChs", "dictionaryTestScalar.value.desc" as never)).toBe("值说明");
    expect(trans.translate("ja", "dictionaryTestScalarUnit.byte.desc" as never)).toBe("バイトの説明");
    expect(trans.translate("en", "dictionaryTestScalar.summary" as never)).toBe("Scalar summary");
    expect(trans.translate("zhChs", "dictionaryTestScalar.summary" as never)).toBe("标量摘要");
    expect(trans.translate("ja", "dictionaryTestScalar.summary" as never)).toBe("スカラー概要");

    expect(trans.translate("en", "dictionaryTestService.signal.ping" as never)).toBe("Ping");
    expect(trans.translate("ko", "dictionaryTestService.signal.ping.desc" as never)).toBe("핑 설명");
    expect(trans.translate("zhChs", "dictionaryTestService.signal.ping.desc" as never)).toBe("Ping说明");
    expect(trans.translate("ja", "dictionaryTestService.signal.ping.arg.body" as never)).toBe("本文");
    expect(trans.translate("en", "dictionaryTestService.signal.ping.arg.body.desc" as never)).toBe("Body description");
    expect(trans.translate("ko", "dictionaryTestService.ready" as never)).toBe("서비스 준비됨");
    expect(trans.translate("zhChs", "dictionaryTestService.ready" as never)).toBe("服务已就绪");
    expect(trans.translate("ja", "dictionaryTestService.ready" as never)).toBe("サービス準備完了");
  });

  test("returns fallback key for missing translations and exposes dictionaries", () => {
    expect(trans.translate("en", "dictionaryTestItem.unknown.path" as never)).toBe("dictionaryTestItem.unknown.path");

    const enDict = trans.getDictionary("en") as Record<string, Record<string, unknown>>;
    const allDict = trans.getAllDictionary();

    expect(enDict.dictionaryTestItem.modelName).toEqual({ t: "Dictionary Test Item" });
    expect(allDict.ko.dictionaryTestService.ready).toEqual({ t: "서비스 준비됨" });
    expect(allDict.zhChs.dictionaryTestItem.modelName).toEqual({ t: "字典测试项目" });
    expect(allDict.ja.dictionaryTestService.ready).toEqual({ t: "サービス準備完了" });
  });

  test("keeps dictionary snapshots isolated between makeTrans calls", () => {
    const first = makeTrans({
      hotReloadService: {
        dict: serviceDictionary(["en", "ko"])
          .endpoint<TestServiceEndpoint>((fn) => ({
            ping: fn(["Old Ping", "이전 핑"]).arg((t) => ({
              body: t(["Body", "본문"]),
            })),
          }))
          .translate({
            stale: ["Stale", "오래됨"],
          }),
      } as never,
    });
    const second = makeTrans({
      hotReloadService: {
        dict: serviceDictionary(["en", "ko"])
          .endpoint<TestServiceEndpoint>((fn) => ({
            ping: fn(["New Ping", "새 핑"]).arg((t) => ({
              body: t(["Body", "본문"]),
            })),
          }))
          .translate({}),
      } as never,
    });

    expect(first.translate("en", "hotReloadService.signal.ping" as never)).toBe("Old Ping");
    expect(first.translate("en", "hotReloadService.stale" as never)).toBe("Stale");
    expect(second.translate("en", "hotReloadService.signal.ping" as never)).toBe("New Ping");
    expect(second.translate("en", "hotReloadService.stale" as never)).toBe("hotReloadService.stale");
    expect((second.getAllDictionary().en.hotReloadService as Record<string, unknown>).stale).toBeUndefined();
  });

  test("creates Err exceptions with dictionary error keys", () => {
    const err = new trans.Err("dictionaryTestItem.error.notFound" as never, { id: "1" });
    const conflict = new trans.Err.Conflict("dictionaryTestItem.error.notFound" as never);
    const restored = trans.Err.fromJSON({
      error: "dictionaryTestItem.error.notFound",
      statusCode: 404,
      data: { id: "1" },
      path: "/dictionary-test",
      timestamp: "2026-05-25T00:00:00.000Z",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("dictionaryTestItem.error.notFound");
    expect(err.statusCode).toBe(400);
    expect(err.toJSON()).toMatchObject({
      error: "dictionaryTestItem.error.notFound",
      statusCode: 400,
      data: { id: "1" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(restored).toBeInstanceOf(trans.Err);
    expect(restored.message).toBe("dictionaryTestItem.error.notFound");
    expect(restored.statusCode).toBe(404);
    expect(restored.toJSON()).toMatchObject({
      error: "dictionaryTestItem.error.notFound",
      statusCode: 404,
      data: { id: "1" },
      path: "/dictionary-test",
      timestamp: "2026-05-25T00:00:00.000Z",
    });
    expect(trans.translate("ko", "dictionaryTestItem.error.notFound" as never)).toBe("항목을 찾을 수 없습니다");
    expect(trans.translate("zhChs", "dictionaryTestItem.error.notFound" as never)).toBe("找不到项目");
    expect(trans.translate("ja", "dictionaryTestItem.error.notFound" as never)).toBe("項目が見つかりません");
    expect(trans.translate("en", "dictionaryTestScalar.error.invalid" as never)).toBe("Invalid scalar");
    expect(trans.translate("zhChs", "dictionaryTestScalar.error.invalid" as never)).toBe("无效标量");
    expect(trans.translate("ja", "dictionaryTestScalar.error.invalid" as never)).toBe("無効なスカラー");
    expect(trans.translate("ko", "dictionaryTestService.error.unavailable" as never)).toBe(
      "서비스를 사용할 수 없습니다",
    );
    expect(trans.translate("zhChs", "dictionaryTestService.error.unavailable" as never)).toBe("服务不可用");
    expect(trans.translate("ja", "dictionaryTestService.error.unavailable" as never)).toBe("サービスを利用できません");
  });
});

describe("makeDictionary", () => {
  test("merges dictionary fragments from left to right", () => {
    expect(makeDictionary({ a: "A", nested: { left: true } }, { b: "B", nested: { right: true } })).toEqual({
      a: "A",
      b: "B",
      nested: { right: true },
    });
  });
});
