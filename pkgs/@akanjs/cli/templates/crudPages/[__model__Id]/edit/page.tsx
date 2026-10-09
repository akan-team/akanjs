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
import { Load } from "akanjs/ui";

export default page()
  .param("${dict.model}Id", ID)
  .config({ transition: "none" })
  .render(({ ${dict.model}Id }) => {
    const { l } = usePage();
    const { ${dict.model}Edit } = fetch.edit${dict.Model}(${dict.model}Id);
    return (
      <div className="container">
        <div className="m-4 mt-8 flex justify-between">
          <div className="flex items-center gap-2 text-primary text-xl">
            {l("base.updateModel", { model: l("${dict.model}.modelName") })}
          </div>
        </div>
        <Load.Edit
          className="flex flex-col items-center"
          slice={fetch.slice.${dict.model}InPublic}
          edit={${dict.model}Edit}
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
