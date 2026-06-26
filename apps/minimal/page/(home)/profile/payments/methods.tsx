import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";
import { AiOutlinePlus, AiOutlineSafetyCertificate } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-8">
      <Layout.Navbar className="apptest-nav" back>
        <div className="font-semibold">Payment method</div>
      </Layout.Navbar>
      <div className="space-y-4 pt-5">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary to-secondary p-5 text-primary-content">
          <p className="text-primary-content/60 text-sm">Primary card</p>
          <p className="mt-8 font-bold text-2xl tracking-widest">4242 •••• •••• 1024</p>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span>Seon Guest</span>
            <span>12/29</span>
          </div>
        </div>
        <div className="apptest-card rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <AiOutlineSafetyCertificate className="text-2xl text-success" />
            <div>
              <p className="font-semibold">Secure payment</p>
              <p className="apptest-muted text-sm">Your payment information is securely encrypted and stored.</p>
            </div>
          </div>
        </div>
        <button className="btn btn-outline w-full rounded-2xl">
          <AiOutlinePlus /> Add new card
        </button>
      </div>
    </div>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
