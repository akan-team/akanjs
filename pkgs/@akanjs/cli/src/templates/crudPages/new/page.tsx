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
import { cnst, fetch, usePage, ${dict.Model} } from "@${dict.appName}/client";
import type { CsrConfig } from "@akanjs/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const ${dict.model}Form: Partial<cnst.${dict.Model}> = {};
        return { ${dict.model}Form } as const;
      }}
      render={({ ${dict.model}Form }) => (
        <div className="container">
          <div className="flex justify-between m-4 mt-8">
            <div className="text-xl text-primary flex gap-2 items-center">
              + {l("base.createModel", { model: l("${dict.model}.modelName") })}
            </div>
          </div>
          <Load.Edit
            className="flex flex-col items-center"
            sliceName="${dict.model}InPublic"
            edit={${dict.model}Form}
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
