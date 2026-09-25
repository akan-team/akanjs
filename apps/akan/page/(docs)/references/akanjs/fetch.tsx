import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "ClientInit",
      desc: l.trans({
        en: "Zone return type for initialized list pages. It contains list objects, insight object, pagination fields, query args, sort state, and init timestamp, and may be returned directly or as a Promise.",
        ko: "initialized list page를 위한 Zone return type입니다. list object, insight object, pagination field, query arg, sort state, init timestamp를 포함하며 직접 반환하거나 Promise로 반환할 수 있습니다.",
      }),
      code: `import type { ClientInit } from "akanjs/fetch";

export interface Props {
  userInit: ClientInit<"user", LightUser, UserInsight>;
}`,
    },
    {
      name: "ClientView",
      desc: l.trans({
        en: "Zone return type for a single model view. It wraps the server view payload and supports both synchronous server component data and asynchronous client/server fetching.",
        ko: "single model view를 위한 Zone return type입니다. server view payload를 감싸며 synchronous server component data와 asynchronous client/server fetching을 모두 지원합니다.",
      }),
      code: `import type { ClientView } from "akanjs/fetch";

export interface Props {
  ticketView: ClientView<"ticket", Ticket>;
}`,
    },
    {
      name: "SliceMeta",
      desc: l.trans({
        en: "Metadata carried with initialized slice data. UI helpers use it to know the ref name, slice name, and number of query arguments behind a list or insight block.",
        ko: "initialized slice data와 함께 전달되는 metadata입니다. UI helper는 list 또는 insight block 뒤의 ref name, slice name, query argument 수를 알기 위해 사용합니다.",
      }),
      code: `import type { SliceMeta } from "akanjs/fetch";

export function Toolbar({ meta }: { meta: SliceMeta }) {
  return <div>{meta.sliceName}</div>;
}`,
    },
    {
      name: "FetchInitForm",
      desc: l.trans({
        en: "Option shape for list initialization. It controls page, limit, sort, default form values, invalidation, and whether insight data should be fetched together with the list.",
        ko: "list initialization을 위한 option shape입니다. page, limit, sort, default form value, invalidation, insight data를 list와 함께 fetch할지 여부를 제어합니다.",
      }),
      code: `import type { FetchInitForm } from "akanjs/fetch";

const option: FetchInitForm<UserInput, UserFilter> = {
  page: 1,
  limit: 20,
  insight: true,
};`,
    },
    {
      name: "Account",
      desc: l.trans({
        en: "Request account shape shared by server middleware and services. It always includes `appName` and `environment`, then allows app-specific account data to be added by generic parameter.",
        ko: "server middleware와 service가 공유하는 request account shape입니다. 항상 `appName`과 `environment`를 포함하고 generic parameter로 app-specific account data를 추가할 수 있습니다.",
      }),
      code: `import type { Account } from "akanjs/fetch";

type AdminAccount = Account<{ userId: string; role: "admin" }>;`,
    },
    {
      name: "FetchClient",
      desc: l.trans({
        en: "Runtime client that turns serialized signal metadata into typed HTTP and WebSocket fetch functions. App clients use the proxy around this class, while advanced tests can instantiate or clone it directly.",
        ko: "serialized signal metadata를 typed HTTP 및 WebSocket fetch function으로 바꾸는 runtime client입니다. app client는 이 class를 감싼 proxy를 사용하고, advanced test에서는 직접 instantiate하거나 clone할 수 있습니다.",
      }),
      code: `import { FetchClient } from "akanjs/fetch";

const client = new FetchClient("http://localhost:8282/api");
client.setJwt(token);
const cloned = client.clone({ connect: false });`,
    },
    {
      name: "getRequest / headers / cookies",
      desc: l.trans({
        en: "Server-side request helpers backed by AsyncLocalStorage or a request fallback stack. Use them in server components and fetch internals to read the current request without pulling client dependencies.",
        ko: "AsyncLocalStorage 또는 request fallback stack으로 동작하는 server-side request helper입니다. client dependency를 끌어오지 않고 current request를 읽기 위해 server component와 fetch internal에서 사용합니다.",
      }),
      code: `import { cookies, getRequest, headers } from "akanjs/fetch";

const req = getRequest();
const authorization = headers().get("authorization");
const jwt = cookies().get("jwt")?.value;`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-fetch" title="akanjs/fetch">
        <Docs.Title>akanjs/fetch</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/fetch` defines the typed client/server fetch boundary. Import it for Zone props, generated fetch client types, request-scoped headers/cookies/theme helpers, and advanced FetchClient usage.",
              ko: "`akanjs/fetch`는 typed client/server fetch boundary를 정의합니다. Zone props, generated fetch client type, request-scoped headers/cookies/theme helper, advanced FetchClient 사용에 import합니다.",
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
