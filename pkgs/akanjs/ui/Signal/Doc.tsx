"use client";
import { fetch, usePage } from "akanjs/client";
import { decodeJwtPayload, lowerlize } from "akanjs/common";
import { type Account, type FetchProxy, getDefaultAccount } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useEffect, useState } from "react";
import { AiOutlineApi, AiOutlineCopy } from "react-icons/ai";
import { BiLock } from "react-icons/bi";
import { Copy } from "../Copy";
import { Input } from "../Input";
import { Modal } from "../Modal";
import RestApi from "./RestApi";
import { signalUi } from "./style";
import WebSocket from "./WebSocket";

export default function Doc() {
  return <div></div>;
}

interface DocSettingProps {
  guardNames?: string[];
  roleTypes?: string[];
  roleKeys?: { [key: string]: string };
}
const DocSetting = ({
  guardNames = ["Public"],
  roleTypes = ["Public", "User", "Admin", "SuperAdmin"],
  roleKeys = { me: "Admin", self: "User" },
}: DocSettingProps) => {
  const tryRoles = st.use.tryRoles();
  const tryAccount = st.use.tryAccount();
  useEffect(() => {
    st.set({ tryRoles: [...roleTypes] });
  }, []);
  const tryRoleForAll = roleTypes.every((roleType) => tryRoles.includes(roleType));
  const baseUrl = fetch.origin;
  const currentRoles = Object.entries(roleKeys)
    .filter(([key, roleType]) => !!tryAccount[key as keyof typeof tryAccount])
    .map(([key, roleType]) => roleType);
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-base-200 p-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="font-semibold text-base-content/70 text-sm">BaseURL</span>
        <Copy text={baseUrl}>
          <button className="btn btn-outline btn-sm">
            {baseUrl}
            <AiOutlineCopy />
          </button>
        </Copy>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-base-content/70 text-sm">Mode</span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            st.do.setTrySignalType("restapi");
          }}
        >
          <AiOutlineApi />
          Rest API
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-semibold text-base-content/70 text-sm">For</span>
        <button
          className={`btn btn-secondary btn-sm ${tryRoleForAll ? "" : "btn-outline"}`}
          onClick={() => {
            if (!tryRoleForAll) st.do.setTryRoles([...roleTypes]);
          }}
        >
          All
        </button>
        {roleTypes.map((roleType) => (
          <button
            key={roleType}
            className={`btn btn-secondary btn-sm ${!tryRoleForAll && tryRoles.includes(roleType) ? "" : "btn-outline"}`}
            onClick={() => {
              if (tryRoleForAll) st.do.setTryRoles([roleType]);
              else if (!tryRoles.includes(roleType)) st.do.setTryRoles([...tryRoles, roleType]);
              else if (tryRoles.length !== 1) st.do.setTryRoles(tryRoles.filter((t) => t !== roleType));
            }}
          >
            {roleType}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-base-content/70 text-sm">Auth</span>
        <DocAuthModal>
          <button className={`btn btn-sm ${currentRoles.length > 0 ? "btn-primary" : "btn-outline"} `}>
            <BiLock /> {currentRoles.length > 0 ? currentRoles.join(", ") : "Public"}
          </button>
        </DocAuthModal>
      </div>
    </div>
  );
};
Doc.Setting = DocSetting;

interface DocAuthModalProps {
  children: ReactNode;
}
const DocAuthModal = ({ children }: DocAuthModalProps) => {
  const tryJwt = st.use.tryJwt();
  const [jwt, setJwt] = useState(tryJwt);
  const [modalOpen, setModalOpen] = useState(false);
  const decodedAccount = jwt ? decodeJwtPayload<Account>(jwt) : null;
  const accountStr = JSON.stringify(decodedAccount ?? getDefaultAccount(), null, 2);
  return (
    <>
      <div
        onClick={() => {
          setModalOpen(true);
          setJwt(tryJwt);
        }}
      >
        {children}
      </div>
      <Modal
        bodyClassName="flex flex-col gap-4"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
        }}
        title="Set JWT for Authorization"
        action={
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              st.set(
                decodedAccount
                  ? { tryJwt: jwt, tryAccount: decodedAccount }
                  : { tryJwt: null, tryAccount: getDefaultAccount() },
              );
              setModalOpen(false);
            }}
          >
            <BiLock /> Set Authorization
          </button>
        }
      >
        <div className="w-full">
          <div className={signalUi.sectionTitle}>Current JWT</div>
          <Input inputClassName="w-full" value={jwt ?? ""} onChange={setJwt} validate={() => true} />
        </div>
        <div className="w-full">
          <div className={signalUi.sectionTitle}>Account Decoded</div>
          <div className="relative">
            <Input.TextArea
              inputClassName="w-full"
              value={accountStr}
              onChange={() => true}
              validate={() => true}
              rows={10}
            />
            {decodedAccount ? (
              <div className="absolute top-4 right-4">
                <Copy text={accountStr}>
                  <button className="btn btn-sm">
                    <AiOutlineCopy /> Copy
                  </button>
                </Copy>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
};
Doc.AuthModal = DocAuthModal;

interface DocSignalsProps {
  fetch: FetchProxy;
}
const DocSignals = ({ fetch }: DocSignalsProps) => {
  const signal = fetch.serializedSignal;
  const signalEntries = Object.entries(signal).sort(([keyA], [keyB]) => (lowerlize(keyA) > lowerlize(keyB) ? 1 : -1));
  return (
    <div className="flex flex-col gap-3">
      {signalEntries.map(([refName, signal], idx) => {
        return (
          <div className="font-bold text-3xl" key={idx}>
            <DocSignal refName={refName} fetch={fetch} />
          </div>
        );
      })}
    </div>
  );
};

Doc.DocSignals = DocSignals;

interface DocSignalProps {
  refName: string;
  fetch: FetchProxy;
}
const DocSignal = ({ refName, fetch }: DocSignalProps) => {
  return (
    <div className="collapse-arrow collapse bg-base-200">
      <input type="checkbox" />
      <div className="collapse-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-xl">{refName}</div>
          <div className="badge badge-primary">Signal</div>
        </div>
      </div>
      <div className="collapse-content flex flex-col gap-3">
        <RestApi.Endpoints refName={refName} fetch={fetch} />
      </div>
    </div>
  );
};
Doc.DocSignal = DocSignal;

interface ZoneProps {
  refName: string;
  fetch: FetchProxy;
  openAll?: boolean;
}
const Zone = ({ refName, fetch, openAll }: ZoneProps) => {
  const { l } = usePage();
  return (
    <div className="flex break-after-page flex-col gap-4">
      <div>
        <div className="font-bold text-3xl">{refName}</div>
        <div className="text-base-content/70">{l._(`${refName}.modelDesc`)}</div>
      </div>
      <DocSetting />
      <div className="font-bold text-2xl">APIs</div>
      <RestApi.Endpoints refName={refName} fetch={fetch} openAll={openAll} />
      <div className="font-bold text-2xl">Web Socket</div>
      <WebSocket.Endpoints refName={refName} fetch={fetch} openAll={openAll} />
    </div>
  );
};
Doc.Zone = Zone;
