import { neonBadgeRecipe, neonButtonRecipe, neonInputRecipe } from "@apps/minimal/ui";
import { override } from "akanjs/ui";

// 이 라우트 서브트리(/lab/skin)에만 적용되는 recipe override.
// 프레임워크 recipe 세 슬롯의 look 을 네온 스킨으로 교체 — 컴포넌트 동작은 전부 그대로다:
// <Button> 의 로딩→성공 상태머신, <Input> 의 controlled value/onChange, <Badge> 의 variant 매핑.
export default override({
  recipes: { button: neonButtonRecipe, badge: neonBadgeRecipe, input: neonInputRecipe },
});
