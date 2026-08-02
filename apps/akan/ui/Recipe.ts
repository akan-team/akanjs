import { recipe, tv } from "akanjs/ui";

/**
 * akan 앱의 recipe 레이어 — 이 앱에서 반복되는 변형을 모으는 **서버-안전** 모듈.
 * **`"use client"` 를 붙이지 않는다** (서버 컴포넌트/페이지에서도 className을 조합할 수 있게).
 *
 * 레이어: page/styles.css(토큰) → 프레임워크 recipe(`akanjs/ui`) → **이 앱 recipe** → 컴포넌트/페이지.
 * 규약: 새 앱 변형은 페이지에 인라인하지 말고 여기에 `export const <name>Recipe = recipe(tv({ base, variants }))`
 * 로 추가한 뒤 `import { <name>Recipe } from "@apps/akan/ui"` 로 가져다 쓴다. 호출은 `<name>Recipe(변형객체, 커스텀클래스?)`.
 */

/** 콘텐츠 표면 패널 — `rounded-* border bg-background p-*` 계열 통합. row 는 리스트/행 표면(px만). */
export const panelRecipe = recipe(
  tv({
    base: "border",
    variants: {
      tone: {
        solid: "border-border bg-background",
        glass: "border-foreground/10 bg-foreground/4 backdrop-blur",
      },
      radius: { lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" },
      padding: { sm: "p-3", md: "p-4", lg: "p-5", xl: "p-8", row: "px-4 py-0" },
      shadow: { true: "shadow-md" },
    },
    defaultVariants: { tone: "solid", radius: "xl", padding: "md" },
  }),
);
export type PanelVariants = NonNullable<Parameters<typeof panelRecipe>[0]>;

/** 문서 불릿 리스트 — `list-disc space-y-2 pl-5`. */
export const docsListRecipe = recipe(tv({ base: "list-disc space-y-2 pl-5" }));

/** 카드/셀 그리드 — `grid gap-3` 위에 cols 브레이크포인트를 얹는다. */
export const cardGridRecipe = recipe(
  tv({
    base: "grid gap-3",
    variants: {
      cols: { two: "xl:grid-cols-2", three: "xl:grid-cols-3", mdTwo: "md:grid-cols-2" },
    },
    defaultVariants: { cols: "two" },
  }),
);
export type CardGridVariants = NonNullable<Parameters<typeof cardGridRecipe>[0]>;
