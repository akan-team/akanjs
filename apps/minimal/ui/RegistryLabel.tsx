interface RegistryLabelProps {
  className?: string;
  where: "server" | "client";
}
export const RegistryLabel = ({ className, where }: RegistryLabelProps) => {
  return (
    <output className={className} data-e2e={`label-${where}`}>
      label-0
    </output>
  );
};
