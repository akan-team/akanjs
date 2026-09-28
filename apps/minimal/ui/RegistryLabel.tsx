import { registryValue } from "../common/registryValue.constant";

interface RegistryLabelProps {
  className?: string;
  where: "server" | "client";
}
export const RegistryLabel = ({ className, where }: RegistryLabelProps) => {
  return (
    <output className={className} data-e2e={`label-${where}`} data-e2e-value={registryValue}>
      label-0
    </output>
  );
};
