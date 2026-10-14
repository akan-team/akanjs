import { describe, expect, test } from "bun:test";
import type { ENDPOINT_DICT_SHAPE, FILTER_DICT_SHAPE, SLICE_DICT_SHAPE } from "akanjs/base";
import type { FilterCls, FilterInfo } from "akanjs/document";
import type { ServiceModel } from "akanjs/service";
import type { EndpointCls, EndpointInfo, SliceCls, SliceInfo } from "akanjs/signal";
import {
  type ModelDictInfo,
  modelDictionary,
  type ServiceDictInfo,
  scalarDictionary,
  serviceDictionary,
} from "./dictInfo";
import type { registerServiceTrans } from "./locale";
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
  value: "active" | "archived" | "v1.2-legacy";
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

// Type-only: `modelDictionary` returns the base instance, so a key group lost in the merge fails only `l()` keys.
const extendedDict = modelDictionary(
  languages,
  modelDictionary(languages).translate({
    inheritedMsg: ["Inherited", "상속됨", "已继承", "継承済み"],
  }),
).translate({ ownMsg: ["Own", "자체", "自有", "自前"] });
type ExtendedEtcKey =
  typeof extendedDict extends ModelDictInfo<
    infer _Languages,
    infer _ModelKey,
    infer _InsightKey,
    infer _QueryKey,
    infer _SortKey,
    infer _EnumKey,
    infer _BaseSignalKey,
    infer _SliceKey,
    infer _EndpointKey,
    infer _ErrorKey,
    infer EtcKey
  >
    ? EtcKey
    : never;
type _ExtendedDictKeepsBaseTranslateKeys = AssertTrue<"inheritedMsg" extends ExtendedEtcKey ? true : false>;
type _ExtendedDictKeepsOwnTranslateKeys = AssertTrue<"ownMsg" extends ExtendedEtcKey ? true : false>;
type _ExtendedDictRejectsUndeclaredKeys = AssertTrue<"neverDeclared" extends ExtendedEtcKey ? false : true>;

// Pinned by position: a slot shifted by a new parameter is no type error anywhere, it only drops `l()` keys.
const slotServiceDict = serviceDictionary(languages)
  .error({ slotError: ["Slot", "슬롯", "槽", "スロット"] })
  .translate({ slotEtc: ["Etc", "기타", "其他", "その他"] });
type SlotServiceKeys =
  typeof slotServiceDict extends ServiceDictInfo<infer _Languages, infer _EndpointKey, infer ErrorKey, infer EtcKey>
    ? { error: ErrorKey; etc: EtcKey }
    : never;
type _ServiceErrorKeyStaysInItsSlot = AssertTrue<"slotError" extends SlotServiceKeys["error"] ? true : false>;
type _ServiceEtcKeyStaysInItsSlot = AssertTrue<"slotEtc" extends SlotServiceKeys["etc"] ? true : false>;

// `registerServiceTrans` reads the same slots through its own `infer` list, the one that feeds `l()`.
type SlotServiceModule = ReturnType<
  typeof registerServiceTrans<"slotSvc", TestServiceEndpoint, typeof slotServiceDict>
>;
type _RegisteredServiceErrorKeyResolves = AssertTrue<
  "slotSvc.error.slotError" extends SlotServiceModule["__Error_Key__"] ? true : false
>;
type _RegisteredServiceEtcKeyResolves = AssertTrue<
  "slotSvc.slotEtc" extends SlotServiceModule["__Dict_Key__"] ? true : false
