import { JellyLoader } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout()
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(({ children }) => <div className="pt-24 lg:pt-16">{children}</div>);
