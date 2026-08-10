"use client";
import { dayjs } from "akanjs/base";
import {
  Badge,
  BottomSheet,
  Button,
  buttonRecipe,
  Clipboard,
  Copy,
  Dialog,
  Dropdown,
  Empty,
  Field,
  Input,
  Layout,
  Link,
  Loading,
  Menu,
  Modal,
  ObjectId,
  Pagination,
  Popconfirm,
  Radio,
  RecentTime,
  Select,
  Switch,
  System,
  Tab,
  Table,
  ToggleSelect,
  Tooltip,
} from "akanjs/ui";
import { type ReactNode, useState } from "react";
import { appBox, appCard, appNavClass } from "./Recipe";
import { Screen } from "./Screen";

// akanjs/ui 프리미티브 데모 실험실. 카테고리별 페이지(page/(home)/lab/*)에서 렌더된다.
// 모든 색은 시맨틱 토큰만 사용 → styleGuard 통과. 상단 토글로 light/dark 를 나란히 확인.

const CATEGORIES = [
  {
    href: "/lab/essentials",
    title: "Essentials",
    desc: "자주 쓰는 컴포넌트 한눈에 — Button · Input · Field · Select · Badge · Switch · Modal · Table",
  },
  { href: "/lab/tokens", title: "Tokens", desc: "색 · radius 토큰 스와치" },
  { href: "/lab/surfaces", title: "Surfaces", desc: "Card · Box · Button — appCard/appBox recipe + 프레임워크 Button" },
  { href: "/lab/buttons", title: "Buttons", desc: "Button · ToggleSelect · Pagination · Copy" },
  { href: "/lab/status", title: "Status", desc: "Badge · Loading · Empty · Tooltip · ObjectId · RecentTime" },
  { href: "/lab/forms", title: "Forms", desc: "Input · Field · Select · Radio · Switch · Date" },
  {
    href: "/lab/overlays",
    title: "Overlays",
    desc: "Modal · Dialog · Dropdown · Popconfirm · BottomSheet · Menu · Tab",
  },
  { href: "/lab/data", title: "Data", desc: "Table · Pagination" },
  { href: "/lab/skin", title: "Recipe Override", desc: "recipe 슬롯 교체 — 동작 유지, look만 네온으로" },
] as const;

const Section = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
  <section className="border-border border-t px-5 py-6">
    <div className="mb-4">
      <h2 className="font-semibold text-foreground text-lg">{title}</h2>
      {note ? <p className="mt-0.5 text-foreground/55 text-sm">{note}</p> : null}
    </div>
    {children}
  </section>
);

// 모바일 프레임이 페이지 스크롤(.akan-page-content)과 상단 크롬을 소유하므로, 페이지는 자체 overflow 스크롤
// 컨테이너나 sticky 헤더를 만들지 않는다(스택 슬라이드 전환과 충돌 → "렌더 후 이동" 글리치). 기존 stack
// 페이지처럼 <Screen> + Layout.Navbar(프레임 고정 크롬에 포털) 패턴을 따른다.
const LabShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <Screen className="pb-24">
    <Layout.Navbar className={appNavClass} back right={<System.ThemeToggle themes={["dark", "light"]} />}>
      <span className="font-semibold">{title}</span>
    </Layout.Navbar>
    {children}
  </Screen>
);

// ── /lab (허브) ─────────────────────────────────────────────
export const LabHub = () => (
  <div className="min-h-screen bg-background px-5 pt-6 pb-24 text-foreground">
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-bold text-2xl">akanjs/ui Lab</h1>
        <p className="mt-1 text-foreground/60 text-sm">프리미티브를 카테고리별로 light/dark 에서 확인하세요.</p>
      </div>
      <System.ThemeToggle themes={["dark", "light"]} />
    </header>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CATEGORIES.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-box border border-border bg-card p-4 text-card-foreground transition-colors hover:bg-muted"
        >
          <div className="font-semibold">{c.title}</div>
          <div className="mt-1 text-foreground/55 text-sm">{c.desc}</div>
        </Link>
      ))}
    </div>
  </div>
);

