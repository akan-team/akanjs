import { AkanjsFooter, AkanjsHeader, akanjsDocsHeaderLinks } from "@apps/akan/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <AkanjsHeader
        links={akanjsDocsHeaderLinks}
        logoLabel="Docs"
        notice={{
          text: { en: "Akan.js v2 docs are now available.", ko: "Akan.js v2 문서가 새로 나왔습니다." },
          link: { href: "/v1/docs", label: { en: "View the v1 docs", ko: "v1 문서 보기" } },
        }}
        collapseMobileSubMenuOnScroll
      />
      {children}
      <AkanjsFooter />
    </>
  );
}
