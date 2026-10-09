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
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { buttonRecipe, Link } from "akanjs/ui";

export default page()
  .param("${dict.model}Id", ID)
  .config({ transition: "none" })
  .head(({ ${dict.model}Id }) => (
    <>
      <title>{${dict.model}Id}</title>
      <meta name="description" content={${dict.model}Id} />
      <meta property="og:title" content={${dict.model}Id} />
      <meta property="og:description" content={${dict.model}Id} />
    </>
  ))
  .render(({ ${dict.model}Id }) => {
    const { l } = usePage();
    const { ${dict.model}View } = fetch.view${dict.Model}(${dict.model}Id);
    return (
      <div className="container flex flex-col gap-4">
        <div className="flex items-center gap-4 font-bold text-lg">
          <${dict.Model}.Zone.View view={${dict.model}View} />
          <Link className={buttonRecipe()} href={\`/${dict.model}/\${${dict.model}Id}/edit\`}>
            {l("base.updateModel", { model: l("${dict.model}.modelName") })}
          </Link>
        </div>
      </div>
    );
  });
`,
  };
}
