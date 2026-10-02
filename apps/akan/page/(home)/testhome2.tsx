import { usePage } from "@apps/akan/client";
import { Code, Duet, InstallCommand } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { buttonRecipe, Clipboard, Link } from "akanjs/ui";
import { BsArrowDown, BsArrowRight } from "react-icons/bs";

const screenCode = `export const Order = () => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  const order = st.tool("createIcecreamOrder", { confirm: true }) // [!code highlight]
    .desc("Place the order in the form.")
    .exec(() => st.do.createIcecreamOrder());
  return (
    <>
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder} // [!code highlight]
      />
      <Button onClick={order}>{l("icecreamOrder.createIcecreamOrder")}</Button>
    </>
  );
};`;

const serverCode = `serveIcecreamOrder: mutation(cnst.IcecreamOrder, {
  guards: [Admin], // [!code highlight]
})
  .param("icecreamOrderId", ID)
  .exec(async function (icecreamOrderId) {
    return await this.icecreamOrderService.serve(icecreamOrderId);
  }),
refundIcecreamOrder: mutation(cnst.IcecreamOrder, {
  guards: [Every, Person], // [!code highlight]
})
  .param("icecreamOrderId", ID)
  .with(Self)
  .exec(async function (icecreamOrderId, self) {
    return await this.icecreamOrderService.refund(icecreamOrderId, self.id);
  }),`;

const mcpUrl = "https://akanjs.com/mcp";

