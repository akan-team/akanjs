import type { FileContent } from "@akanjs/devkit";

export interface ComponentDefaultDescriptionProps {
  sysName: string;
  modelName: string;
  ModelName: string;
  constant: string;
  properties: { key: string; source: string }[];
  exampleFiles: FileContent[];
}

export const componentDefaultDescription = ({
  modelName,
  ModelName,
  exampleFiles,
  constant,
  properties,
}: ComponentDefaultDescriptionProps) => ``;
