"use client";
import { Badge, Button, Layout, Loading, Pagination, ToggleSelect } from "akanjs/ui";
import { type ReactNode, useState } from "react";

// daisyui→shadcn 마이그레이션 QA 실험실. 변환된 프리미티브 + 토큰 스와치 +
// 아직 daisyui 플러그인으로 렌더되는 컴포넌트를 실제 앱에서 나란히 확인한다.

const Section = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
  <section className="border-border border-t px-5 py-6">
    <div className="mb-4">
      <h2 className="font-semibold text-foreground text-lg">{title}</h2>
      {note ? <p className="mt-0.5 text-foreground/55 text-sm">{note}</p> : null}
    </div>
    {children}
  </section>
);

// 스와치는 리터럴 클래스여야 Tailwind가 생성한다(동적 조합 금지).
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
  { name: "base-200 (존치)", cls: "bg-base-200 text-foreground" },
  { name: "base-300 (존치)", cls: "bg-base-300 text-foreground" },
  { name: "card", cls: "bg-card text-card-foreground border border-border" },
];

const BTN_VARIANTS = ["primary", "secondary", "outline", "ghost", "destructive", "success", "warning", "link"] as const;
const BTN_SIZES = ["xs", "sm", "md", "lg"] as const;
const BADGE_VARIANTS = ["default", "primary", "secondary", "accent", "success", "warning", "error", "outline"] as const;

export const UiLab = () => {
  const [page, setPage] = useState(3);
  const [role, setRole] = useState<string>("member");
  const [tags, setTags] = useState<string[]>(["new"]);

  return (
    <div className="min-h-screen overflow-y-auto bg-background pb-24 text-foreground">
      <Layout.Navbar className="bg-background" back>
        <div className="font-semibold">UI 실험실 · daisyui→shadcn</div>
      </Layout.Navbar>

      <div className="px-5 pt-4">
        <p className="text-foreground/60 text-sm">
          앱 테마 토글로 <b className="text-foreground">light/dark</b>를 바꿔가며 확인하세요. 상단은 변환 완료된 shadcn
          프리미티브, 맨 아래는 아직 daisyui 플러그인으로 렌더되는 컴포넌트입니다.
        </p>
      </div>

      <Section title="색상 토큰" note="토큰이 값 그대로 이전됐는지 · base-200/300은 커스텀 존치">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className={`flex h-16 items-end rounded-box p-2 text-xs ${s.cls}`}>
              {s.name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button" note="variant × size · 기본값 primary/md · async 상태머신 보존">
        <div className="flex flex-col gap-4">
          {BTN_VARIANTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 font-mono text-foreground/50 text-xs">{v}</span>
              {BTN_SIZES.map((sz) => (
                <Button key={sz} variant={v} size={sz} onClick={async () => {}}>
                  {v} {sz}
                </Button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 font-mono text-foreground/50 text-xs">state</span>
            <Button
              variant="primary"
              onClick={async () => {
                await new Promise((r) => setTimeout(r, 900));
              }}
            >
              눌러서 로딩→성공 확인
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Badge" note="badgeVariants · error=destructive 매핑">
        <div className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Pagination" note="정사각 ghost 버튼(buttonVariants icon) · 활성 페이지 강조">
        <Pagination currentPage={page} total={230} itemsPerPage={10} onPageSelect={setPage} />
        <p className="mt-2 text-foreground/50 text-xs">현재 페이지: {page}</p>
      </Section>

      <Section title="ToggleSelect" note="outline 버튼 + 선택 시 success fill">
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

      <Section title="Loading" note="daisyui loading-* → react-icons 스핀">
        <div className="flex items-center gap-8">
          <Loading.Spin />
          <div className="relative h-20 w-40 rounded-box border border-border">
            <Loading.Area />
          </div>
        </div>
      </Section>

      <Section
        title="⚠️ 아직 daisyui (플러그인 유지 확인)"
        note="아래가 정상 렌더돼야 함 — 미변환 컴포넌트는 아직 @plugin daisyui로 렌더"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm">
              raw btn-primary
            </button>
            <button type="button" className="btn btn-outline btn-sm">
              raw btn-outline
            </button>
            <span className="badge badge-primary">raw badge</span>
            <span className="badge badge-outline">raw badge-outline</span>
          </div>
          <div className="collapse-arrow collapse rounded-box bg-base-200">
            <input type="checkbox" />
            <div className="collapse-title font-medium">raw collapse (열고 닫혀야 정상)</div>
            <div className="collapse-content text-foreground/70 text-sm">
              이 아코디언이 열리고 닫히면 daisyui 플러그인이 아직 살아 있는 것입니다. Phase 3에서 Radix/peer로 대체
              예정.
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};
