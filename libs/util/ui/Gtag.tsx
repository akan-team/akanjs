import { GtagConfig } from "./GtagConfig";

interface GtagProps {
  id: string;
}

export const Gtag = ({ id }: GtagProps) => {
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${id}`} />
      <GtagConfig id={id} />
    </>
  );
};
