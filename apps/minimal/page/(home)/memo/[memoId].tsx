import { fetch, Memo, usePage } from "@apps/minimal/client";
import { appNavClass, Screen } from "@apps/minimal/ui";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default page()
  .param("memoId", ID)
  .config({ topInset: 48, transition: "stack" })
  .app("showTripNote", "Show one trip note with its images.", ({ memoId }) => {
    const { memoView } = fetch.viewMemo(memoId);
    return <Memo.Zone.View view={memoView} />;
  })
  .render(({ memoId, showTripNote }) => {
    const { l } = usePage();
    return (
      <Screen className="pb-10">
        <Layout.Navbar className={appNavClass} back>
          <div className="font-semibold">{l.trans({ en: "Trip note", ko: "여행 메모" })}</div>
        </Layout.Navbar>
        <div className="flex flex-col gap-4 px-5 pt-5 md:mx-auto md:max-w-2xl">
          {showTripNote}
          <div className="flex gap-2">
            <Memo.Util.AttachImage memoId={memoId} />
            <Memo.Util.Remove memoId={memoId} />
          </div>
        </div>
      </Screen>
    );
  });