>;

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
    "v1.2-legacy": t(["V1.2 Legacy", "V1.2 레거시", "V1.2 旧版", "V1.2 レガシー"]).desc([
      "Legacy v1.2 status",
      "레거시 v1.2 상태",
      "旧版 v1.2 状态",
      "レガシー v1.2 状態",
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

const expectTexts = (entries: [lang: string, key: string, text: string][]) => {
  for (const [lang, key, text] of entries) expect(trans.translate(lang, key as never)).toBe(text);
};

describe("makeTrans", () => {
  test("translates registered model dictionary paths", () => {
    expectTexts([
      ["en", "dictionaryTestItem.modelName", "Dictionary Test Item"],
      ["ko", "dictionaryTestItem.modelName", "사전 테스트 항목"],
      ["zhChs", "dictionaryTestItem.modelName", "字典测试项目"],
      ["ja", "dictionaryTestItem.modelName", "辞書テスト項目"],
      ["en", "dictionaryTestItem.modelDesc", "Dictionary test item description"],
      ["zhChs", "dictionaryTestItem.modelDesc", "字典测试项目说明"],
      ["ja", "dictionaryTestItem.modelDesc", "辞書テスト項目の説明"],
      ["en", "dictionaryTestItem.title", "Title"],
      ["ko", "dictionaryTestItem.title.desc", "제목 설명"],
      ["zhChs", "dictionaryTestItem.title", "标题"],
      ["ja", "dictionaryTestItem.title.desc", "タイトルの説明"],
      ["en", "dictionaryTestItem.id", "ID"],
      ["ko", "dictionaryTestItem.createdAt.desc", "데이터 생성 시각"],
      ["en", "dictionaryTestItem.insight.total", "Total"],
      ["ko", "dictionaryTestItem.insight.total.desc", "합계 설명"],
      ["zhChs", "dictionaryTestItem.insight.total.desc", "总计说明"],
      ["ja", "dictionaryTestItem.insight.total", "合計"],
      ["en", "dictionaryTestItem.insight.count", "Count"],
    ]);
  });

  test("translates model query, sort, enum, and signal paths", () => {
    expectTexts([
      ["en", "dictionaryTestItem.query.byTitle", "By Title"],
      ["ko", "dictionaryTestItem.query.byTitle.desc", "제목으로 조회"],
      ["zhChs", "dictionaryTestItem.query.byTitle", "按标题查询"],
      ["ja", "dictionaryTestItem.query.byTitle.desc", "タイトルで検索する"],
      ["en", "dictionaryTestItem.query.byTitle.arg.title", "Title Query"],
      ["ko", "dictionaryTestItem.query.byTitle.arg.title.desc", "제목 쿼리 설명"],
      ["zhChs", "dictionaryTestItem.query.byTitle.arg.title.desc", "标题查询说明"],
      ["ja", "dictionaryTestItem.query.byTitle.arg.title", "タイトルクエリ"],
      ["en", "dictionaryTestItem.query.any", "Any"],
      ["en", "dictionaryTestItem.sort.popular", "Popular"],
      ["ko", "dictionaryTestItem.sort.latest", "최신순"],
      ["zhChs", "dictionaryTestItem.sort.popular.desc", "热门说明"],
      ["ja", "dictionaryTestItem.sort.popular", "人気順"],
      ["en", "dictionaryTestStatus.active", "Active"],
      ["ko", "dictionaryTestStatus.archived.desc", "보관된 상태"],
      ["zhChs", "dictionaryTestStatus.active.desc", "启用状态"],
      ["ja", "dictionaryTestStatus.archived", "アーカイブ済み"],
      // An enum value is a real-world identifier, so a dotted one must not be read as a path into the tree.
      ["en", "dictionaryTestStatus.v1.2-legacy", "V1.2 Legacy"],
      ["ko", "dictionaryTestStatus.v1.2-legacy.desc", "레거시 v1.2 상태"],
      ["en", "dictionaryTestStatus.v1", "dictionaryTestStatus.v1"],
      ["en", "dictionaryTestItem.signal.createDictionaryTestItem", "Create DictionaryTestItem"],
      ["ko", "dictionaryTestItem.signal.createDictionaryTestItem.arg.data", "데이터"],
      ["en", "dictionaryTestItem.signal.dictionaryTestItemListActive", "Slice List - Active Items"],
      ["en", "dictionaryTestItem.signal.dictionaryTestItemListActive.arg.skip", "skip"],
      ["zhChs", "dictionaryTestItem.signal.dictionaryTestItemListActive", "Slice List - 启用项目"],
      ["ja", "dictionaryTestItem.signal.dictionaryTestItemInsightActive", "Slice Insight - 有効な項目"],
      ["ko", "dictionaryTestItem.signal.dictionaryTestItemInsightActive.arg.status.desc", "상태 인자 설명"],
      ["zhChs", "dictionaryTestItem.signal.dictionaryTestItemInsightActive.arg.status.desc", "状态参数说明"],
      ["ja", "dictionaryTestItem.signal.dictionaryTestItemListActive.arg.status", "ステータス引数"],
      ["en", "dictionaryTestItem.signal.publish.arg.payload.desc", "Payload description"],
      ["zhChs", "dictionaryTestItem.signal.publish.desc", "发布说明"],
      ["ja", "dictionaryTestItem.signal.publish.arg.payload.desc", "ペイロードの説明"],
    ]);
  });

  test("translates scalar and service dictionaries", () => {
    expectTexts([
      ["en", "dictionaryTestScalar.modelName", "Dictionary Test Scalar"],
      ["ko", "dictionaryTestScalar.modelDesc", "스칼라 설명"],
      ["zhChs", "dictionaryTestScalar.modelName", "字典测试标量"],
      ["ja", "dictionaryTestScalar.modelDesc", "スカラーの説明"],
      ["en", "dictionaryTestScalar.value.desc", "Value description"],
      ["ko", "dictionaryTestScalarUnit.byte", "바이트"],
      ["zhChs", "dictionaryTestScalar.value.desc", "值说明"],
      ["ja", "dictionaryTestScalarUnit.byte.desc", "バイトの説明"],
      ["en", "dictionaryTestScalar.summary", "Scalar summary"],
      ["zhChs", "dictionaryTestScalar.summary", "标量摘要"],
      ["ja", "dictionaryTestScalar.summary", "スカラー概要"],
      ["en", "dictionaryTestService.signal.ping", "Ping"],
      ["ko", "dictionaryTestService.signal.ping.desc", "핑 설명"],
      ["zhChs", "dictionaryTestService.signal.ping.desc", "Ping说明"],
      ["ja", "dictionaryTestService.signal.ping.arg.body", "本文"],
      ["en", "dictionaryTestService.signal.ping.arg.body.desc", "Body description"],
      ["ko", "dictionaryTestService.ready", "서비스 준비됨"],
      ["zhChs", "dictionaryTestService.ready", "服务已就绪"],
      ["ja", "dictionaryTestService.ready", "サービス準備完了"],
    ]);
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

  test("hands a macro the same bytes whichever order the dictionaries were filled in", () => {
    const service = (translations: Record<string, [string, string]>) =>
      ({ dict: serviceDictionary(["en", "ko"]).translate(translations) }) as never;
    const forward = makeTrans({ alpha: service({ zeta: ["Z", "Z"], beta: ["B", "B"] }), omega: service({}) });
    const backward = makeTrans({ omega: service({}), alpha: service({ beta: ["B", "B"], zeta: ["Z", "Z"] }) });

    expect(JSON.stringify(forward.getAllDictionary())).toBe(JSON.stringify(backward.getAllDictionary()));
    expect(Object.keys(forward.getAllDictionary().en.alpha as object)).toEqual(["beta", "error", "signal", "zeta"]);
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

  test("an Err read as a string carries its data, a secret-named key masked", () => {
    const err = new trans.Err("dictionaryTestItem.error.notFound" as never, {
      exitCode: 1,
      stderr: "boom",
      nested: { apiKey: "k-123", status: 502 },
      token: "t-456",
    });

    expect(String(err)).toBe(
      'Err: dictionaryTestItem.error.notFound {"exitCode":1,"stderr":"boom","nested":{"apiKey":"[redacted]","status":502},"token":"[redacted]"}',
    );
    expect(`${new trans.Err("dictionaryTestItem.error.notFound" as never)}`).toBe(
      "Err: dictionaryTestItem.error.notFound",
    );
    expect(String(new trans.Err("dictionaryTestItem.error.notFound" as never, { stderr: "x".repeat(600) }))).toEndWith(
      "…",
    );
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
    expectTexts([
      ["ko", "dictionaryTestItem.error.notFound", "항목을 찾을 수 없습니다"],
      ["zhChs", "dictionaryTestItem.error.notFound", "找不到项目"],
      ["ja", "dictionaryTestItem.error.notFound", "項目が見つかりません"],
      ["en", "dictionaryTestScalar.error.invalid", "Invalid scalar"],
      ["zhChs", "dictionaryTestScalar.error.invalid", "无效标量"],
      ["ja", "dictionaryTestScalar.error.invalid", "無効なスカラー"],
      ["ko", "dictionaryTestService.error.unavailable", "서비스를 사용할 수 없습니다"],
      ["zhChs", "dictionaryTestService.error.unavailable", "服务不可用"],
      ["ja", "dictionaryTestService.error.unavailable", "サービスを利用できません"],
    ]);
  });
});

describe("modelDictionary extension", () => {
  test("an extending dictionary keeps the base dictionary's translate and error entries", () => {
    const libDict = modelDictionary(languages)
      .error({ notFound: ["Not found", "찾을 수 없습니다", "找不到", "見つかりません"] })
      .translate({ updateSuccessMsg: ["Updated", "업데이트되었습니다", "已更新", "更新しました"] });
    const appDict = modelDictionary(languages, libDict)
      .of((t) => t(["App Item", "앱 항목", "应用项目", "アプリ項目"]))
      .translate({});

    expect(Object.keys(appDict.etcDictionary)).toEqual(["updateSuccessMsg"]);
    expect(Object.keys(appDict.errorDictionary)).toEqual(["notFound"]);
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

describe("translate locale fallback", () => {
  const twoLocaleTrans = makeTrans({
    dictionaryTestNarrow: {
      dict: serviceDictionary(["en", "ko"] as [string, string]).translate({
        ready: ["Ready", "준비됨"],
        greeting: ["Hello {name}", "안녕 {name}"],
      }),
    } as never,
  });

  test("resolves a locale the dictionary never declared through the default locale", () => {
    expect(twoLocaleTrans.translate("zhChs", "dictionaryTestNarrow.ready" as never)).toBe("Ready");
    expect(twoLocaleTrans.translate("ko", "dictionaryTestNarrow.ready" as never)).toBe("준비됨");
  });

  test("returns the key only when no locale carries it", () => {
    expect(twoLocaleTrans.translate("zhChs", "dictionaryTestNarrow.missing" as never)).toBe(
      "dictionaryTestNarrow.missing",
    );
    expect(twoLocaleTrans.translate("en", "dictionaryTestNarrow.missing" as never)).toBe(
      "dictionaryTestNarrow.missing",
    );
  });

  test("fills placeholders from the data argument", () => {
    expect(twoLocaleTrans.translate("ko", "dictionaryTestNarrow.greeting" as never, { name: "민" })).toBe("안녕 민");
    expect(twoLocaleTrans.translate("zhChs", "dictionaryTestNarrow.greeting" as never, { name: "Ada" })).toBe(
      "Hello Ada",
    );
    expect(twoLocaleTrans.translate("en", "dictionaryTestNarrow.greeting" as never)).toBe("Hello {name}");
  });
});
