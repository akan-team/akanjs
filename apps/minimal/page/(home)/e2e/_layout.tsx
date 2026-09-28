import { layout } from "akanjs/client";

export default layout()
  .config({ devOnly: true })
  .render(({ children }) => <>{children}</>);
