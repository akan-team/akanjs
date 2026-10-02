import { usePage } from "@apps/akan/client";
import { Friend, type FriendProps } from "./Friend";
import { JellyCast } from "./JellyCast";

const cast = ["planet", "rocket", "moon", "cloud", "comet"] as const;
const sizes = ["size-32", "size-24", "size-16", "size-12", "size-7"] as const;

export const FriendPlayground = () => {
  const { l } = usePage();
  const notes: { [key in FriendProps["name"]]: { role: string; act: string } } = {
    planet: {
      role: l.trans({ en: "Web · the bookish browser", ko: "웹 · 책벌레 브라우저" }),
      act: l.trans({
        en: "Leans in to read when you come close. Hover spins the ring up; a click refreshes it — glasses askew.",
        ko: "가까이 가면 몸을 기울여 읽습니다. 호버하면 고리가 빨라지고, 클릭하면 새로고침처럼 한 바퀴 — 안경이 삐뚤어져요.",
      }),
    },
    rocket: {
      role: l.trans({ en: "App · the eager pilot", ko: "앱 · 성급한 파일럿" }),
      act: l.trans({
        en: "Hover revs the engine. A click snaps the goggles down and ships it — lift-off and a squashy landing.",
        ko: "호버하면 엔진을 부릉, 클릭하면 고글을 내리고 발사 — 날아올랐다가 말랑하게 착지합니다.",
      }),
    },
    moon: {
      role: l.trans({ en: "Server · DB · the night-shift operator", ko: "서버 · DB · 야간 근무자" }),
      act: l.trans({
        en: "Dozes with lo-fi on. Come close and it jolts awake; a click grooves to the beat. Leave it and it nods off again.",
        ko: "로파이를 들으며 졸다가 커서가 오면 화들짝 깹니다. 클릭하면 박자에 맞춰 까딱, 떠나면 다시 꾸벅.",
      }),
    },
    cloud: {
      role: l.trans({ en: "Infra · the steady builder", ko: "인프라 · 듬직한 시공자" }),
      act: l.trans({
        en: "Hover auto-scales: two replica clouds pop out. A click hops the hard hat off and provisions a little drizzle.",
        ko: "호버하면 오토스케일 — 복제 구름 둘이 튀어나와요. 클릭하면 안전모가 튀어 오르고 보슬비가 내립니다.",
      }),
    },
    comet: {
      role: l.trans({ en: "Agent · the attentive helper", ko: "에이전트 · 눈치 빠른 조수" }),
      act: l.trans({
        en: "Leans toward your cursor wherever it goes. Hover makes it listen and talk; a click is “on it!” — a loop and sparkles.",
        ko: "커서가 어디 있든 그쪽으로 몸을 기울입니다. 호버하면 듣고 말하고, 클릭하면 “맡겨줘!” — 한 바퀴 돌고 반짝.",
      }),
    },
  };
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-24">
      <header className="flex flex-col gap-3">
        <h1 className="font-black text-4xl text-foreground tracking-tight">
          {l.trans({ en: "Jelly friends", ko: "젤리 친구들" })}
        </h1>
        <p className="max-w-2xl text-foreground/60 leading-7">
          {l.trans({
            en: "Move the cursor, hover, click. Three quick clicks make anyone dizzy. On touch, tap — they look where you tapped.",
            ko: "커서를 움직이고, 올리고, 눌러 보세요. 세 번 빠르게 누르면 어지러워합니다. 터치에서는 탭한 곳을 바라봐요.",
          })}
        </p>
      </header>
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cast.map((name) => (
          <article className="jelly-glass flex flex-col items-center gap-5 rounded-4xl px-6 pt-16 pb-8" key={name}>
            <Friend className="size-40" name={name} />
            <div className="flex flex-col gap-2 text-center">
              <h2 className="font-black text-foreground text-lg tracking-tight">{notes[name].role}</h2>
              <p className="text-foreground/60 text-sm leading-6">{notes[name].act}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="flex flex-col gap-6">
        <h2 className="font-black text-2xl text-foreground tracking-tight">
          {l.trans({ en: "Every size", ko: "크기별" })}
        </h2>
        <div className="flex flex-col gap-6">
          {cast.map((name) => (
            <div className="flex items-end gap-8" key={name}>
              {sizes.map((size) => (
                <Friend className={size} key={size} name={name} />
              ))}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col items-center gap-6">
        <h2 className="font-black text-2xl text-foreground tracking-tight">
          {l.trans({ en: "The cast row", ko: "캐스트 줄" })}
        </h2>
        <JellyCast friendClassName="size-20 md:size-24" />
      </section>
    </div>
  );
};
