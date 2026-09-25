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
import { Load } from "akanjs/ui";
import { fetch, usePage, ${dict.Model} } from "@apps/${dict.appName}/client";
import type { PageConfig } from "akanjs/client";

interface PageProps {
  params: { ${dict.model}Id: string };
}

export default async function Page({ params }: PageProps) {
  const { l } = usePage();
  const { ${dict.model}Id } = params;
  const { ${dict.model}, ${dict.model}Edit } = await fetch.edit${dict.Model}(${dict.model}Id);
  return (
    <div className="container">
      <div className="flex justify-between m-4 mt-8">
        <div className="text-xl text-primary flex gap-2 items-center">
          {l("base.updateModel", { model: l("${dict.model}.modelName") })}
        </div>
      </div>
      <Load.Edit
        className="flex flex-col items-center"
        slice={fetch.slice["${dict.model}InPublic"]}
        edit={${dict.model}Edit}
        type="form"
        onCancel="back"
        onSubmit="/${dict.model}"
      >
        <${dict.Model}.Template.General />
      </Load.Edit>
    </div>
  );
}
export const pageConfig = { transition: "none" } satisfies PageConfig;
`,
  };
}
