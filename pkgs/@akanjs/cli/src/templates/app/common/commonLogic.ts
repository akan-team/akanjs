import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
// 현 디렉토리에서는 프로젝트 내 전체적으로 사용되는 세부적인 로직을 구현하며, 따라서 백/프론트 비의존적인 pure js 코드만 구현 가능합니다.
// base폴더와 다른점은, common 코드는 사용하는 파일에서만 import되기 때문에, 외부라이브러리를 import해서 사용하거나 상세한 로직을 구현할 수 있습니다.
// @${dict.appName}/common에서는 서버/클라이언트 관련 라이브러리(@*/server, @*/nest, @*/client, @*/next)를 모두 import할 수 없으며, @*/base와 @*/common 라이브러리만 import 가능합니다.

export const someCommonLogic = () => {
  //
};
  `;
}
