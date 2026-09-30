import { fetch, Memo } from "@apps/minimal/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("memoId", ID)
  .config({ topInset: 48, transition: "stack" })
  .render(({ memoId }) => {
    const { memoView } = fetch.viewMemo(memoId);
    return (
      <div className="flex flex-col gap-4 p-4">
        <Memo.Zone.View view={memoView} />
        <div className="flex gap-2">
          <Memo.Util.AttachImage memoId={memoId} />
          <Memo.Util.Remove memoId={memoId} />
        </div>
      </div>
    );
  });
