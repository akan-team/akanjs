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
import { ${dict.Model}, fetch, usePage } from "@apps/${dict.appName}/client";
import { Link } from "akanjs/ui";
import type { PageConfig } from "akanjs/client";

export default async function Page() {
  const { l } = usePage();
  const { ${dict.model}InitInPublic } = await fetch.init${dict.Model}InPublic();
  return (
    <div className="container flex flex-col gap-4">
      <div className="w-full mt-5 px-5 h-full ">
        <div>{l("${dict.model}.modelName")}</div>
        <div className="animate-fadeIn px-4 pt-4 flex gap-4 items-center">
          <div className="font-bold text-lg md:text-4xl">${dict.Model}s</div>
          <Link href={\`/${dict.model}/new\`}>
            <button className="btn">+ {l("base.createModel", { model: l("${dict.model}.modelName") })}</button>
          </Link>
        </div>
        <div>{l("${dict.model}.modelDesc")}</div>
        <div className="flex px-6 mt-3 gap-4">
          <${dict.Model}.Zone.Card
            className="animate-fadeIn grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 justify-center gap-4 w-full"
            init={${dict.model}InitInPublic}
          />
        </div>
      </div>
    </div>
  );
}
export const pageConfig = { transition: "none" } satisfies PageConfig;
  `,
  };
}
