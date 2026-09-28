interface RegistryServerPartProps {
  className?: string;
}
export const RegistryServerPart = ({ className }: RegistryServerPartProps) => {
  return (
    <output className={className} data-e2e="server-part">
      part-0
    </output>
  );
};
