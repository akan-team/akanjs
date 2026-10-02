import { FriendPlayground } from "@apps/akan/ui";
import { page } from "akanjs/client";

export default page()
  .config({ devOnly: true })
  .render(() => <FriendPlayground />);
