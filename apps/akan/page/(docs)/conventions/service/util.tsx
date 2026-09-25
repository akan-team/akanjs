import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-util" title={l.trans({ en: "Service Util", ko: "Service Util" })}>
        <Docs.Title>{l.trans({ en: "Service Util", ko: "Service Util" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service Util file contains small client helper components for a service feature. It is useful for reusable controls such as action buttons, filters, toolboxes, and dialog triggers.",
              ko: "Service Util 파일은 service feature를 위한 작은 client helper component를 담습니다. action button, filter, toolbox, dialog trigger 같은 reusable control에 유용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A service module may not need Util at first. A minimal placeholder is acceptable while the feature UI is still moving into Zone or app pages.",
              ko: "Service module은 처음부터 Util이 필요하지 않을 수 있습니다. feature UI가 아직 Zone이나 app page에서 정리되는 중이라면 minimal placeholder도 괜찮습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="client-helper"
        title={l.trans({ en: "Client Helper Component", ko: "Client helper component" })}
      >
        <Docs.Title>{l.trans({ en: "Client Helper Component", ko: "Client helper component" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Service Util components are usually client components because they handle clicks, local UI state, or store actions. Keep them small enough to be reused inside Zone, Template, or app pages.",
              ko: "Service Util component는 click, local UI state, store action을 다루기 때문에 보통 client component입니다. Zone, Template, app page 안에서 재사용할 수 있을 만큼 작게 유지합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="small service control"
          code={`"use client";

export const ResyncButton = () => {
  const searchIndexName = st.use.searchIndexName();
  return (
    <button onClick={() => st.do.resyncSearchDocuments()} disabled={!searchIndexName}>
      Resync
    </button>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs Here", ko: "무엇을 넣나" })}>
        <Docs.Title>{l.trans({ en: "What Belongs Here", ko: "무엇을 넣나" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put small pieces here when they are about service interaction but are not large enough to be a full Zone. Examples include resync buttons, search filter controls, upload controls, and reusable status badges.",
              ko: "Service interaction과 관련 있지만 full Zone이 될 만큼 크지 않은 작은 조각을 여기에 둡니다. resync button, search filter control, upload control, reusable status badge가 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="when Util is enough"
          code={`export const SearchInput = () => {
  return <input onChange={(e) => st.do.setSearchString(e.target.value)} />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
