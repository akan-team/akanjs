import { registrySharedText } from "@apps/minimal/common";

interface RegistryServerPartProps {
  className?: string;
}
export const RegistryServerPart = ({ className }: RegistryServerPartProps) => {
  return (
    <>
      <output className={className} data-e2e="server-part">
        part-0
      </output>
      <output data-e2e="shared-server">{registrySharedText}</output>
    </>
  );
};
