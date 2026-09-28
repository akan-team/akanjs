import { RegistryLabel, RegistryLazy, RegistryProbe } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "none", gesture: false })
  .render(() => (
    <main>
      <RegistryLabel where="server" />
      <RegistryProbe />
      <RegistryLazy />
    </main>
  ));