// ── /lab/tokens ─────────────────────────────────────────────
const SWATCHES = [
  { name: "background / foreground", cls: "bg-background text-foreground border border-border" },
  { name: "primary", cls: "bg-primary text-primary-foreground" },
  { name: "secondary", cls: "bg-secondary text-secondary-foreground" },
  { name: "accent", cls: "bg-accent text-accent-foreground" },
  { name: "muted", cls: "bg-muted text-muted-foreground" },
  { name: "success", cls: "bg-success text-success-foreground" },
  { name: "warning", cls: "bg-warning text-warning-foreground" },
  { name: "destructive", cls: "bg-destructive text-destructive-foreground" },
  { name: "info", cls: "bg-info text-info-foreground" },
  { name: "card", cls: "bg-card text-card-foreground border border-border" },
];

export const LabTokens = () => (
  <LabShell title="Tokens">
    <Section title="색상 토큰" note="시맨틱 토큰 = 유일한 색 어휘 (raw 팔레트는 어휘 폐쇄로 차단됨)">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SWATCHES.map((s) => (
          <div key={s.name} className={`flex h-16 items-end rounded-box p-2 text-xs ${s.cls}`}>
            {s.name}
          </div>
        ))}
      </div>
    </Section>
    <Section title="Radius" note="--radius-box / --radius-field 토큰">
      <div className="flex flex-wrap gap-4">
        <div className="flex h-20 w-28 items-center justify-center rounded-box border border-border bg-muted text-muted-foreground text-xs">
          rounded-box
        </div>
        <div className="flex h-20 w-28 items-center justify-center rounded-field border border-border bg-muted text-muted-foreground text-xs">
          rounded-field
        </div>
      </div>
    </Section>
  </LabShell>
);

// ── /lab/surfaces ───────────────────────────────────────────
// Card·Box·Button 을 한 화면에서 — 표면(look)은 appCard/appBox recipe 로, 동작(behavior)은 프레임워크 Button 으로.
const CARD_TONES = ["muted", "card", "glass"] as const;
const BOX_TONES = ["default", "muted", "primary", "success", "warning", "info", "outline"] as const;
const SURFACE_BTN_VARIANTS = ["primary", "secondary", "outline", "ghost", "destructive"] as const;
const SURFACE_BTN_SIZES = ["xs", "sm", "md", "lg"] as const;
const BOX_PADDINGS = ["sm", "md", "lg"] as const;

export const LabSurfaces = () => (
  <LabShell title="Surfaces">
    <Section title="Card" note="appCard recipe · tone(muted/card/glass) — radius/padding 은 호출부에서 조합">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CARD_TONES.map((tone) => (
          <div key={tone} className={appCard({ tone }, "rounded-box p-4")}>
            <div className="font-medium text-sm">{tone}</div>
            <p className="mt-1 text-foreground/55 text-xs">{`appCard({ tone: "${tone}" })`}</p>
          </div>
        ))}
      </div>
      <div className={appCard({ tone: "card" }, "mt-4 max-w-sm overflow-hidden rounded-box")}>
        <div className="border-border border-b px-4 py-3">
          <div className="font-semibold">프로 플랜</div>
          <div className="text-card-foreground/55 text-xs">월 정기 결제</div>
        </div>
        <div className="px-4 py-4 text-card-foreground/75 text-sm">
          header/body/footer 를 tone:card 표면 위에 조립합니다.
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-bold text-2xl text-foreground">₩12,000</span>
            <span className="text-card-foreground/55 text-xs">/월</span>
          </div>
        </div>
        <div className="flex gap-2 border-border border-t px-4 py-3">
          <Button size="sm" variant="primary">
            구독
          </Button>
          <Button size="sm" variant="ghost">
            자세히
          </Button>
        </div>
      </div>
    </Section>
    <Section title="Box" note="appBox recipe · tone × padding — 톤으로 강조하는 콜아웃/패널 표면">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BOX_TONES.map((tone) => (
          <div key={tone} className={appBox({ tone })}>
            <div className="font-medium text-sm">{tone}</div>
            <p className="mt-1 text-foreground/50 text-xs">{`tone: "${tone}"`}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {BOX_PADDINGS.map((padding) => (
          <div key={padding} className={appBox({ tone: "primary", padding })}>
            padding: {padding}
          </div>
        ))}
      </div>
    </Section>
    <Section title="Button" note="프레임워크 Button/buttonRecipe · variant × size — 전체 매트릭스는 /lab/buttons">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SURFACE_BTN_VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SURFACE_BTN_SIZES.map((sz) => (
            <Button key={sz} variant="outline" size={sz}>
              {sz}
            </Button>
          ))}
        </div>
      </div>
    </Section>
  </LabShell>
);

