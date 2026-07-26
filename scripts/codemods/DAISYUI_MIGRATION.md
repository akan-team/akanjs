# daisyui → shadcn(Radix + CVA + 시맨틱 토큰) 마이그레이션 — 진행 상황 & 이어가기 가이드

브랜치: `migration/uiSystem`. 상세 플랜은 별도(팀 공유). 이 문서는 **남은 작업을 앱 구동 환경에서 이어가기 위한 핸드오프**.

## ✅ 완료 — daisyUI 라이브러리 완전 제거 (커밋됨)

- `bun remove daisyui` + 전 package.json/config에서 dep 제거. `@plugin "daisyui"` 0(모든 styles.css + 신규앱 템플릿). **적용된 daisyUI 컴포넌트 클래스 0** (프레임워크·minimal·akan·libs·appSample·신규앱 템플릿).
- 프레임워크 `pkgs/akanjs/ui`: cva 프리미티브(Button/Badge) + 신규 Tooltip/Switch/SignalCollapse(Radix/`<details>`) + Dropdown 커스텀.
- 시맨틱 토큰 계층(`@theme inline` + `[data-theme]`)으로 통일, 접근성 색 수정 포함. 신규앱 styles.css 템플릿도 토큰 계층.
- AI 프롬프트(`guideline.prompt.ts`·`module.request.ts`·`cssRule.json`) → daisyUI 금지·akanjs/ui 권장.
- akan: mockup(phone/browser/code) 토큰 프레임 대체, 문서 프로즈/링크(daisyui.com→radix-ui.com) 갱신.
- 잔여 "daisyui" 문자열 = 설명용 코드 주석 + "DaisyUI 금지" 프롬프트 + 생성물 `docs-search-index.json`(문서 재빌드 시 갱신)뿐.
- 커밋: `80ef7d5`(프레임워크) · `f8b17a4`(minimal 컷오버+롱테일) · `f5b6161`(라이브러리 완전 제거) + 문서 프로즈.

---
### (이하 과거 진행 기록)

## 완료 (커밋됨)

- **Phase 0 토대**: `pkgs/akanjs/client/cn.ts`(clsx+tailwind-merge, `extendTailwindMerge`로 커스텀 토큰 등록) · Radix 8종 · cva · biome `useSortedClasses`에 `cn` 등록.
- **Phase 1 토큰 계층**: `apps/{akan,minimal}/page/styles.css` → 순수 토큰(`:root`=dark 기본 보존, `@theme inline` + `@custom-variant dark`). daisyui `@plugin "daisyui/theme"` 제거, **컴포넌트 플러그인 `@plugin "daisyui"`는 유지**(Phase 3까지). **과도기 별칭**(`--color-base-100: var(--background)` 등)이 구 클래스를 신 토큰으로 매핑 → 비파괴.
- **Phase 1 codemod**: `scripts/codemods/daisyuiTokenRename.ts` (apps/libs 1,629건/123파일). 소비자 재사용 가능.
- **Phase 2a 프리미티브(de-daisyui 완료)**: Button(정본 `buttonVariants`), Badge(`badgeVariants`), Loading 스피너(Area/Model.View/Signal.Response), Pagination, ToggleSelect, Model/Remove, Model/SureToRemove.

## Phase 2b — de-daisyui 진행 (작업트리, 미커밋)

- **컬러 무손실 접근성 수정(apps/{minimal,akan}/page/styles.css)**: dark의 warning/accent/open foreground를 흰색→어두운색(대비 1.4~2.4 실패 해소), card/popover를 background와 분리(elevation). light의 warning/accent foreground도 어두운색.
- **컴포넌트 클래스 완전 제거(component-class-free)**: `Constant/Doc`(collapse→`<details>`, tabs→세그먼트, tooltip→`title`), `Data/{ListContainer,Item}`, `Signal/{Request,Response}`, `Signal/PubSub`(btn/join만·collapse 잔존), `Popconfirm`, `DraggableList`, `Layout/{Sider,LeftSider}`, `Model/EditModal`(btn만·modal 잔존), `Dialog/Modal`(btn만·modal 잔존), `Menu`(menu→flex 리스트), `Select`(트리거 btn→border/rounded). 모두 biome 0 error + import 스모크 통과.
- `apps/minimal/ui/UiLab.tsx`(/lab QA): 헤더+ThemeToggle 복구, daisyui 섹션→shadcn/`<details>`.

## Phase 2c — 프레임워크 de-daisyui 완료 (작업트리, 미커밋)

