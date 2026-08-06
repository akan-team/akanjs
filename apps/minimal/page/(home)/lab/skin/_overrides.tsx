import { neonButtonRecipe } from "@apps/minimal/ui";
import { override } from "akanjs/ui";

// 이 라우트 서브트리(/lab/skin)에만 적용되는 recipe override.
// 프레임워크 buttonRecipe 의 look 을 neonButtonRecipe 로 교체 — <Button> 의 동작(로딩→성공)은 그대로.
export default override({ recipes: { button: neonButtonRecipe } });
