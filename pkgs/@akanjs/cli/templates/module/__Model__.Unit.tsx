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
  const propsType = [`"${model}"`, `cnst.Light${Model}`];
  const flatSignature = BiomeForm.typeArgs(
    "",
    `export const Card = ({ ${model}, href }: ModelProps`,
    propsType,
    ") => {",
  );
  const signature = flatSignature.includes("\n")
    ? `export const Card = ({\n  ${model},\n  href,\n${BiomeForm.typeArgs("", "}: ModelProps", propsType, ") => {")}`
    : flatSignature;
  return {
    filename: `${Model}.Unit.tsx`,
    content: `${BiomeForm.importFrom(["type cnst", "usePage"], `@${dict.sysType}s/${dict.sysName}/client`)}
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

${signature}
  const { l } = usePage();
  return (
    <Link href={href} className="w-full">
      <div>
${BiomeForm.jsxSpaced("        ", `{l("${model}.name")}:`, `{${model}.name}`)}
      </div>
    </Link>
  );
};
`,
  };
}
