import { RegistryLabel, RegistryLazy, RegistryProbe, RegistryServerPart } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "none", gesture: false })
  .render(() => (
    <main>
      <RegistryLabel where="server" />
      <RegistryServerPart />
      <RegistryProbe />
      <RegistryLazy />
    </main>
  ));
