/**
 * 무변형(variant 없음) 표면은 recipe 가 아니다 — 고를 옵션이 없는 look 을 함수로 감싸면 간접층만 는다.
 * 자기 마크업을 소유하면 컴포넌트(`<Screen>`, ui/Screen.tsx), 남의 컴포넌트 className 에 스킨을
 * 주입하면 아래처럼 공유 클래스 상수로 둔다.
 */
/** 상단 내비 바 스킨 — Layout.Navbar / Layout.TopInset 의 className 에 주입하는 무변형 상수. */
export const appNavClass = "border-foreground/10 border-b bg-background/80 px-5 backdrop-blur";