// ── /lab/buttons ────────────────────────────────────────────
const BTN_VARIANTS = ["primary", "secondary", "outline", "ghost", "destructive", "success", "warning", "link"] as const;
const BTN_SIZES = ["xs", "sm", "md", "lg"] as const;

export const LabButtons = () => {
  const [syncTaps, setSyncTaps] = useState(0);
  const [page, setPage] = useState(3);
  const [role, setRole] = useState<string>("member");
  const [tags, setTags] = useState<string[]>(["new"]);
  return (
    <LabShell title="Buttons">
      <Section title="Button" note="variant × size · 기본값 primary/md · 아래 매트릭스는 핸들러 없는 순수 표시용">
        <div className="flex flex-col gap-3">
          {BTN_VARIANTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 font-mono text-foreground/50 text-xs">{v}</span>
              {BTN_SIZES.map((sz) => (
                <Button key={sz} variant={v} size={sz}>
                  {v} {sz}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="동기 / 비동기 — 고르는 게 아니라 반환값으로 결정된다"
        note="onClick 이 promise 를 반환하면 로딩→성공 상태머신이 켜지고, 아무것도 반환하지 않으면 평범한 버튼이다. async 플래그도, 별도 컴포넌트도 없다."
      >
        <div className="flex flex-col gap-4">
          <div className={appBox({ tone: "muted" }, "font-mono text-xs leading-relaxed")}>
            <div className="text-foreground/55">{`<Button onClick={close}>            // 반환 없음 → 평범한 버튼`}</div>
            <div className="text-foreground/55">{`<Button onClick={() => save()}>     // promise 반환 → 로딩 → 성공`}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-foreground/50 text-xs">동기</span>
            <Button variant="outline" onClick={() => setSyncTaps(syncTaps + 1)}>
              누른 횟수 {syncTaps}
            </Button>
            <span className="text-foreground/45 text-xs">스피너 없음 · 누름 스케일 피드백만</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-foreground/50 text-xs">비동기</span>
            <Button variant="primary" onClick={() => new Promise((r) => setTimeout(r, 900))}>
              저장
            </Button>
            <span className="text-foreground/45 text-xs">스피너 → 체크 표시 · 처리 중 중복 클릭 차단</span>
          </div>
        </div>
      </Section>
      <Section
        title="loadingMode — 두 모드 모두 버튼 크기가 변하지 않는다"
        note="CSS 는 auto 너비를 애니메이션할 수 없어서, 크기가 바뀌는 버튼은 튀는 것 말고 방법이 없다. 그래서 두 모드 다 박스를 고정한다."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-foreground/50 text-xs">hold (기본)</span>
            <Button variant="primary" onClick={() => new Promise((r) => setTimeout(r, 1400))}>
              변경사항 저장하기
            </Button>
            <span className="text-foreground/45 text-xs">자식 자리를 그대로 두고 스피너만 겹침 → 박스 = 라벨 크기</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-foreground/50 text-xs">replace</span>
            <Button variant="secondary" loadingMode="replace" onClick={() => new Promise((r) => setTimeout(r, 1400))}>
              변경사항 저장하기
            </Button>
            <span className="text-foreground/45 text-xs">
              라벨까지 &quot;처리중...&quot; 으로 교차 페이드 → 박스 = 두 라벨 중 넓은 쪽(그래서 idle 에도 그만큼 넓다)
            </span>
          </div>
        </div>
      </Section>
      <Section title="ToggleSelect" note="단일 = outline + 선택 시 success fill · 다중 지원">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 font-mono text-foreground/50 text-xs">단일 (value: {role})</div>
            <ToggleSelect
              items={["guest", "member", "admin"]}
              value={role}
              nullable={false}
              validate={() => true}
              onChange={(v) => setRole(v)}
            />
          </div>
          <div>
            <div className="mb-1 font-mono text-foreground/50 text-xs">다중 (value: {tags.join(", ") || "-"})</div>
            <ToggleSelect.Multi
              items={["new", "hot", "sale", "beta"]}
              value={tags}
              nullable
              validate={() => true}
              onChange={(v) => setTags(v as string[])}
            />
          </div>
        </div>
      </Section>
      <Section title="Pagination" note="정사각 ghost 버튼 · 활성 페이지 강조">
        <Pagination currentPage={page} total={230} itemsPerPage={10} onPageSelect={setPage} />
        <p className="mt-2 text-foreground/50 text-xs">현재 페이지: {page}</p>
      </Section>
      <Section title="Copy / Clipboard" note="클릭 시 전역 성공 메시지 · 자체 아이콘 토글">
        <div className="flex items-center gap-3">
          <Copy text="https://akanjs.com">
            <Button size="sm" variant="outline">
              링크 복사
            </Button>
          </Copy>
          <Clipboard text="copy me" />
        </div>
      </Section>
    </LabShell>
  );
};

// ── /lab/status ─────────────────────────────────────────────
const BADGE_VARIANTS = ["default", "primary", "secondary", "accent", "success", "warning", "error", "outline"] as const;

export const LabStatus = () => (
  <LabShell title="Status">
    <Section title="Badge" note="badgeRecipe · error = destructive 매핑">
      <div className="flex flex-wrap gap-2">
        {BADGE_VARIANTS.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </div>
    </Section>
    <Section title="Loading" note="react-icons 스핀 (daisyUI loading-* 대체)">
      <div className="flex items-center gap-8">
        <Loading.Spin />
        <div className="relative h-20 w-40 rounded-box border border-border">
          <Loading.Area />
        </div>
      </div>
      <div className="mt-4 w-64">
        <Loading.ProgressBar value={62} max={100} />
      </div>
    </Section>
    <Section title="Tooltip" note="CSS hover/focus · variant default/primary/info">
      <div className="flex flex-wrap gap-4">
        <Tooltip content="기본 툴팁">
          <span className={buttonRecipe({ variant: "outline", size: "sm" })}>hover: default</span>
        </Tooltip>
        <Tooltip content="primary 톤" variant="primary" side="bottom">
          <span className={buttonRecipe({ variant: "outline", size: "sm" })}>hover: primary</span>
        </Tooltip>
      </div>
    </Section>
    <Section title="ObjectId / RecentTime" note="축약 id + 복사 · 상대 시각">
      <div className="flex flex-col gap-2 text-sm">
        <ObjectId id="507f1f77bcf86cd799439011" />
        <div className="text-foreground/70">
          3시간 전: <RecentTime date={dayjs().subtract(3, "hour")} />
        </div>
      </div>
    </Section>
    <Section title="Empty" note="데이터 없음 placeholder + CTA 슬롯">
      <div className="rounded-box border border-border">
        <Empty description="아직 항목이 없습니다">
          <Link href="/lab" className={buttonRecipe({ variant: "primary", size: "sm" })}>
            돌아가기
          </Link>
        </Empty>
      </div>
    </Section>
  </LabShell>
);

// ── /lab/forms ──────────────────────────────────────────────
export const LabForms = () => {
  const [text, setText] = useState("");
  const [pw, setPw] = useState("");
  const [num, setNum] = useState<number | null>(3);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState<string | null>("Ada");
  const [price, setPrice] = useState<number | null>(1200);
  const [notify, setNotify] = useState(true);
  const [plan, setPlan] = useState<string>("pro");
  const [status, setStatus] = useState<string>("ready");
  const [leave, setLeave] = useState("annual");
  const [switchOn, setSwitchOn] = useState(true);
  const [date, setDate] = useState(dayjs());
  return (
    <LabShell title="Forms">
      <Section title="Input" note="controlled value/onChange · 변형: Password/Number/Checkbox">
        <div className="flex max-w-sm flex-col gap-3">
          <Input value={text} onChange={setText} placeholder="검색어" inputStyleType="underline" />
          <Input.Password value={pw} onChange={setPw} validate={() => true} placeholder="비밀번호" />
          <Input.Number value={num} onChange={setNum} />
          <label className="flex items-center gap-2 text-sm">
            <Input.Checkbox checked={checked} onChange={setChecked} /> 약관 동의
          </label>
        </div>
      </Section>
      <Section title="Field" note="label + 검증 래퍼가 붙은 타입별 컨트롤">
        <div className="flex max-w-sm flex-col gap-4">
          <Field.Text label="이름" value={name} onChange={setName} nullable={false} />
          <Field.Number label="가격" value={price} onChange={setPrice} unit="원" />
          <Field.Switch label="알림" value={notify} onChange={setNotify} onDesc="켜짐" offDesc="꺼짐" />
          <Field.ToggleSelect label="플랜" items={["free", "pro", "team"]} value={plan} onChange={setPlan} />
          <Field.Date label="날짜" value={date} onChange={setDate} />
        </div>
      </Section>
      <Section title="Select" note="검색/멀티 지원 커스텀 셀렉트">
        <div className="max-w-sm">
          <Select label="상태" value={status} options={["ready", "running", "done"]} onChange={(v) => setStatus(v)} />
          <p className="mt-2 text-foreground/50 text-xs">value: {status}</p>
        </div>
      </Section>
      <Section title="Radio / Switch" note="라디오 그룹 · Radix Switch (variant)">
        <div className="flex flex-col gap-4">
          <Radio className="flex gap-5" value={leave} onChange={(v) => setLeave(String(v))}>
            {["annual", "sick", "unpaid"].map((t, idx) => (
              <Radio.Item key={idx} value={t}>
                {t}
              </Radio.Item>
            ))}
          </Radio>
          <div className="flex items-center gap-4">
            <Switch checked={switchOn} onChange={setSwitchOn} variant="accent" />
            <span className="text-foreground/70 text-sm">{switchOn ? "on" : "off"}</span>
          </div>
        </div>
      </Section>
    </LabShell>
  );
};

// ── /lab/overlays ───────────────────────────────────────────
export const LabOverlays = () => {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [menuKey, setMenuKey] = useState("home");
  const [menuModal, setMenuModal] = useState(false);
  const [menuNotify, setMenuNotify] = useState(true);
  const [nestedModal, setNestedModal] = useState(false);
  return (
    <LabShell title="Overlays">
      <Section title="Modal" note="controlled open/onCancel · 드래그·ESC 닫힘 내장 · 본문 안 Dropdown 은 평소대로 닫힘">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Modal 열기
        </Button>
        <Modal
          open={open}
          onCancel={() => setOpen(false)}
          title="Modal"
          action={
            <Button size="sm" onClick={() => setOpen(false)}>
              닫기
            </Button>
          }
        >
          <div className="flex w-full items-center justify-between gap-4">
            <p className="text-foreground/70 text-sm">controlled Modal 본문입니다.</p>
            <Dropdown
              value="⋮"
              content={
                <>
                  <li>
                    <button
                      type="button"
                      className="w-full rounded px-3 py-1.5 text-left hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNestedModal(true);
                      }}
                    >
                      이름 변경
                    </button>
                    <Modal
                      open={nestedModal}
                      onCancel={() => setNestedModal(false)}
                      title="모달 안 메뉴에서 연 모달"
                      action={
                        <Button size="sm" onClick={() => setNestedModal(false)}>
                          닫기
                        </Button>
                      }
                    >
                      <p className="text-foreground/70 text-sm">아래 모달은 그대로 열려 있어야 합니다.</p>
                    </Modal>
                  </li>
                  <li>
                    <button type="button" className="w-full rounded px-3 py-1.5 text-left hover:bg-muted">
                      보관
                    </button>
                  </li>
                </>
              }
            />
          </div>
        </Modal>
      </Section>
      <Section title="Dialog" note="headless 컴파운드(Trigger/Modal/Title/Content/Action) · 자체 상태">
        <Dialog defaultOpen={false}>
          <Dialog.Trigger>
            <span className={buttonRecipe({ variant: "outline" })}>Dialog 열기</span>
          </Dialog.Trigger>
          <Dialog.Modal>
            <Dialog.Title>커스텀 다이얼로그</Dialog.Title>
            <Dialog.Content>헤드리스 파츠를 직접 조립합니다.</Dialog.Content>
            <Dialog.Action>
              <span className={buttonRecipe()}>확인</span>
            </Dialog.Action>
          </Dialog.Modal>
        </Dialog>
      </Section>
      <Section
        title="Dropdown"
        note="외부 클릭 닫힘 · 메뉴에서 연 모달은 살아남음 · data-dropdown-keep-open 항목은 메뉴를 닫지 않음"
      >
        <Dropdown
          value="Actions ▾"
          buttonClassName="border border-input"
          content={
            <>
              <li>
                <button
                  type="button"
                  className="w-full rounded px-3 py-1.5 text-left hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuModal(true);
                  }}
                >
                  편집
                </button>
                <Modal
                  open={menuModal}
                  onCancel={() => setMenuModal(false)}
                  title="메뉴에서 연 모달"
                  action={
                    <Button size="sm" onClick={() => setMenuModal(false)}>
                      닫기
                    </Button>
                  }
                >
                  <p className="text-foreground/70 text-sm">
                    본문을 아무 데나 클릭해도 닫히지 않고, 배경을 누르면 정상적으로 닫힙니다.
                  </p>
                </Modal>
              </li>
              <li data-dropdown-keep-open="" className="flex items-center gap-2 px-3 py-1.5">
                <Switch checked={menuNotify} onChange={(checked) => setMenuNotify(checked)} />
                <span className="text-sm">알림</span>
              </li>
              <li>
                <button type="button" className="w-full rounded px-3 py-1.5 text-left hover:bg-muted">
                  복제
                </button>
              </li>
            </>
          }
        />
      </Section>
      <Section title="Popconfirm" note="위험 액션 인라인 확인">
        <Popconfirm title="정말 삭제할까요?" onConfirm={() => {}}>
          <button type="button" className={buttonRecipe({ variant: "destructive", size: "sm" })}>
            삭제
          </button>
        </Popconfirm>
      </Section>
      <Section title="BottomSheet" note="모바일 하단 시트 (half)">
        <Button variant="outline" onClick={() => setSheet(true)}>
          BottomSheet 열기
        </Button>
        <BottomSheet type="half" open={sheet} onCancel={() => setSheet(false)}>
          <div className="p-5">
            <div className="font-semibold">Bottom Sheet</div>
            <p className="mt-2 text-foreground/70 text-sm">half 타입 시트입니다.</p>
            <Button className="mt-4" variant="primary" size="sm" onClick={() => setSheet(false)}>
              닫기
            </Button>
          </div>
        </BottomSheet>
      </Section>
      <Section title="Menu" note="가로 메뉴 · 활성 키 강조">
        <Menu
          mode="horizontal"
          selectedKeys={[menuKey]}
          onClick={({ key }) => setMenuKey(key)}
          items={[
            { key: "home", label: "Home" },
            { key: "orders", label: "Orders" },
            { key: "settings", label: "Settings" },
          ]}
        />
        <p className="mt-2 text-foreground/50 text-xs">selected: {menuKey}</p>
      </Section>
      <Section title="Tab" note="menu 매칭 패널 · 자체 상태">
        <Tab defaultMenu="a">
          <Tab.Menus className="flex gap-2">
            <Tab.Menu
              menu="a"
              className={buttonRecipe({ variant: "ghost", size: "sm" })}
              activeClassName="bg-primary text-primary-foreground"
            >
              Tab A
            </Tab.Menu>
            <Tab.Menu
              menu="b"
              className={buttonRecipe({ variant: "ghost", size: "sm" })}
              activeClassName="bg-primary text-primary-foreground"
            >
              Tab B
            </Tab.Menu>
          </Tab.Menus>
          <Tab.Panel menu="a" className="p-3 text-foreground/70 text-sm">
            패널 A 내용
          </Tab.Panel>
          <Tab.Panel menu="b" className="p-3 text-foreground/70 text-sm">
            패널 B 내용
          </Tab.Panel>
        </Tab>
      </Section>
    </LabShell>
  );
};

// ── /lab/data ───────────────────────────────────────────────
const ROWS = [
  { id: "a1", name: "Alpha", status: "done" },
  { id: "b2", name: "Beta", status: "running" },
  { id: "c3", name: "Gamma", status: "ready" },
];

export const LabData = () => {
  const [page, setPage] = useState(1);
  return (
    <LabShell title="Data">
      <Section title="Table" note="columns/dataSource + render · pagination 내장 · 빈 데이터 시 Empty">
        <Table
          columns={[
            { title: "ID", dataIndex: "id" },
            { title: "Name", dataIndex: "name" },
            {
              title: "Status",
              dataIndex: "status",
              render: (text) => (
                <Badge variant={text === "done" ? "success" : text === "running" ? "warning" : "secondary"}>
                  {String(text)}
                </Badge>
              ),
            },
          ]}
          dataSource={ROWS}
          pagination={{ currentPage: page, total: 42, itemsPerPage: 3, onPageSelect: setPage }}
        />
      </Section>
    </LabShell>
  );
};

const SkinInputs = () => {
  const [query, setQuery] = useState("select * from ships");
  const [status, setStatus] = useState<string>("ready");
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <Input value={query} onChange={setQuery} placeholder="쿼리" />
      <Select label="상태" value={status} options={["ready", "running", "done"]} onChange={(v) => setStatus(v)} />
      <span className="font-mono text-foreground/45 text-xs">value: {query || "(빈 값)"}</span>
    </div>
  );
};

