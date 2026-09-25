"use client";
import { cn, usePage } from "akanjs/client";
import { decodeJwtPayload, lowerlize, mcpRefusalOf } from "akanjs/common";
import { type Account, type FetchProxy, getDefaultAccount } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useState } from "react";
import { AiOutlineCheck, AiOutlineCopy, AiOutlineSearch } from "react-icons/ai";
import { BiChevronDown, BiLock } from "react-icons/bi";
import { buttonRecipe } from "../Button";
import { Copy } from "../Copy";
import { Dropdown } from "../Dropdown";
import { Input } from "../Input";
import { Modal } from "../Modal";
import {
  Code,
  Collapse,
  dictText,
  docPill,
  docUi,
  Section,
  SummaryCard,
  SummaryGrid,
  Toolbar,
  ToolbarField,
} from "../Reference";
import { endpointEntriesOf, guardNamesOf, isWsEndpoint } from "./endpointEntries";
import RestApi from "./RestApi";
import WebSocket from "./WebSocket";

export default function Doc() {
  return <div></div>;
}

interface GuardItemProps {
  active: boolean;
  label: string;
  onClick: () => void;
}
const GuardItem = ({ active, label, onClick }: GuardItemProps) => (
  <button
    className={buttonRecipe({ variant: "ghost", size: "sm" }, "w-full justify-start")}
    onClick={onClick}
    type="button"
  >
    <AiOutlineCheck className={cn("size-3.5 shrink-0", active ? "text-primary" : "text-transparent")} />
    {label}
  </button>
);

interface DocSettingProps {
  fetch: FetchProxy;
  search?: string;
  onSearch?: (search: string) => void;
}
const DocSetting = ({ fetch, search, onSearch }: DocSettingProps) => {
  const tryGuards = st.use.tryGuards({ agent: false });
  const tryJwt = st.use.tryJwt({ agent: false });
  const guardNames = guardNamesOf(fetch);
  const selectionLabel =
    tryGuards.length === 0 ? "All guards" : tryGuards.length === 1 ? tryGuards[0] : `${tryGuards.length} guards`;
  return (
    <Toolbar>
      <ToolbarField label="Base URL">
        <Copy text={fetch.origin}>
          <button className={buttonRecipe({ variant: "ghost", size: "sm" }, "font-mono text-foreground/80")}>
            {fetch.origin}
            <AiOutlineCopy className="text-foreground/40" />
          </button>
        </Copy>
      </ToolbarField>
      {guardNames.length ? (
        <ToolbarField label="Guards">
          <Dropdown
            buttonClassName={buttonRecipe({ variant: "outline", size: "sm" }, "font-normal")}
            align="start"
            dropdownClassName="max-h-80 min-w-52"
            value={
              <>
                <span className="max-w-40 truncate">{selectionLabel}</span>
                <BiChevronDown className="text-foreground/40" />
              </>
            }
            content={
              <>
                <li data-dropdown-keep-open="">
                  <GuardItem
                    active={!tryGuards.length}
                    label="All guards"
                    onClick={() => {
                      st.do.setTryGuards([]);
                    }}
                  />
                </li>
                {guardNames.map((guardName) => (
                  <li data-dropdown-keep-open="" key={guardName}>
                    <GuardItem
                      active={tryGuards.includes(guardName)}
                      label={guardName}
                      onClick={() => {
                        const next = tryGuards.includes(guardName)
                          ? tryGuards.filter((name) => name !== guardName)
                          : [...tryGuards, guardName];
                        st.do.setTryGuards(next.length === guardNames.length ? [] : next);
                      }}
                    />
                  </li>
                ))}
              </>
            }
          />
        </ToolbarField>
      ) : null}
      <ToolbarField label="Auth">
        <DocAuthModal>
          <button className={buttonRecipe({ variant: tryJwt ? "primary" : "outline", size: "sm" })} type="button">
            <BiLock /> {tryJwt ? "Authorized" : "Anonymous"}
          </button>
        </DocAuthModal>
      </ToolbarField>
      {onSearch ? (
        <Input
          className="ml-auto"
          icon={<AiOutlineSearch className="text-foreground/40" />}
          iconClassName="-mr-8 z-10 pl-3"
          inputClassName="w-56 pl-9"
          nullable
          onChange={onSearch}
          placeholder="Search endpoints"
          value={search ?? ""}
        />
      ) : null}
    </Toolbar>
  );
};
Doc.Setting = DocSetting;

interface DocAuthModalProps {
  children: ReactNode;
}
const DocAuthModal = ({ children }: DocAuthModalProps) => {
  const tryJwt = st.use.tryJwt({ agent: false });
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
            className={buttonRecipe({ variant: "primary" }, "w-full")}
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
        <div className="flex w-full flex-col gap-2">
          <div className={docUi.sectionLabel}>Bearer token</div>
          <Input
            inputClassName="w-full font-mono text-xs"
            placeholder="eyJhbGciOi…"
            value={jwt ?? ""}
            onChange={setJwt}
            validate={() => true}
          />
        </div>
        <Code code={accountStr} label="Account decoded" />
      </Modal>
    </>
  );
};
Doc.AuthModal = DocAuthModal;

interface DocSignalsProps {
  fetch: FetchProxy;
}
const DocSignals = ({ fetch }: DocSignalsProps) => {
  const signalEntries = Object.entries(fetch.serializedSignal).sort(([keyA], [keyB]) =>
    lowerlize(keyA) > lowerlize(keyB) ? 1 : -1,
  );
  return (
    <div className="flex flex-col gap-2">
      {signalEntries.map(([refName], idx) => (
        <DocSignal key={idx} refName={refName} fetch={fetch} />
      ))}
    </div>
  );
};

Doc.DocSignals = DocSignals;

interface DocSignalProps {
  refName: string;
  fetch: FetchProxy;
}
const DocSignal = ({ refName, fetch }: DocSignalProps) => {
  const { l } = usePage();
  const desc = dictText(l, `${refName}.modelDesc`);
  return (
    <Collapse
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{refName}</span>
            <span className={docPill("muted")}>Signal</span>
          </div>
          {desc ? <div className="text-foreground/55 text-sm">{desc}</div> : null}
        </div>
      }
    >
      <RestApi.Endpoints refName={refName} fetch={fetch} />
    </Collapse>
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
  const [search, setSearch] = useState("");
  const desc = dictText(l, `${refName}.modelDesc`);
  const entries = endpointEntriesOf(refName, fetch);
  const wsEntries = entries.filter(({ endpoint }) => isWsEndpoint(endpoint));
  const mcpEntries = entries.filter(({ endpoint }) => !mcpRefusalOf(endpoint));
  return (
    <div className="flex break-after-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={docUi.pageTitle}>{refName}</h1>
          <span className={docPill("muted")}>Signal</span>
        </div>
        {desc ? <p className={docUi.sectionDescription}>{desc}</p> : null}
      </div>
      <SummaryGrid>
        <SummaryCard label="Endpoints" value={entries.length} />
        <SummaryCard label="REST API" value={entries.length - wsEntries.length} />
        <SummaryCard label="Web Socket" value={wsEntries.length} />
        <SummaryCard label="MCP Tools" value={mcpEntries.length} />
      </SummaryGrid>
      <DocSetting fetch={fetch} onSearch={setSearch} search={search} />
      <Section title="REST API">
        <RestApi.Endpoints refName={refName} fetch={fetch} openAll={openAll} search={search} />
      </Section>
      <Section title="Web Socket">
        <WebSocket.Endpoints refName={refName} fetch={fetch} openAll={openAll} search={search} />
      </Section>
    </div>
  );
};
Doc.Zone = Zone;
