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
import { Load } from "@akanjs/ui";
import { fetch, usePage, ${dict.Model} } from "${dict.appName}/client";
import type { CsrConfig } from "@akanjs/client";

interface PageProps {
  params: { ${dict.model}Id: string };
}

export default function Page({ params }: PageProps) {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { ${dict.model}Id } = await params;
        const { ${dict.model}, ${dict.model}Edit } = await fetch.edit${dict.Model}(${dict.model}Id);
        return { ${dict.model}, ${dict.model}Edit } as const;
      }}
      render={({ ${dict.model}, ${dict.model}Edit }) => (
        <div className="container">
          <div className="flex justify-between m-4 mt-8">
            <div className="text-xl text-primary flex gap-2 items-center">
              {l("base.updateModel", { model: l("${dict.model}.modelName") })}
            </div>
          </div>
          <Load.Edit
            className="flex flex-col items-center"
            sliceName="${dict.model}InPublic"
            edit={${dict.model}Edit}
            type="form"
            onCancel="back"
            onSubmit="/${dict.model}"
          >
            <${dict.Model}.Template.General />
          </Load.Edit>
        </div>
      )}
    />
  );
}
Page.csrConfig = { transition: "none" } satisfies CsrConfig;
`,
  };
}
