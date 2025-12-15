export interface GuideScan {
  type: "example" | "source" | "usage" | (string & {});
  description: string;
  path: string;
  filterText?: string;
  sample?: number;
}
export interface GuideUpdate {
  filePath: string;
  contents: string[];
  rules: string[];
}
export interface GuideGenerateJson {
  title: string;
  description: string;
  scans: GuideScan[];
  update: GuideUpdate;
  page?: string;
}
