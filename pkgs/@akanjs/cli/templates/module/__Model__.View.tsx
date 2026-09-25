import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
  sysType: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.View.tsx`,
    content: `
import { clsx } from "akanjs/client";
import { cnst, usePage } from "@${dict.sysType}s/${dict.sysName}/client";

interface GeneralProps {
  className?: string;
  ${dict.model}: cnst.${dict.Model};
}
export const General = ({ className, ${dict.model} }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("w-full", className)}>
      <div>{l("${dict.model}.name")}: {${dict.model}.name}</div>
    </div>
  );
};
`,
  };
}
