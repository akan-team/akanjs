import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Unit.tsx`,
    content: `
import { ModelProps } from "@akanjs/client";
import { cnst, usePage } from "@${dict.sysName}/client";
import { Link } from "@akanjs/ui";

export const Card = ({ ${dict.model}, href }: ModelProps<"${dict.model}", cnst.Light${dict.Model}>) => {
  const { l } = usePage();
  return (
    <Link href={href} className="w-full">
      <div>{l("${dict.model}.id")}:{${dict.model}.id}</div>
    </Link>
  );
};
`,
  };
}
