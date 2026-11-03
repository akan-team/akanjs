import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../biomeForm";

interface Dict {
  Model: string;
  model: string;
  appName: string;
  clientPath: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const form = `    const ${dict.model}Form: Partial<cnst.${dict.Model}> =`;
  return {
    filename: "_index.tsx",
    content: `${BiomeForm.importFrom(["type cnst", "fetch", "usePage", dict.Model], dict.clientPath)}
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .config({ transition: "none" })
  .render(() => {
    const { l } = usePage();
${BiomeForm.fits(`${form} {};`) ? `${form} {};` : `${form}\n      {};`}
    return (
      <div className="container">
        <div className="m-4 mt-8 flex justify-between">
          <div className="flex items-center gap-2 text-primary text-xl">
            + {l("base.createModel", { model: l("${dict.model}.modelName") })}
          </div>
        </div>
        <Load.Edit
          className="flex flex-col items-center"
          slice={fetch.slice.${dict.model}InPublic}
          edit={${dict.model}Form}
          type="form"
          onCancel="back"
          onSubmit="/${dict.model}"
        >
          <${dict.Model}.Template.General />
        </Load.Edit>
      </div>
    );
  });
`,
  };
}
