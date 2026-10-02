import { AkanjsFooter, AkanjsHeader, akanjsHomeHeaderLinks, Cosmos, Docs, JellyLoader } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout()
  .loading(() => <JellyLoader />)
  .notFound(({ pathname }) => <Docs.NotFound pathname={pathname} />)
  .render(({ children }) => (
    <>
      <Cosmos />
      <AkanjsHeader links={akanjsHomeHeaderLinks} mobileDrawerLinks={akanjsHomeHeaderLinks} />
      <div className="relative flex w-full">
        <div className="w-full">{children}</div>
      </div>
      <AkanjsFooter />
    </>
  ));
