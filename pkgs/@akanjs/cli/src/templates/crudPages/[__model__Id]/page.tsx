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
import { ${dict.Model}, fetch, usePage } from "${dict.appName}/client";
import { Link, Load } from "@akanjs/ui";
import type { CsrConfig } from "@akanjs/client";

interface PageProps {
  params: { ${dict.model}Id: string };
}

export async function generateMetadata({ params }: PageProps) {
  const { ${dict.model}Id } = await params;
  const { ${dict.model} } = await fetch.view${dict.Model}(${dict.model}Id);
  return {
    title: ${dict.model}.id,
    description: ${dict.model}.id,
    openGraph: {
      title: ${dict.model}.id,
      description: ${dict.model}.id,
      // images: ${dict.model}.thumbnails.map((i) => i.url),
    },
  };
}
export default function Page({ params }: PageProps) {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { ${dict.model}Id } = await params;
        const { ${dict.model}, ${dict.model}View } = await fetch.view${dict.Model}(${dict.model}Id);
        return { ${dict.model}, ${dict.model}View } as const;
      }}
      render={({ ${dict.model}, ${dict.model}View }) => (
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
      )}
    />
  );
}
Page.csrConfig = { transition: "none" } satisfies CsrConfig;
`,
  };
}
