import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp().start();
};
void run();

  `;
}