- **`pkgs/akanjs/ui` 전체 daisyui 컴포넌트 클래스 0건.** Signal 허브 collapse→`SignalCollapse`(`<details>`), 공용 **Tooltip**(Radix)·**Switch**(Radix)·**SignalCollapse** 프리미티브 신설, dropdown→커스텀(외부클릭), toggle/swap→Switch, stat/stats→토큰 flex, Input/Field/Textarea 토큰 박스화, Menu/Select/Dashboard/Insight/ObjectId/RecentTime 등 변환.
- 토큰 rename codemod 재적용(pkgs/apps/libs .tsx/.ts, ~1090건): `base-100→background`, `base-content→foreground`, `*-content→*-foreground`, `error→destructive`, `primary-focus→primary`. (`base-200/300`은 실토큰 유지.)
- `server/systemPageDocument.tsx` btn 제거(자체 CSS), AI 프롬프트(`guideline.prompt.ts`/`module.request.ts`) → daisyui 금지·akanjs/ui 권장으로 플립.
- biome 0 error + import 스모크 전부 통과.

## Phase 2d — 앱/lib 컴포넌트 클래스 대량 변환 (작업트리, 미커밋)

- **codemod**(`scratchpad/daisyuiComponentCodemod.ts`)로 순수 문자열 `className`의 btn/badge → `buttonVariants`/`badgeVariants` 자동 변환(60파일, btn ~180 · badge ~30, import 자동 추가).
- 수동: 템플릿리터럴/조건부 btn, `btn-square/xl` 특수, collapse(`Docs/Layout` 2곳→`<details>`), dropdown(`Admin.Util`→`Dropdown`), tooltip(`User.Unit`→`Tooltip`), toggle(`User.Util`→`Switch`), alert/input/textarea/file-input 토큰화, `Badge`에 `info` variant 추가.
- 문서 페이지의 **표시용 예제 코드**(`code={...}`)와 프로즈는 보존(변환 대상 아님).

## Phase 3 — minimal 완전 컷오버 + akan 존치 (작업트리, 미커밋)

- **`minimal` 앱: daisyui 완전 제거.** btn/badge codemod + divider(×706)/card/checkbox/input/loading/textarea/link 등 순수 스왑 codemod + 구조적 수동 변환. `@plugin "daisyui"` + 별칭 블록 **제거** 완료. minimal+libs 적용 daisyui 컴포넌트 클래스 0 확인.
- **프레임워크 `styles.css`**: `var(--color-base-100/base-content)` → `--color-background/foreground` (별칭 없이도 테마 적용).
- **생성 파이프라인**: `appSample` 템플릿 de-daisyui(btn/badge/collapse→details/dropdown→Dropdown/toggle→Switch/loading spinner). AI 프롬프트(`guideline.prompt.ts`·`module.request.ts`·`cssRule.json`) daisyui 금지로 플립. → **신규 생성 앱은 daisyui-free.**
- **`akan` 앱: daisyui 존치(의도적).** akan은 daisyui를 문서로 가르치고 `mockup-phone/browser/code` 쇼케이스를 사용 → `@plugin`+별칭+dep 유지. akan 페이지도 btn/badge/divider 등은 변환됨(플러그인은 mockup 등 잔여용).
- **daisyui npm dep 유지**(akan이 사용). `bun remove daisyui`는 akan mockup 대체 컴포넌트 작성 후 가능.

## (참고) akan 잔여 daisyui

측정된 잔여 적용 클래스(주로 `apps/akan` 문서 사이트):
- `className="divider"` **×706**, `.card` ×22, `.checkbox` ×12, bare `.input` ×14, `.loading` ×6 (+ hero/drawer/timeline 등 쇼케이스 클래스 가능성).
- 대부분 순수 스왑(`divider`→`my-4 h-px w-full bg-border`)이라 codemod 가능하나, 수천 사이트 규모 + 실빌드 육안 QA 필요.
- **판단 필요**: akan은 내부 문서/쇼케이스 앱 → (a) 전량 변환, (b) daisyui 유지 허용, (c) 호환 CSS shim 중 택1.

## (구) ⚠️ 컷오버 불가 — 앱/라이브러리 페이지가 아직 daisyui 사용

- `@plugin "daisyui"` + 별칭 블록은 **양 앱 styles.css에 그대로 유지**(제거 시 앱 페이지 깨짐).
- 미변환 대량 표면(수백 건): `apps/minimal/page/**`, `apps/minimal/ui/**`, `apps/akan/page/**`(특히 `page/(docs)`·`v1/docs` 문서들), `apps/akan/ui/**`, `libs/shared/{lib,ui}/**`, `libs/util/ui/**`.
- 생성 파이프라인(미변환): `pkgs/@akanjs/cli/templates/appSample/**`, devkit/frontendBuild의 daisyui 주입, `package.runner/workspace.runner/*.test.ts`의 daisyui, npm dep(`bun remove daisyui`). → 신규 생성 앱이 토큰 계층을 받도록 devkit 수정 + generate/build/test 검증 필요.

## 남은 STRUCT 파일 (참고, 프레임워크는 이미 완료)

