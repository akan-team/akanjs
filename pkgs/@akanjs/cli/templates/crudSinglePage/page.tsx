import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "_index.tsx",
    content: `
import type { PageConfig } from "akanjs/client";
import { Model } from "akanjs/ui";
import { ${dict.Model}, fetch, usePage } from "@apps/${dict.appName}/client";

export default async function Page() {
  const { l } = usePage();
  const { ${dict.model}InitInPublic } = await fetch.init${dict.Model}InPublic();
  return (
    <>
      <div className="animate-fadeIn flex items-center gap-4 px-4 pt-4">
        <div className="text-lg font-bold md:text-4xl">{l("${dict.model}.modelName")}</div>
        <Model.New className="btn btn-ghost" slice={fetch.slice["${dict.model}InPublic"]} renderTitle="id">
          <${dict.Model}.Template.General />
        </Model.New>
      </div>
      <${dict.Model}.Zone.Card
        className="animate-fadeIn mt-2 grid w-full grid-cols-1 justify-center gap-4 md:grid-cols-2 xl:grid-cols-3"
        init={${dict.model}InitInPublic}
      />
    </>
  );
}
export const pageConfig = { transition: "none" } satisfies PageConfig;
`,
  };
}