// ── /lab/skin (recipe override PoC) ─────────────────────────
// 이 라우트 서브트리엔 page/(home)/lab/skin/_overrides.tsx 가 recipe 세 슬롯(button/badge/input)을 네온 스킨으로 교체.
// 아래 컴포넌트들은 코드 변경 없이 네온으로 렌더되고, 동작(로딩/성공, controlled value)은 프레임워크 그대로다.
export const LabSkin = () => (
  <LabShell title="Recipe Override">
    <Section
      title="네온 스킨 주입"
      note="_overrides.tsx 가 recipes.button → neonButtonRecipe 로 교체. <Button> 호출 코드는 그대로."
    >
      <div className="flex flex-col gap-3">
        {(["primary", "secondary", "destructive", "success", "outline", "ghost"] as const).map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-foreground/50 text-xs">{v}</span>
            <Button variant={v}>{v}</Button>
          </div>
        ))}
      </div>
    </Section>
    <Section
      title="badge 슬롯도 같이"
      note="recipes.badge → neonBadgeRecipe. 같은 <Badge variant> 호출이 채움 대신 각진 외곽선 + 글로우로 렌더된다."
    >
      <div className="flex flex-wrap gap-2">
        {(["default", "primary", "success", "warning", "error", "outline"] as const).map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </div>
    </Section>
    <Section
      title="input 슬롯도 같이"
      note="recipes.input → neonInputRecipe. Input/TextArea/Select 가 같은 셸을 쓰므로 세 컨트롤이 한 번에 바뀐다."
    >
      <SkinInputs />
    </Section>
    <Section title="동작은 그대로 (loading → success)" note="스킨만 바뀌고 async 상태머신은 프레임워크 코드 그대로">
      <Button variant="primary" onClick={() => new Promise((resolve) => setTimeout(resolve, 900))}>
        클릭 → 로딩 → 성공
      </Button>
    </Section>
    <Section
      title="대조: override 를 안 받는 raw recipe"
      note="raw buttonRecipe 호출은 컴포넌트가 아니라 override 대상이 아님 — 같은 variant, 기본 스킨. 클라이언트 버튼은 <Button> 을 쓰고, raw 호출은 <Link>/서버 컴포넌트처럼 컴포넌트를 못 쓰는 자리에만 남긴다."
    >
      <button type="button" className={buttonRecipe({ variant: "primary" })}>
        raw buttonRecipe (기본 스킨)
      </button>
    </Section>
  </LabShell>
);

