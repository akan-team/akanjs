import "../styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .head(
    <>
      <title>groupedroot</title>
      <link rel="icon" href="/favicon.ico" />
    </>,
  )
  .render(({ children }) => <>{children}</>);
