# daisyui → shadcn(Radix + CVA + 시맨틱 토큰) 마이그레이션 — 진행 상황 & 이어가기 가이드

브랜치: `migration/uiSystem`. 상세 플랜은 별도(팀 공유). 이 문서는 **남은 작업을 앱 구동 환경에서 이어가기 위한 핸드오프**.

## 완료 (커밋됨)

- **Phase 0 토대**: `pkgs/akanjs/client/cn.ts`(clsx+tailwind-merge, `extendTailwindMerge`로 커스텀 토큰 등록) · Radix 8종 · cva · biome `useSortedClasses`에 `cn` 등록.
- **Phase 1 토큰 계층**: `apps/{akan,minimal}/page/styles.css` → 순수 토큰(`:root`=dark 기본 보존, `@theme inline` + `@custom-variant dark`). daisyui `@plugin "daisyui/theme"` 제거, **컴포넌트 플러그인 `@plugin "daisyui"`는 유지**(Phase 3까지). **과도기 별칭**(`--color-base-100: var(--background)` 등)이 구 클래스를 신 토큰으로 매핑 → 비파괴.
- **Phase 1 codemod**: `scripts/codemods/daisyuiTokenRename.ts` (apps/libs 1,629건/123파일). 소비자 재사용 가능.
- **Phase 2a 프리미티브(de-daisyui 완료)**: Button(정본 `buttonVariants`), Badge(`badgeVariants`), Loading 스피너(Area/Model.View/Signal.Response), Pagination, ToggleSelect, Model/Remove, Model/SureToRemove.

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
