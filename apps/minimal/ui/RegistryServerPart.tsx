import { usePage } from "@apps/minimal/client";
import { registrySharedText } from "@apps/minimal/common";

interface RegistryServerPartProps {
  className?: string;
}
export const RegistryServerPart = ({ className }: RegistryServerPartProps) => {
  const { l } = usePage();
  return (
    <>
      <output className={className} data-e2e="server-part">
        part-0
      </output>
      <output data-e2e="shared-server">{registrySharedText}</output>
      <output data-e2e="dict-server">{l("minimal.healthy")}</output>
    </>
  );
};