export default page().render(() => {
  const { l } = usePage();
  const kicker = "flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.3em]";
  const stepTitle = "mt-2 font-bold text-xl tracking-tight sm:text-3xl lg:mt-3";
  const stepBody = "mt-2 max-w-xl text-[0.9375rem] text-foreground/65 leading-6 sm:text-lg sm:leading-8 lg:mt-3";
  const tagline = l.trans({
    en: "The TypeScript framework, agents included.",
    ko: "에이전트까지 들어 있는 TypeScript 프레임워크.",
  });
  const screenSteps = [
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Write the screen you were going to write.", ko: "원래 쓰려던 화면을 그대로 씁니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "A field handed its setter publishes it. A button's handler becomes a tool with one st.tool line — the same function the button calls.",
          ko: "setter를 넘겨받은 필드는 그 setter를 공개합니다. 버튼 핸들러는 st.tool 한 줄로 툴이 되고, 버튼이 부르는 바로 그 함수가 됩니다.",
        })}
      </p>
      <Code.Snippet
        className="mt-6 w-full max-lg:hidden"
        title="IcecreamOrder.Zone.tsx"
        language="tsx"
        code={screenCode}
        showLineNumbers={false}
        copy={false}
      />
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "An agent sees tools, not pixels.", ko: "에이전트에게는 픽셀이 아니라 도구가 보입니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "Every control you wired is published under its own name, with the arguments it takes. What isn't on the screen isn't on the list — no lever the user doesn't have.",
          ko: "연결한 컨트롤마다 자기 이름과 받는 인자로 공개됩니다. 화면에 없는 것은 목록에도 없습니다. 사용자에게 없는 레버는 에이전트에게도 없습니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Ask, and it works the screen.", ko: "부탁하면, 화면을 직접 다룹니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "It runs in the customer's own tab, with their session — exactly like a click. You watch the pointer land on every control it uses.",
          ko: "고객 자신의 탭에서, 고객의 세션으로 돕니다. 클릭과 똑같습니다. 포인터가 쓰는 컨트롤마다 내려앉는 모습이 그대로 보입니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "What matters waits for a yes.", ko: "중요한 일은 승인을 기다립니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "A tool declared with confirm stops on an approval card. Approve, and the handler the button calls runs — through the same guards.",
          ko: "confirm으로 선언한 툴은 승인 카드에서 멈춥니다. 승인하면 버튼이 부르는 핸들러가 같은 가드를 지나 실행됩니다.",
        })}
      </p>
      <p className="mt-5 font-mono text-foreground/45 text-xs leading-6">
        {l.trans({
          en: "Setup: one <Agent.Chat /> in a layout, your model's key, and a guard for who may use it.",
          ko: "설정: 레이아웃에 <Agent.Chat /> 하나, 모델 키, 그리고 누가 쓸 수 있는지 정하는 가드.",
        })}
      </p>
    </>,
  ];
  const serverSteps = [
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Point any MCP client at your app.", ko: "MCP 클라이언트에 앱 주소만 넣습니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "/mcp is on by default. Every endpoint whose guards admit the caller is a tool, described by the dictionary you already write.",
          ko: "/mcp는 기본으로 켜져 있습니다. 가드가 허용하는 엔드포인트는 모두 툴이 되고, 설명은 이미 쓰는 사전에서 옵니다.",
        })}
      </p>
      <Code.Snippet
        className="mt-6 w-full max-lg:hidden"
        title="icecreamOrder.signal.ts"
        code={serverCode}
        showLineNumbers={false}
        copy={false}
      />
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Sign-in and consent happen on your app.", ko: "로그인과 동의는 당신의 앱에서 합니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "OAuth 2.1 ships with libs/shared. The AI gets a token for this one user — exactly their rights, revocable at any time.",
          ko: "OAuth 2.1은 libs/shared에 들어 있습니다. AI는 이 사용자 한 명의 토큰을 받고, 권한도 딱 그 사용자만큼이며, 언제든 해지할 수 있습니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>{l.trans({ en: "Then it just works.", ko: "그다음엔 그냥 됩니다." })}</h3>
      <p className={stepBody}>
        {l.trans({
          en: "Ask in plain words. It calls your endpoints through the same guards and services as your screens — and the board that's open updates live.",
          ko: "평범한 말로 부탁하면, 화면과 같은 가드와 서비스를 지나 엔드포인트를 부릅니다. 열려 있는 보드는 실시간으로 바뀝니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "And it can't do what it shouldn't.", ko: "해서는 안 되는 일은 못 합니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "refundIcecreamOrder is guarded by Person, so it never reaches the shelf. To the AI it looks exactly like a tool that doesn't exist.",
          ko: "refundIcecreamOrder에는 Person 가드가 걸려 있어 목록에 올라가지 않습니다. AI에게는 처음부터 없는 툴과 똑같아 보입니다.",
        })}
      </p>
    </>,
  ];
  const facts = [
    {
      title: l.trans({ en: "Refusals give nothing away", ko: "거절은 아무것도 드러내지 않습니다" }),
      body: l.trans({
        en: "A tool an agent may not use answers exactly like one that doesn't exist, so the shelf leaks nothing.",
        ko: "에이전트가 쓸 수 없는 툴은 처음부터 없는 툴과 똑같이 답하므로, 목록이 아무것도 흘리지 않습니다.",
      }),
    },
    {
      title: l.trans({ en: "Rate-limited per caller", ko: "호출자마다 속도 제한" }),
      body: l.trans({
        en: "MCP calls are capped at 120 a minute and 8 at once for each caller.",
        ko: "MCP 호출은 호출자마다 분당 120번, 동시에 8개로 묶입니다.",
      }),
    },
    {
      title: l.trans({ en: "Secrets stay home", ko: "비밀은 밖으로 나가지 않습니다" }),
      body: l.trans({
        en: "Hidden and secret fields are stripped before anything reaches a model.",
        ko: "hidden·secret 필드는 모델에 닿기 전에 빠집니다.",
      }),
    },
    {
      title: l.trans({ en: "Connections end when you say", ko: "연결은 언제든 끝낼 수 있습니다" }),
      body: l.trans({
        en: "Revoke a connection and its next call is refused. The chat relay keeps no session and no transcript.",
        ko: "연결을 해지하면 다음 호출부터 거절됩니다. 채팅 릴레이는 세션도 대화도 남기지 않습니다.",
      }),
    },
  ];

  return (
    <main className="relative min-h-screen overflow-x-clip break-keep bg-background text-foreground">
      <section className="relative px-6 pt-[calc(var(--akanjs-header-offset)+2.5rem)] pb-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="intro-rise font-mono text-[11px] text-primary uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.3em]">
              {tagline}
            </p>
            <h1 className="intro-rise mt-6 font-black text-[2.6rem] leading-[1.04] tracking-tight [--intro-delay:0.1s] sm:text-6xl xl:text-7xl">
              <span className="block">{l.trans({ en: "Build a screen.", ko: "화면을 만들면," })}</span>
              <span className="block text-primary">
                {l.trans({ en: "Agents can use it.", ko: "에이전트가 씁니다." })}
              </span>
              <span className="mt-4 block">{l.trans({ en: "Build a server.", ko: "서버를 만들면," })}</span>
              <span className="block text-primary">
                {l.trans({ en: "Any AI can run it.", ko: "AI가 다룹니다." })}
                <span className="seed-caret ml-2" />
              </span>
            </h1>
            <p className="intro-rise mt-8 max-w-xl text-foreground/65 text-lg leading-8 [--intro-delay:0.25s]">
              {l.trans({
                en: "No tool schemas, no MCP server to write, no second permission model. The app you build for people is already the one AI can use — on the model you choose.",
                ko: "툴 스키마도, 따로 쓰는 MCP 서버도, 에이전트용 권한 모델도 없습니다. 사람을 위해 만든 앱이 그대로 AI가 쓰는 앱이 됩니다. 모델은 원하는 것을 고르면 됩니다.",
              })}
            </p>
            <div className="intro-rise mt-10 flex flex-col gap-3 [--intro-delay:0.4s] sm:flex-row sm:items-center">
              <InstallCommand />
              <Link href="/docs/intro/quickstart" className={buttonRecipe({ variant: "primary" }, "gap-2")}>
                {l.trans({ en: "Get started", ko: "시작하기" })}
                <BsArrowRight />
              </Link>
            </div>
            <a
              href="#screen"
              className="intro-rise mt-10 inline-flex items-center gap-2 font-mono text-foreground/45 text-xs uppercase tracking-[0.25em] transition [--intro-delay:0.55s] hover:text-foreground"
            >
              {l.trans({ en: "See how it works", ko: "어떻게 되는지 보기" })}
              <BsArrowDown />
            </a>
          </div>
          <div className="intro-rise flex flex-col items-center gap-6 [--intro-delay:0.3s]">
            <Duet.Switch />
            <Duet.Stage className="lg:[zoom:0.88]" />
          </div>
        </div>
      </section>

      <section className="relative px-6 py-28 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className={`${kicker} justify-center`}>{l.trans({ en: "the usual way", ko: "보통은" })}</p>
          <h2 className="mt-5 text-balance font-black text-4xl tracking-tight sm:text-6xl">
            {l.trans({ en: "Your next user doesn't click.", ko: "다음 사용자는 클릭하지 않습니다." })}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-foreground/65 text-lg leading-8">
            {l.trans({
              en: "Agents already read screens and call APIs for the people they work for. Getting an app ready for them is usually a second project, kept in step with the first by hand.",
              ko: "에이전트는 이미 사람을 대신해 화면을 읽고 API를 부릅니다. 앱을 여기에 맞추는 일은 보통 두 번째 프로젝트가 되고, 첫 번째 프로젝트와 손으로 맞춰야 합니다.",
            })}
          </p>
        </div>
        <Duet.Files className="reveal-rise mx-auto mt-14 max-w-3xl" />
        <div className="mx-auto mt-16 max-w-3xl text-center">
          <p className="text-balance font-black text-3xl tracking-tight sm:text-5xl">
            {l.trans({ en: "In Akan, that folder stays empty.", ko: "Akan에서는 이 폴더가 비어 있습니다." })}
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-foreground/60 text-lg leading-8">
            {l.trans({
              en: "Every line above is something you already wrote: your screens, your signals, your guards.",
              ko: "위의 모든 줄은 이미 쓴 것들입니다. 화면, 시그널, 가드.",
            })}
          </p>
        </div>
      </section>

      <Duet.ScreenStory
        header={
          <>
            <p className={kicker}>{l.trans({ en: "screen → agent", ko: "화면 → 에이전트" })}</p>
            <h2 className="mt-4 text-balance font-black text-3xl tracking-tight sm:text-5xl">
              {l.trans({
                en: "The screen you build is the agent's interface.",
                ko: "당신이 만든 화면이 곧 에이전트의 인터페이스입니다.",
              })}
            </h2>
          </>
        }
        steps={screenSteps}
      />
      <div className="mx-auto max-w-2xl px-6 pb-16 lg:hidden">
        <Code.Snippet
          className="w-full"
          title="IcecreamOrder.Zone.tsx"
          language="tsx"
          code={screenCode}
          showLineNumbers={false}
        />
      </div>

      <Duet.ServerStory
        header={
          <>
            <p className={kicker}>{l.trans({ en: "server → AI", ko: "서버 → AI" })}</p>
            <h2 className="mt-4 text-balance font-black text-3xl tracking-tight sm:text-5xl">
              {l.trans({ en: "Your server is already an MCP server.", ko: "당신의 서버는 이미 MCP 서버입니다." })}
            </h2>
          </>
        }
        steps={serverSteps}
      />
      <div className="mx-auto max-w-2xl px-6 pb-16 lg:hidden">
        <Code.Snippet className="w-full" title="icecreamOrder.signal.ts" code={serverCode} showLineNumbers={false} />
      </div>

      <section className="relative px-6 py-28 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className={kicker}>{l.trans({ en: "guard → everyone", ko: "가드 → 모두" })}</p>
          <h2 className="mt-5 max-w-3xl text-balance font-black text-4xl tracking-tight sm:text-6xl">
            {l.trans({ en: "One rule. Three kinds of users.", ko: "규칙은 하나, 사용자는 셋." })}
          </h2>
          <p className="mt-6 max-w-2xl text-foreground/65 text-lg leading-8">
            {l.trans({
              en: "You write a guard once per endpoint. It decides for a person on the screen, for the agent in their tab, and for an AI calling over MCP.",
              ko: "가드는 엔드포인트마다 한 번 씁니다. 화면 앞의 사람, 그 사람 탭 안의 에이전트, MCP로 부르는 AI 모두를 같은 가드가 판단합니다.",
            })}
          </p>
          <Duet.Matrix className="reveal-rise mt-12" />
          <p className="mt-4 font-mono text-[11px] text-foreground/45 leading-5">
            {l.trans({
              en: "asks first — the in-page tool waits on an approval card · not on the shelf — the endpoint never reaches MCP",
              ko: "먼저 묻기 — 인페이지 툴이 승인 카드에서 기다립니다 · 목록에 없음 — 엔드포인트가 MCP에 올라가지 않습니다",
            })}
          </p>
          <ul className="reveal-cascade mt-12 grid gap-4 sm:grid-cols-2">
            {facts.map(({ title, body }) => (
              <li key={title} className="rounded-2xl border border-foreground/10 bg-card/40 p-6 sm:p-8">
                <p className="font-bold text-lg">{title}</p>
                <p className="mt-2 text-foreground/60 leading-7">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className={kicker}>{l.trans({ en: "on a real app", ko: "실제 앱에서" })}</p>
          <h2 className="mt-5 text-balance font-black text-4xl tracking-tight sm:text-5xl">
            {l.trans({ en: "Watch it for real.", ko: "실제로 돌아가는 모습." })}
          </h2>
          <div className="reveal-cascade mt-12 grid gap-6 lg:grid-cols-2">
            <Duet.Video
              title={l.trans({ en: "In-page agent", ko: "인페이지 에이전트" })}
              shot={l.trans({
                en: "A customer asks for an order. The agent fills the form, waits on the approval card, and places it.",
                ko: "고객이 주문을 부탁하면, 에이전트가 폼을 채우고 승인 카드에서 기다렸다가 주문을 넣습니다.",
              })}
              length="30"
            />
            <Duet.Video
              title={l.trans({ en: "MCP", ko: "MCP" })}
              shot={l.trans({
                en: "Claude Code connects to /mcp, signs in, serves the morning's orders — and is refused a refund.",
                ko: "Claude Code가 /mcp에 연결해 로그인하고, 아침 주문을 서빙하고, 환불은 거절당합니다.",
              })}
              length="40"
            />
          </div>
        </div>
      </section>

      <section className="relative px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className={kicker}>{l.trans({ en: "this site", ko: "이 사이트" })}</p>
          <h2 className="mt-5 text-balance font-black text-4xl tracking-tight sm:text-5xl">
            {l.trans({ en: "These docs run on it, too.", ko: "이 문서도 같은 방식으로 돕니다." })}
          </h2>
          <div className="reveal-cascade mt-12 grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-foreground/10 bg-card/50 p-8">
              <p className="font-bold text-2xl">{l.trans({ en: "Ask the docs", ko: "문서에게 물어보기" })}</p>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "Every docs page carries the in-page agent. Ask about a topic; it searches the docs and opens the page for you.",
                  ko: "모든 문서 페이지에 인페이지 에이전트가 있습니다. 주제를 물으면 문서를 검색해 해당 페이지를 열어 줍니다.",
                })}
              </p>
              <Link
                href="/docs/intro/quickstart"
                className={buttonRecipe({ variant: "outline" }, "mt-auto w-fit gap-2 self-start")}
              >
                {l.trans({ en: "Open the docs", ko: "문서 열기" })}
                <BsArrowRight />
              </Link>
            </div>
            <div className="flex flex-col rounded-2xl border border-foreground/10 bg-card/50 p-8">
              <p className="font-bold text-2xl">{l.trans({ en: "Connect your AI", ko: "내 AI 연결하기" })}</p>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "akanjs.com answers MCP. Point Claude Code or Cursor at it, and your AI reads these docs while it writes your code.",
                  ko: "akanjs.com은 MCP에 응답합니다. Claude Code나 Cursor에 연결하면 AI가 코드를 쓰면서 이 문서를 읽습니다.",
                })}
              </p>
              <div className="mt-6 inline-flex w-fit max-w-full items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/5 py-2 pr-2 pl-4 font-mono text-sm">
                <span className="select-none text-primary">MCP</span>
                <span className="truncate text-foreground/80">{mcpUrl}</span>
                <Clipboard className="relative shrink-0" text={mcpUrl} />
              </div>
              <p className="mt-4 duet-agent:hidden font-mono text-[11px] text-foreground/45">
                listDocPages · searchDocPages · readDocPage
              </p>
              <pre className="mt-4 duet-agent:block hidden overflow-x-auto rounded-lg bg-primary/5 p-3 font-mono text-[10px] text-primary leading-5">
                {
                  '{"tools":[\n  {"name":"listDocPages","title":"Documentation Index"},\n  {"name":"readDocPage","title":"Read Documentation Page"},\n  {"name":"searchDocPages","title":"Search Documentation"}\n]}'
                }
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 pt-24 pb-40 text-center lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto h-72 max-w-3xl rounded-full bg-primary/10 blur-3xl" />
        <p className="relative font-mono text-[11px] text-primary uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.3em]">
          {tagline}
        </p>
        <h2 className="relative mt-6 font-black text-5xl tracking-tight sm:text-7xl">
          <span className="block">{l.trans({ en: "Build for people.", ko: "사람을 위해 만드세요." })}</span>
          <span className="block text-primary">
            {l.trans({ en: "Agents included.", ko: "에이전트는 기본 포함입니다." })}
          </span>
        </h2>
        <p className="relative mx-auto mt-6 max-w-xl text-foreground/60 text-lg leading-8">
          {l.trans({
            en: "Still one TypeScript codebase for web, iOS, Android, desktop, server and database.",
            ko: "웹, iOS, Android, 데스크톱, 서버, 데이터베이스까지 여전히 하나의 TypeScript 코드베이스입니다.",
          })}
        </p>
        <div className="relative mx-auto mt-12 w-fit">
          <InstallCommand />
          <Duet.AgentArrow className="absolute right-7 -bottom-4" />
          <Duet.HumanArrow className="absolute right-1 -bottom-6" />
        </div>
        <div className="relative mt-16 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
          <Link
            href="/docs/intro/quickstart"
            className="flex items-center gap-2 font-semibold text-primary hover:underline"
          >
            {l.trans({ en: "Get started", ko: "시작하기" })}
            <BsArrowRight />
          </Link>
          <Link
            href="/cheatsheet/interface/agent-chat"
            className="flex items-center gap-2 text-foreground/70 hover:text-foreground"
          >
            {l.trans({ en: "In-page agent", ko: "인페이지 에이전트" })}
            <BsArrowRight />
          </Link>
          <Link
            href="/cheatsheet/interface/mcp"
            className="flex items-center gap-2 text-foreground/70 hover:text-foreground"
          >
            MCP
            <BsArrowRight />
          </Link>
        </div>
      </section>
    </main>
  );
});
