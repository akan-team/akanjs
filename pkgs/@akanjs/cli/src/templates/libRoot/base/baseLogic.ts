interface Dict {
  libName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `
// 현 디렉토리에서는 프로젝트 내 전체적으로 사용되는 로직을 구현하며, 따라서 백/프론트 비의존적인 pure js 코드만 구현 가능합니다.
// common폴더와 다른점은, base 코드는 시스템 전체에서 import되어 사용되므로, 가장 핵심적인 로직과 추상화된 기능만 구현해야합니다.
// @${dict.libName}/base에서는 서버/클라이언트 관련 라이브러리(@*/server, @*/nest, @*/client, @*/next)를 모두 import할 수 없으며, @*/base 라이브러리만 import 가능합니다.

export const someBaseLogic = () => {
  //
};
  `;
}
