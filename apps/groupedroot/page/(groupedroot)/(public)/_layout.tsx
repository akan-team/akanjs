import { layout } from "akanjs/client";

export default layout().render(({ children }) => <div data-e2e="public-layout">{children}</div>);
