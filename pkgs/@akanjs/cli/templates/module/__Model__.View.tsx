import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
  sysType: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  return {
    filename: `${Model}.View.tsx`,
    content: `${BiomeForm.importFrom(["type cnst", "usePage"], `@${dict.sysType}s/${dict.sysName}/client`)}
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  ${model}: cnst.${Model};
}
export const General = ({ className, ${model} }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn("w-full", className)}>
      <div>
${BiomeForm.jsxSpaced("        ", `{l("${model}.name")}:`, `{${model}.name}`)}
      </div>
    </div>
  );
};
`,
  };
}
