import { ReactNode, Suspense } from "react";

export interface ClientSideProps {
  children: any;
  loading?: ReactNode;
}
export const ClientSide = ({ children, loading }: ClientSideProps) => {
  return <Suspense fallback={loading}>{children}</Suspense>;
};
