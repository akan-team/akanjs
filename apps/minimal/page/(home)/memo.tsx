import { fetch, Memo, usePage } from "@apps/minimal/client";
import { page } from "akanjs/client";
import { Model } from "akanjs/ui";

export default page()
  .config({ topInset: 48, transition: "stack" })
  .render(() => {
    const { l } = usePage();
    const { memoInitInPublic } = fetch.initMemoInPublic();
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold text-2xl">{l("memo.modelName")}</div>
          <Model.New slice={fetch.slice.memoInPublic} renderTitle="name">
            <Memo.Template.General />
          </Model.New>
        </div>
        <Memo.Zone.Card className="flex flex-col gap-2" init={memoInitInPublic} />
      </div>
    );
  });
