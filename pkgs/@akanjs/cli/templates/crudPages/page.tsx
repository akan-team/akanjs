import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  appName: string;
  clientPath: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "_index.tsx",
    content: `
import { ${dict.Model}, fetch, usePage } from "${dict.clientPath}";
import { page } from "akanjs/client";
import { buttonRecipe, Link } from "akanjs/ui";

export default page()
  .config({ transition: "none" })
  .render(() => {
    const { l } = usePage();
    const { ${dict.model}InitInPublic } = fetch.init${dict.Model}InPublic();
    return (
      <div className="container flex flex-col gap-4">
        <div className="mt-5 h-full w-full px-5">
          <div>{l("${dict.model}.modelName")}</div>
          <div className="flex animate-fadeIn items-center gap-4 px-4 pt-4">
            <div className="font-bold text-lg md:text-4xl">${dict.Model}s</div>
            <Link className={buttonRecipe()} href="/${dict.model}/new">
              + {l("base.createModel", { model: l("${dict.model}.modelName") })}
            </Link>
          </div>
          <div>{l("${dict.model}.modelDesc")}</div>
          <div className="mt-3 flex gap-4 px-6">
            <${dict.Model}.Zone.Card
              className="grid w-full animate-fadeIn grid-cols-1 justify-center gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              init={${dict.model}InitInPublic}
            />
          </div>
        </div>
      </div>
    );
  });
`,
  };
}