- **collapse**(Signal 허브 `Signal/style.ts`의 `endpointCard/endpointContent` + 소비자 `Signal/{Doc,PubSub,Message,RestApi}`): `<details>` 또는 Radix Accordion으로 허브 일괄 전환.
- **tooltip**(공용 Tooltip 프리미티브 신설 필요 → `ObjectId,RecentTime,Field,Signal/{Arg,Object},Tab/Menu` 언블록).
- **dropdown→Radix**: `Dropdown,System/SelectLanguage,Model/ViewEditModal`.
- **toggle/swap→Radix Switch**: `System/{ThemeToggle,DevModeToggle}`.
- **stat/stats**: `Data/{Dashboard,Insight}`.
- **Input/Field/Radio**(동적 className, 대형).
- **`modal` 클래스**: `Dialog/Modal`, `Model/EditModal` 및 Model/* 래퍼(daisyui `.modal` → Tailwind fixed/flex).
- **토큰 클래스 잔여**(별칭이 커버 중, 컷오버 전 일괄): `base-100/200/300`, `base-content`, `*-content`, `primary-focus`.

## 정본 변환 레시피

- **버튼**: `btn btn-*` → `cn(buttonVariants({ variant, size }), extra)` (raw 요소) 또는 `<Button variant size>` (컴포넌트). 매핑: primary/secondary/outline/ghost/destructive(=btn-error)/success/warning/link, size xs/sm/md/lg/icon. `btn-square`=size icon.
- **배지**: `badge badge-*` → `cn(badgeVariants({ variant }))`. variant: default/primary/secondary/accent/success/warning/error/outline.
- **색 토큰(프레임워크는 codemod 대상 아니므로 수동)**: `base-content`→`foreground`, `base-100`→`background`, `error`→`destructive`, `*-content`→`*-foreground`. `base-200/300`·bare primary 등은 유지.
- **`clsx`→`cn`**: import와 **모든 호출부** 함께 교체(누락 시 미정의 참조 버그 — import 스모크로 검증).
- **join/join-item**: `inline-flex` 컨테이너 + 아이템 `rounded-none`(컨테이너 `overflow-hidden rounded-field`).
- **menu**: Tailwind 리스트(flex-col + 패딩/hover).
- **Radix 전환**: `dropdown/dropdown-content`→Radix DropdownMenu, `tooltip`→Radix Tooltip, `toggle/swap`→Radix Switch, `collapse`→Radix Accordion/`<details>`, checkbox/radio→Radix. **Radix Portal은 `container={#modal-root}` 명시**(모바일 z-스택), 애니메이션은 `data-[state=open/closed]`에 기존 `animate-*` 연결.

## 남은 프레임워크 파일 (~28 + 동적 Input/Select/Radio)

### 🔴 실환경 시각 검증 필수 (대형/Radix)
`Input.tsx`(~651줄, 동적 className) · `Field.tsx`(~644줄) · `Select.tsx`(동적, multi-select라 Radix Select 불가 → 커스텀 유지+토큰) · `Radio.tsx`(onChange idx 어댑터) · `Menu.tsx` · `Dropdown.tsx` · `Tooltip`(Signal/Arg의 `tooltip` 포함) · `System/ThemeToggle.tsx`(toggle/swap) · `Popconfirm.tsx` · `Tab/Panel.tsx` · `System/SelectLanguage.tsx` · `System/DevModeToggle.tsx` · `Dialog/Modal.tsx`(커스텀 유지, 토큰만)

### mid 표현형 (패턴 반복, 저리스크)
`Constant/Doc.tsx` · `Data/{Dashboard,Insight,Item,ListContainer,QueryMaker}.tsx` · `Layout/{Sider,LeftSider}.tsx` · `Model/ViewEditModal.tsx` · `ObjectId.tsx` · `ScreenNavigator.tsx` · `Signal/{Arg,Doc,Message,Object,PubSub,Request,Response,RestApi}.tsx`

## 검증 프로토콜 (실환경)

1. `bun run akan start akan` / `start minimal` — 렌더 + 테마 전환(light/dark) 육안.
2. **Playwright 시각회귀**: 마이그레이션 전/후 주요 화면 스크린샷 diff(설치돼 있음).
3. 각 파일: biome `check`(파싱/린트) + `bun -e 'import(...)'` 스모크.
4. 완료 후: `@plugin "daisyui"`(컴포넌트) + styles.css **과도기 별칭 블록** 제거 → `grep -r daisyui`(dist/.akan 제외) 0 확인.

## 주의

- **IDE 진단(parse/redeclare/unused)이 이 브랜치에서 stale하게 오탐** → **biome가 진실**. biome로 검증할 것.
- **기존 빌드 red는 내 작업 무관**: 별개 "모바일 알림" 기능 WIP(`ModulesOptions`의 rootAdminInfo/firebase, Blob 타입). 그 기능 작성자가 해소해야 `akan build` 녹색.
- Radix는 pkgs/akanjs/node_modules에 설치(비호이스트) — 생성앱 배선(package.runner) 전환 시 확인(Phase 4).
