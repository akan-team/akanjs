import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const moduleExamples = [
    {
      name: "_security",
      path: "libs/util/lib/_security",
      role: l.trans({
        en: "Server-only security workflow for encryption, JWT signing, and token verification.",
        ko: "암호화, JWT signing, token verification을 담당하는 server-only security workflow입니다.",
      }),
    },
    {
      name: "_search",
      path: "libs/util/lib/_search",
      role: l.trans({
        en: "Search feature module with service methods, endpoints, client store, and admin Zone UI.",
        ko: "service method, endpoint, client store, admin Zone UI를 가진 search feature module입니다.",
      }),
    },
    {
      name: "_localFile",
      path: "libs/util/lib/_localFile",
      role: l.trans({
        en: "Shared file-access service that reads blob data through a typed endpoint.",
        ko: "typed endpoint를 통해 blob data를 읽는 shared file-access service입니다.",
      }),
    },
  ];

  const fileMap = [
    {
      file: "search.abstract.md",
      role: l.trans({
        en: "Describes the service workflow intent, domain rules, integration boundaries, and agent notes.",
        ko: "service workflow 의도, domain rule, integration boundary, agent note를 설명합니다.",
      }),
    },
    {
      file: "search.service.ts",
      role: l.trans({
        en: "Implements the workflow itself and injects runtime values or other services.",
        ko: "workflow 자체를 구현하고 runtime value나 다른 service를 주입받습니다.",
      }),
    },
    {
      file: "search.signal.ts",
      role: l.trans({
        en: "Exposes the workflow through endpoint, internal task, cron, or custom route signals.",
        ko: "workflow를 endpoint, internal task, cron, custom route signal로 노출합니다.",
      }),
    },
    {
      file: "search.dictionary.ts",
      role: l.trans({
        en: "Names endpoint labels, endpoint arguments, and service UI phrases.",
        ko: "endpoint label, endpoint argument, service UI phrase의 문구를 정의합니다.",
      }),
    },
    {
      file: "search.store.ts",
      role: l.trans({
        en: "Owns service feature state, fetch calls, loading flags, and UI-facing actions.",
        ko: "service feature state, fetch call, loading flag, UI-facing action을 담당합니다.",
      }),
    },
    {
      file: "Search.Util.tsx",
      role: l.trans({
        en: "Packages small client controls for the service feature when they are reusable.",
        ko: "재사용 가능한 service feature용 작은 client control을 묶습니다.",
      }),
    },
    {
      file: "Search.Zone.tsx",
      role: l.trans({
        en: "Composes a full service feature section for admin pages or app pages.",
        ko: "admin page나 app page에 들어갈 service feature section을 조립합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide
        id="service-module-overview"
        title={l.trans({ en: "Service Module Overview", ko: "Service module 개요" })}
      >
        <Docs.Title>{l.trans({ en: "Service Module Overview", ko: "Service module 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service module is a feature, workflow, or integration folder. It is useful when the code does not start from a document model, but still needs server logic, typed APIs, client state, and sometimes UI.",
              ko: "Service module은 feature, workflow, integration을 담는 folder입니다. document model에서 시작하지 않지만 server logic, typed API, client state, 때로는 UI까지 필요한 경우에 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Service module folders usually start with an underscore. The files inside drop that underscore: `_search` owns `search.service.ts`, `search.signal.ts`, `search.store.ts`, and `Search.Zone.tsx`.",
              ko: "Service module folder는 보통 underscore로 시작합니다. 내부 파일명에서는 underscore를 빼고 `_search`는 `search.service.ts`, `search.signal.ts`, `search.store.ts`, `Search.Zone.tsx`를 가집니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use It", ko: "언제 사용하나" })}>
        <Docs.Title>{l.trans({ en: "When To Use It", ko: "언제 사용하나" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use a normal module when the feature is centered on a business object such as User, Story, or Order. Use a service module when the feature is centered on an action or platform capability such as search, security, local files, or shared utilities.",
              ko: "User, Story, Order처럼 business object가 중심이면 일반 module을 사용합니다. Search, security, local file, shared utility처럼 action이나 platform capability가 중심이면 service module을 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          {moduleExamples.map(({ name, path, role }) => (
            <div key={name} className="border-base-300 border-l-2 pl-4">
              <div className="font-bold text-base-content">
                {name} <span className="font-mono font-normal text-base-content/70">({path})</span>
              </div>
              <div className="text-base-content/70">{role}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-map" title={l.trans({ en: "Service File Map", ko: "Service file map" })}>
        <Docs.Title>{l.trans({ en: "Service File Map", ko: "Service file map" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service module only needs the files that the feature actually uses. Start with service.abstract.md for workflow intent, then add service, signal, dictionary, store, Util, or Zone files as the feature grows.",
              ko: "Service module은 feature가 실제로 사용하는 파일만 필요합니다. workflow 의도는 service.abstract.md에서 시작하고, feature가 커지면 service, signal, dictionary, store, Util, Zone 파일을 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          {fileMap.map(({ file, role }) => (
            <div key={file} className="border-base-300 border-l-2 pl-4">
              <div className="font-bold text-base-content">{file}</div>
              <div className="text-base-content/70">{role}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="folder-shape" title={l.trans({ en: "Folder Shape", ko: "Folder shape" })}>
        <Docs.Title>{l.trans({ en: "Folder Shape", ko: "Folder shape" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start small. A server-only module might only have service and signal files. Add dictionary, store, Util, or Zone files when the feature becomes visible to users or admins.",
              ko: "작게 시작하세요. server-only module은 service와 signal 파일만 있어도 됩니다. feature가 사용자나 관리자에게 보이기 시작하면 dictionary, store, Util, Zone을 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="_search service module"
          code={`libs/util/lib/_search/
  search.abstract.md     // workflow intent
  search.service.ts      // workflow
  search.signal.ts       // API
  search.dictionary.ts   // text
  search.store.ts        // client state
  Search.Util.tsx        // small controls
  Search.Zone.tsx        // page section`}
        />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
