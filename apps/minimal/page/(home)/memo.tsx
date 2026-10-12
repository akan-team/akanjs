import { fetch, Memo, usePage } from "@apps/minimal/client";
import { appNavClass, Screen } from "@apps/minimal/ui";
import { page } from "akanjs/client";
import { Layout, Model } from "akanjs/ui";

export default page()
  .config({ topInset: 48, transition: "stack" })
  .prompt("showTripNotes", "Show the notes shared with everyone on this trip.")
  .render(() => {
    const { l } = usePage();
    const { memoInitInPublic } = fetch.initMemoInPublic();
    return (
      <Screen className="pb-10">
        <Layout.Navbar className={appNavClass} back>
          <div className="font-semibold">{l.trans({ en: "Trip notes", ko: "여행 메모" })}</div>
        </Layout.Navbar>
        <div className="flex flex-col gap-4 px-5 pt-5 md:mx-auto md:max-w-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground/50 text-sm">
              {l.trans({ en: "Shared with everyone on this trip", ko: "이번 여행을 함께하는 모두와 공유돼요" })}
            </p>
            <Model.New slice={fetch.slice.memoInPublic} renderTitle="name">
              <Memo.Template.General />
            </Model.New>
          </div>
          <Memo.Zone.Card className="flex flex-col gap-3" init={memoInitInPublic} />
        </div>
      </Screen>
    );
  });
