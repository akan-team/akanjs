import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  appName: string;
  clientPath: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "_index.tsx",
    content: `${BiomeForm.importFrom([dict.Model, "fetch", "usePage"], dict.clientPath)}
import { page } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

export default page()
  .config({ transition: "none" })
  .render(() => {
    const { l } = usePage();
${BiomeForm.assign("    ", `const { ${dict.model}InitInPublic }`, `fetch.init${dict.Model}InPublic`, [], ";")}
    return (
      <>
        <div className="flex animate-fadeIn items-center gap-4 px-4 pt-4">
${BiomeForm.wrap("          ", '<div className="font-bold text-lg md:text-4xl">', `{l("${dict.model}.modelName")}`, "</div>")}
          <Model.New
            trigger={
              <button type="button" className={buttonRecipe({ size: "sm", variant: "ghost" })}>
                {l("base.new")}
              </button>
            }
            slice={fetch.slice.${dict.model}InPublic}
            renderTitle="id"
          >
            <${dict.Model}.Template.General />
          </Model.New>
        </div>
        <${dict.Model}.Zone.Card
          className="mt-2 grid w-full animate-fadeIn grid-cols-1 justify-center gap-4 md:grid-cols-2 xl:grid-cols-3"
          init={${dict.model}InitInPublic}
        />
      </>
    );
  });
`,
  };
}
