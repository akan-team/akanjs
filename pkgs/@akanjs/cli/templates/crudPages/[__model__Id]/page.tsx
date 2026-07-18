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

interface PageProps {
  params: { ${dict.model}Id: string };
}

export async function generateHead({ params }: PageProps) {
  const { ${dict.model}Id } = params;
  const { ${dict.model} } = await fetch.view${dict.Model}(${dict.model}Id);
  return (
    <>
      <title>{${dict.model}.id}</title>
      <meta name="description" content={${dict.model}.id} />
      <meta property="og:title" content={${dict.model}.id} />
      <meta property="og:description" content={${dict.model}.id} />
    </>
  );
}
export default async function Page({ params }: PageProps) {
  const { l } = usePage();
  const { ${dict.model}Id } = params;
  const { ${dict.model}, ${dict.model}View } = await fetch.view${dict.Model}(${dict.model}Id);
  return (
    <div className="container flex flex-col gap-4">
      <div className="flex gap-4 font-bold text-lg items-center">
        <${dict.Model}.Zone.View view={${dict.model}View} />
        <Link href={\`/${dict.model}/\${${dict.model}.id}/edit\`}>
          <button className="btn">
            {l("base.updateModel", { model: l("${dict.model}.modelName") })}
          </button>
        </Link>
      </div>
    </div>
  );
}
export const pageConfig = { transition: "none" } satisfies PageConfig;
`,
  };
}
