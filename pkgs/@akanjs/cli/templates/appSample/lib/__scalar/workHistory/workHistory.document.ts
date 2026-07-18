import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { by } from "akanjs/document";

import * as cnst from "./workHistory.constant";

export class WorkHistory extends by(cnst.WorkHistory) {}
`;
}
