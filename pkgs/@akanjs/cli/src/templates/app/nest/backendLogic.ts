import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
// 현 디렉토리에서는 백엔드에서 사용하는 로직을 추가할 수 있습니다.
// @${dict.appName}/nest에서는 클라이언트 관련 라이브러리(@*/client, @*/next)를 import할 수 없습니다.

export const someBackendLogic = () => {
  //
};
  `;
}
