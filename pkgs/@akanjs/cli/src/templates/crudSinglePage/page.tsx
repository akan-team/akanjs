import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "page.tsx",
    content: `
import type { CsrConfig } from "@akanjs/client";
import { Load, Model } from "@akanjs/ui";
import { ${dict.Model}, type cnst, fetch, usePage } from "@${dict.appName}/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { ${dict.model}InitInPublic } = await fetch.init${dict.Model}InPublic();
        return { ${dict.model}InitInPublic } as const;
      }}
      render={({ ${dict.model}InitInPublic }) => (
        <>
          <div className="animate-fadeIn flex items-center gap-4 px-4 pt-4">
            <div className="text-lg font-bold md:text-4xl">{l("${dict.model}.modelName")}</div>
            <Model.New className="btn btn-ghost" sliceName="${dict.model}InPublic" renderTitle="id">
              <${dict.Model}.Template.General />
            </Model.New>
          </div>
          <${dict.Model}.Zone.Card
            className="animate-fadeIn mt-2 grid w-full grid-cols-1 justify-center gap-4 md:grid-cols-2 xl:grid-cols-3"
            init={${dict.model}InitInPublic}
          />
        </>
      )}
    />
  );
}
Page.csrConfig = { transition: "none" } satisfies CsrConfig;
`,
  };
}
