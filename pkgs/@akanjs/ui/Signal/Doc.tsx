"use client";
import { usePage } from "@akanjs/client";
import { lowerlize } from "@akanjs/common";
import { Account, client, defaultAccount, SerializedSignal } from "@akanjs/signal";
import { st } from "@akanjs/store";
import decode from "jsonwebtoken/decode";
import { useEffect, useState } from "react";
import { AiOutlineApi, AiOutlineCopy } from "react-icons/ai";
import { BiLock, BiLogoGraphql } from "react-icons/bi";

import { Copy } from "../Copy";
import { Input } from "../Input";
import { Modal } from "../Modal";
import GraphQL from "./GraphQL";
import RestApi from "./RestApi";
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
  const trySignalType = st.use.trySignalType();
  const tryRoles = st.use.tryRoles();
  const tryAccount = st.use.tryAccount();
  useEffect(() => {
    st.set({ tryRoles: [...roleTypes] });
  }, []);
  const tryRoleForAll = roleTypes.every((roleType) => tryRoles.includes(roleType));
  const baseUrl = trySignalType === "graphql" ? client.uri : client.uri.replace("/graphql", "");
  const currentRoles = Object.entries(roleKeys)
    .filter(([key, roleType]) => !!tryAccount[key as keyof typeof tryAccount])
    .map(([key, roleType]) => roleType);
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4">
      <div className="flex flex-1 items-center gap-1">
        BaseURL:{" "}
        <Copy text={baseUrl}>
          <button className="btn btn-outline btn-sm">
            {baseUrl}
            <AiOutlineCopy />
          </button>
        </Copy>
      </div>
      <div className="flex items-center gap-1">
        Mode:
        <button
          className={`btn btn-sm ${trySignalType === "graphql" ? "border-[#E535AB] bg-[#E535AB] text-white" : "btn-outline"}`}
          onClick={() => {
            st.do.setTrySignalType("graphql");
          }}
        >
          <BiLogoGraphql />
          GraphQL
        </button>
        <button
          className={`btn btn-primary btn-sm ${trySignalType === "restapi" ? "" : "btn-outline"}`}
          onClick={() => {
            st.do.setTrySignalType("restapi");
          }}
        >
          <AiOutlineApi />
          Rest API
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        For:
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
      <div className="flex items-center gap-1">
        Auth:
        <DocAuthModal>
          <button className={`btn btn-sm ${currentRoles.length > 0 ? "btn-warning" : "btn-neutral"} `}>
            <BiLock /> {currentRoles.length > 0 ? currentRoles.join(", ") : "Public"}
          </button>
        </DocAuthModal>
      </div>
    </div>
  );
};
Doc.Setting = DocSetting;

interface DocAuthModalProps {
  children: any;
}
const DocAuthModal = ({ children }: DocAuthModalProps) => {
  const tryJwt = st.use.tryJwt();
  const [jwt, setJwt] = useState(tryJwt);
  const [modalOpen, setModalOpen] = useState(false);
  const decodedAccount = jwt ? (decode as (jwt: string) => Account)(jwt) : null;
  const accountStr = JSON.stringify(decodedAccount ?? defaultAccount, null, 2);
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
                  : { tryJwt: null, tryAccount: defaultAccount }
              );
              setModalOpen(false);
            }}
          >
            <BiLock /> Set Authorization
          </button>
        }
      >
        <div className="w-full">
          <div>Current JWT</div>
          <Input inputClassName="w-full" value={jwt ?? ""} onChange={setJwt} validate={() => true} />
        </div>
        <div className="w-full">
          <div className="flex items-center gap-2">Account Decoded</div>
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

const DocSignals = () => {
  const signals = global.signals as SerializedSignal[];
  const refNames = signals.map((signal) => signal.refName).sort((a, b) => (lowerlize(a) > lowerlize(b) ? 1 : -1));
  return (
    <div>
      {refNames.map((refName, idx) => {
        return (
          <div className="px-5 pb-5 text-3xl font-bold" key={idx}>
            <DocSignal refName={refName} />
          </div>
        );
      })}
    </div>
  );
};

Doc.DocSignals = DocSignals;

interface DocSignalProps {
  refName: string;
}
const DocSignal = ({ refName }: DocSignalProps) => {
  return (
    <div className="collapse-arrow bg-base-200 collapse">
      <input type="checkbox" />
      <div className="collapse-title text-xl font-medium">{refName}</div>
      <div className="collapse-content">
        <GraphQL.Endpoints refName={refName} />
      </div>
    </div>
  );
};
Doc.DocSignal = DocSignal;

interface ZoneProps {
  refName: string;
  openAll?: boolean;
}
const Zone = ({ refName, openAll }: ZoneProps) => {
  const { l } = usePage();
  const trySingnalType = st.use.trySignalType();
  return (
    <div className="flex break-after-page flex-col gap-4">
      <div className="text-3xl font-bold">{refName}</div>
      <div className="mb-5"> - {l._(`${refName}.modelDesc`)}</div>
      <div className="text-2xl font-bold">APIs</div>
      <DocSetting />
      {trySingnalType === "graphql" ? (
        <GraphQL.Endpoints refName={refName} openAll={openAll} />
      ) : (
        <RestApi.Endpoints refName={refName} openAll={openAll} />
      )}
      <div className="text-2xl font-bold">Web Socket</div>
      <WebSocket.Endpoints refName={refName} openAll={openAll} />
    </div>
  );
};
Doc.Zone = Zone;
