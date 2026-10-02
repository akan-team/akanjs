import {
  AkanjsFooter,
  AkanjsHeader,
  akanjsDocsHeaderLinks,
  Cosmos,
  Docs,
  DocsAgentChat,
  JellyLoader,
} from "@apps/akan/ui";
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout()
  .loading(() => <JellyLoader />)
  .notFound(({ pathname }) => <Docs.NotFound pathname={pathname} />)
  .render(({ children }) => {
    return (
      <>
        <Cosmos />
        <AkanjsHeader
          links={akanjsDocsHeaderLinks}
          logoLabel="Docs"
          // notice={{
          //   text: { en: "Akan.js v2 docs are now available.", ko: "Akan.js v2 문서가 새로 나왔습니다." },
          //   link: { href: "/v1/docs", label: { en: "View the v1 docs", ko: "v1 문서 보기" } },
          // }}
          collapseMobileSubMenuOnScroll
        />
        {children}
        <Agent.Guide instructions="This is the Akan.js documentation site. Help the reader find and understand the docs. Use searchDocs to find pages by keyword, then navigate to the best match instead of describing where it is." />
        <DocsAgentChat />
        <AkanjsFooter />
      </>
    );
  });
