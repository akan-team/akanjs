import { recipe, tv } from "akanjs/ui";

/**
 * minimal 앱의 recipe 레이어 — 이 앱에서 반복되는 변형을 모으는 **서버-안전** 모듈.
 * **여기엔 `"use client"` 를 붙이지 않는다** (서버 컴포넌트/페이지에서도 className을 조합할 수 있게).
 *
 * 레이어: page/styles.css(토큰) → 프레임워크 recipe(`akanjs/ui`) → **이 앱 recipe** → 컴포넌트/페이지.
 * 프레임워크가 주지 않는, 앱 고유의 반복 표면(그라디언트 히어로·아이콘 타일·챗 버블)을 시맨틱 토큰만으로
 * 기술한다. 프레임워크의 `recipe(tv({...}))` 팩토리를 그대로 써서 호출 규격을 통일한다.
 *
 * 규약: 새 앱 변형은 페이지에 인라인하지 말고 여기에 `export const <name>Recipe = recipe(tv({ base, variants }))`
 * 로 추가한 뒤 `import { <name>Recipe } from "@apps/minimal/ui"` 로 가져다 쓴다. 호출은
 * `<name>Recipe(변형객체, 커스텀클래스?)` — cn 불필요. (앱 ui 파일은 PascalCase 규약이라 파일명은 `Recipe.ts`.)
 */

/**
 * 무변형(variant 없음) 표면은 recipe 가 아니다 — 고를 옵션이 없는 look 을 함수로 감싸면 간접층만 는다.
 * 자기 마크업을 소유하면 컴포넌트(`<Screen>`, ui/Screen.tsx), 남의 컴포넌트 className 에 스킨을
 * 주입하면 아래처럼 공유 클래스 상수로 둔다.
 */
/** 상단 내비 바 스킨 — Layout.Navbar / Layout.TopInset 의 className 에 주입하는 무변형 상수. */
export const appNavClass = "border-foreground/10 border-b bg-background/80 px-5 backdrop-blur";

/**
 * 카드 표면 — 은은한 경계선 위 표면. `tone` 으로 채움을 고른다(muted 기본/card/glass).
 * radius/padding 은 기존 규약대로 호출부에서 조합한다: `appCard({ tone: "card" }, "rounded-3xl p-4")`.
 * 기본값(tone:muted)은 이전 base 와 동일한 클래스라 기존 `appCard(undefined, "...")` 호출부는 그대로 동작한다.
 */
export const appCard = recipe(
  tv({
    base: "border",
    variants: {
      tone: {
        muted: "border-foreground/10 bg-muted/70",
        card: "border-border bg-card text-card-foreground",
        glass: "border-foreground/10 bg-background/60 backdrop-blur",
      },
    },
    defaultVariants: { tone: "muted" },
  }),
);
export type AppCardVariants = NonNullable<Parameters<typeof appCard>[0]>;

/** 유틸리티 패널/콜아웃 표면 — rounded-box + border 위 시맨틱 tone(default/muted/primary/success/warning/info/outline) × padding(none/sm/md/lg). 카드가 콘텐츠 표면이면 박스는 톤으로 강조하는 그룹/콜아웃 컨테이너. */
export const appBox = recipe(
  tv({
    base: "rounded-box border",
    variants: {
      tone: {
        default: "border-border bg-background",
        muted: "border-border bg-muted",
        primary: "border-primary/30 bg-primary/10",
        success: "border-success/30 bg-success/10",
        warning: "border-warning/30 bg-warning/10",
        info: "border-info/30 bg-info/10",
        outline: "border-border border-dashed",
      },
      padding: { none: "", sm: "p-3", md: "p-4", lg: "p-5" },
    },
    defaultVariants: { tone: "muted", padding: "md" },
  }),
);
export type AppBoxVariants = NonNullable<Parameters<typeof appBox>[0]>;

/** 브랜드 그라디언트 표면. radius/padding/shadow 는 호출부에서 조합한다. */
export const gradientSurfaceRecipe = recipe(
  tv({
    base: "bg-gradient-to-br",
    variants: {
      tone: {
        brand: "from-primary via-secondary to-accent",
        duo: "from-primary to-secondary",
        warm: "from-accent to-primary",
      },
    },
    defaultVariants: { tone: "brand" },
  }),
);
export type GradientSurfaceVariants = NonNullable<Parameters<typeof gradientSurfaceRecipe>[0]>;

/** 아이콘 타일 — 토큰 배경 위 아이콘. size 로 사각 크기와 글자 스케일을 함께 잡는다. */
export const iconTileRecipe = recipe(
  tv({
    base: "flex items-center justify-center rounded-2xl bg-primary/15 text-primary",
    variants: {
      size: {
        sm: "h-10 w-10 text-xl",
        md: "h-11 w-11 text-xl",
        lg: "h-12 w-12 text-2xl",
        xl: "h-14 w-14 text-3xl",
      },
    },
    defaultVariants: { size: "md" },
  }),
);
export type IconTileVariants = NonNullable<Parameters<typeof iconTileRecipe>[0]>;

/** 챗 버블 — 수신(incoming)/발신(outgoing) 방향에 따라 정렬·모서리·색을 바꾼다. */
export const chatBubbleRecipe = recipe(
  tv({
    base: "max-w-[78%] rounded-3xl p-4 text-sm",
    variants: {
      side: {
        incoming: "rounded-tl-md bg-muted text-foreground/75",
        outgoing: "ml-auto rounded-tr-md bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { side: "incoming" },
  }),
);
export type ChatBubbleVariants = NonNullable<Parameters<typeof chatBubbleRecipe>[0]>;

/**
 * 네온/사이버펑크 버튼 스킨 — 프레임워크 buttonRecipe 의 **look 교체용**.
 * variant/size 표면을 buttonRecipe 와 동일하게 유지해야 `recipes.button` 슬롯에 주입 가능하다
 * (호출부가 넘기는 모든 variant 를 받아야 하므로). 각지고(rounded-none)·아웃라인·글로우·모노 대문자.
 * `_overrides.tsx` 에서 `override({ recipes: { button: neonButtonRecipe } })` 로 주입하면,
 * 그 라우트 서브트리의 모든 <Button> 이 동작(로딩→성공)은 그대로 둔 채 이 스킨으로 렌더된다.
 */
export const neonButtonRecipe = recipe(
  tv({
    base: "inline-flex items-center justify-center gap-2 rounded-none border-2 bg-transparent font-mono uppercase tracking-widest transition-all",
    variants: {
      variant: {
        primary:
          "border-primary text-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_14px] hover:shadow-primary/60",
        secondary: "border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
        accent: "border-accent text-accent hover:bg-accent hover:text-accent-foreground",
        outline: "border-border text-foreground hover:bg-muted",
        ghost: "border-transparent text-foreground hover:bg-muted",
        destructive:
          "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_14px] hover:shadow-destructive/60",
        success: "border-success text-success hover:bg-success hover:text-success-foreground",
        warning: "border-warning text-warning hover:bg-warning hover:text-warning-foreground",
        info: "border-info text-info hover:bg-info hover:text-info-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }),
);
