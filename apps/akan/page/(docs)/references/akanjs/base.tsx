import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "ID",
      desc: l.trans({
        en: "24 hex string uuid used for document ids and signal payload ids. It validates as a string and keeps an empty string as the default placeholder value.",
        ko: "document id와 signal payload id에 사용하는 24자리 hex string uuid입니다. string으로 검증되며 기본 placeholder 값으로 빈 문자열을 유지합니다.",
      }),
      code: `import { ID } from "akanjs/base";
import { via } from "akanjs/constant";

export const user = via.model({
  id: ID,
});`,
    },
    {
      name: "Int",
      desc: l.trans({
        en: "Integer primitive scalar for numeric fields that must be safe integers. It is common in counters, pagination values, metric samples, and scalar constant definitions.",
        ko: "safe integer여야 하는 numeric field를 위한 integer primitive scalar입니다. counter, pagination value, metric sample, scalar constant definition에서 자주 사용합니다.",
      }),
      code: `import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export const accessStat = via.scalar("accessStat", {
  total: Int,
});`,
    },
    {
      name: "Float",
      desc: l.trans({
        en: "Finite number primitive scalar for decimal values such as coordinates, rates, balances, and resource metrics. Use it when fractional values are valid business data.",
        ko: "coordinate, rate, balance, resource metric처럼 decimal value를 위한 finite number primitive scalar입니다. fractional value가 유효한 business data일 때 사용합니다.",
      }),
      code: `import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export const coordinate = via.scalar("coordinate", {
  lat: Float,
  lng: Float,
});`,
    },
    {
      name: "Any",
      desc: l.trans({
        en: "Loose object scalar for payloads whose shape is intentionally open. Prefer explicit scalar/model fields when the shape is stable; use Any for integration blobs or flexible metadata.",
        ko: "shape을 의도적으로 열어 두는 payload를 위한 loose object scalar입니다. shape이 안정적이면 명시적인 scalar/model field를 우선 사용하고, integration blob이나 flexible metadata에는 Any를 사용합니다.",
      }),
      code: `import { Any } from "akanjs/base";
import { via } from "akanjs/constant";

export const eventPayload = via.scalar("eventPayload", {
  body: Any,
});`,
    },
    {
      name: "dayjs / Dayjs",
      desc: l.trans({
        en: "Akan re-exports the configured dayjs function and Dayjs type from base. Apps and libs use it for document dates, store state dates, service calculations, and UI formatting.",
        ko: "Akan은 base에서 configured dayjs function과 Dayjs type을 re-export합니다. apps/libs는 document date, store state date, service calculation, UI formatting에 사용합니다.",
      }),
      code: `import { type Dayjs, dayjs } from "akanjs/base";

const createdAt: Dayjs = dayjs();
const label = createdAt.format("YYYY-MM-DD");`,
    },
    {
      name: "enumOf",
      desc: l.trans({
        en: "Creates a typed enum scalar class from a literal value list. The generated enum exposes values, has, indexOf, find, filter, map, and forEach helpers used by constants and UI labels.",
        ko: "literal value list에서 typed enum scalar class를 생성합니다. generated enum은 constants와 UI label에서 사용하는 values, has, indexOf, find, filter, map, forEach helper를 제공합니다.",
      }),
      code: `import { enumOf } from "akanjs/base";

export const Status = enumOf("status", ["ready", "running", "done"] as const);

Status.has("ready");
Status.map((value) => value.toUpperCase());`,
    },
    {
      name: "getEnv",
      desc: l.trans({
        en: "Reads and caches Akan runtime environment values from public/server environment variables. It returns client/server URI data, operation mode, app identity, and render mode.",
        ko: "public/server environment variable에서 Akan runtime environment 값을 읽고 캐시합니다. client/server URI data, operation mode, app identity, render mode를 반환합니다.",
      }),
      code: `import { getEnv } from "akanjs/base";

const env = getEnv();
if (env.operationMode === "local") {
  console.info(env.serverHttpUri);
}`,
    },
    {
      name: "DataList",
      desc: l.trans({
        en: "Small id-keyed collection helper for light model arrays. It keeps a map from id to index and provides immutable-style set, delete, filter, slice, pick, and iteration helpers.",
        ko: "light model array를 위한 작은 id-keyed collection helper입니다. id에서 index로 가는 map을 유지하고 immutable-style set, delete, filter, slice, pick, iteration helper를 제공합니다.",
      }),
      code: `import { DataList } from "akanjs/base";

const users = new DataList([{ id: "a", nickname: "Akan" }]);
users.set({ id: "b", nickname: "Akan" });
const user = users.pick("a");`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-base" title="akanjs/base">
        <Docs.Title>akanjs/base</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/base` contains Akan's primitive scalar classes, runtime environment helpers, and foundational utility types. Import it when defining constants, document ids, date values, runtime-specific behavior, or type-level model helpers.",
              ko: "`akanjs/base`는 Akan의 primitive scalar class, runtime environment helper, foundational utility type을 제공합니다. constant, document id, date value, runtime-specific behavior, type-level model helper를 정의할 때 import합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