// ── /lab/essentials ─────────────────────────────────────────
// Card/Box 는 프레임워크 프리미티브가 아니라 시맨틱 토큰 표면(bg-card/rounded-box/border-border)으로 조립한다.
// 나머지는 실제로 자주 쓰는 akanjs/ui 컴포넌트를 한 화면에 모은 빠른 참조 — 각 카테고리 상세는 위 CATEGORIES 참고.
const ESSENTIAL_STATUSES = [
  { label: "done", variant: "success" },
  { label: "running", variant: "warning" },
  { label: "ready", variant: "secondary" },
] as const;

const ESSENTIAL_ROWS = [
  { id: "a1", name: "Alpha", status: "done" },
  { id: "b2", name: "Beta", status: "running" },
  { id: "c3", name: "Gamma", status: "ready" },
];

export const LabEssentials = () => {
  const [name, setName] = useState<string | null>("Ada");
  const [pw, setPw] = useState("");
  const [qty, setQty] = useState<number | null>(2);
  const [agree, setAgree] = useState(false);
  const [notify, setNotify] = useState(true);
  const [plan, setPlan] = useState<string>("pro");
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <LabShell title="Essentials">
      <Section title="Card" note="appCard recipe(tone:card) 표면 — header/body/footer 조립 · 전체는 /lab/surfaces">
        <div className={appCard({ tone: "card" }, "max-w-sm overflow-hidden rounded-box")}>
          <div className="border-border border-b px-4 py-3">
            <div className="font-semibold">프로 플랜</div>
            <div className="text-card-foreground/55 text-xs">월 정기 결제</div>
          </div>
          <div className="px-4 py-4 text-card-foreground/75 text-sm">
            무제한 프로젝트와 우선 지원이 포함됩니다.
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-bold text-2xl text-foreground">₩12,000</span>
              <span className="text-card-foreground/55 text-xs">/월</span>
            </div>
          </div>
          <div className="flex gap-2 border-border border-t px-4 py-3">
            <Button size="sm" variant="primary">
              구독
            </Button>
            <Button size="sm" variant="ghost">
              자세히
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Box" note="appBox recipe · tone 으로 강조 — 전체 톤은 /lab/surfaces">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={appBox({ tone: "muted" })}>
            <div className="font-medium text-sm">기본 박스</div>
            <p className="mt-1 text-muted-foreground text-xs">tone: muted</p>
          </div>
          <div className={appBox({ tone: "primary" })}>
            <div className="font-medium text-primary text-sm">강조 박스</div>
            <p className="mt-1 text-primary/70 text-xs">tone: primary</p>
          </div>
          <div className={appBox({ tone: "outline" })}>
            <div className="font-medium text-sm">아웃라인 박스</div>
            <p className="mt-1 text-muted-foreground text-xs">tone: outline (dashed)</p>
          </div>
        </div>
      </Section>
      <Section title="Button" note="가장 많이 쓰는 액션 — variant · async 상태머신 내장">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={async () => await new Promise((r) => setTimeout(r, 800))}>
            저장
          </Button>
          <Button variant="outline">취소</Button>
          <Button variant="ghost" size="sm">
            더보기
          </Button>
          <Button variant="destructive" size="sm">
            삭제
          </Button>
        </div>
      </Section>
      <Section title="Input" note="controlled value/onChange · Password/Number/Checkbox 변형">
        <div className="flex max-w-sm flex-col gap-3">
          <Input value={name ?? ""} onChange={(v) => setName(v)} placeholder="이름" inputStyleType="underline" />
          <Input.Password value={pw} onChange={setPw} validate={() => true} placeholder="비밀번호" />
          <Input.Number value={qty} onChange={setQty} />
          <label className="flex items-center gap-2 text-sm">
            <Input.Checkbox checked={agree} onChange={setAgree} /> 약관에 동의합니다
          </label>
        </div>
      </Section>
      <Section title="Field" note="label + 검증 래퍼가 붙은 타입별 폼 컨트롤">
        <div className="flex max-w-sm flex-col gap-4">
          <Field.Text label="이름" value={name} onChange={setName} nullable={false} />
          <Field.Switch label="알림 받기" value={notify} onChange={setNotify} onDesc="켜짐" offDesc="꺼짐" />
          <Field.ToggleSelect label="플랜" items={["free", "pro", "team"]} value={plan} onChange={setPlan} />
        </div>
      </Section>
      <Section title="Select" note="검색/멀티 지원 커스텀 셀렉트">
        <div className="max-w-sm">
          <Select label="플랜" value={plan} options={["free", "pro", "team"]} onChange={(v) => setPlan(v)} />
        </div>
      </Section>
      <Section title="Badge · Switch · Tooltip" note="상태 표시 · 토글 · 힌트">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {ESSENTIAL_STATUSES.map((s) => (
              <Badge key={s.label} variant={s.variant}>
                {s.label}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={dark} onChange={setDark} variant="accent" />
            <span className="text-foreground/70 text-sm">다크 모드 {dark ? "on" : "off"}</span>
          </div>
          <Tooltip content="도움말 텍스트">
            <span className={buttonRecipe({ variant: "outline", size: "sm" })}>hover 힌트</span>
          </Tooltip>
        </div>
      </Section>
      <Section title="Modal" note="controlled open/onCancel · ESC·드래그 닫힘 내장">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Modal 열기
        </Button>
        <Modal
          open={open}
          onCancel={() => setOpen(false)}
          title="확인"
          action={
            <Button size="sm" onClick={() => setOpen(false)}>
              닫기
            </Button>
          }
        >
          <p className="text-foreground/70 text-sm">자주 쓰는 확인용 모달 본문입니다.</p>
        </Modal>
      </Section>
      <Section title="Table" note="columns/dataSource + render · 상태 컬럼은 Badge 로">
        <Table
          columns={[
            { title: "ID", dataIndex: "id" },
            { title: "Name", dataIndex: "name" },
            {
              title: "Status",
              dataIndex: "status",
              render: (text) => (
                <Badge variant={text === "done" ? "success" : text === "running" ? "warning" : "secondary"}>
                  {String(text)}
                </Badge>
              ),
            },
          ]}
          dataSource={ESSENTIAL_ROWS}
        />
      </Section>
    </LabShell>
  );
};
