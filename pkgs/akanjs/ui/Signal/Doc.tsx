"use client";
import { cn, usePage } from "akanjs/client";
import { decodeJwtPayload, mcpRefusalOf } from "akanjs/common";
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
import { originText, ownerOf } from "../Reference/origin";
import { Tab } from "../Tab";
import {
  endpointEntriesOf,
  guardNamesOf,
  isWsEndpoint,
  runtimeFetch,
  type SignalScope,
  signalOwnerOrderOf,
  signalRefNamesOf,
} from "./endpointEntries";
import { RestApiEndpoints } from "./RestApi";
import { guardCountText, signalText } from "./signalText";
import { WebSocketEndpoints } from "./WebSocket";

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
  fetch?: FetchProxy;
  search?: string;
  onSearch?: (search: string) => void;
}
export const DocSetting = ({ fetch = runtimeFetch, search, onSearch }: DocSettingProps) => {
  const { l } = usePage();
  const tryGuards = st.use.tryGuards({ agent: false });
  const tryJwt = st.use.tryJwt({ agent: false });
  const guardNames = guardNamesOf(fetch);
  const selectionLabel =
    tryGuards.length === 0
      ? l.trans(signalText.allGuards)
      : tryGuards.length === 1
        ? tryGuards[0]
        : l.trans(guardCountText(tryGuards.length));
  return (
    <Toolbar>
      <ToolbarField label={l.trans(signalText.baseUrl)}>
        <Copy text={fetch.origin}>
          <button className={buttonRecipe({ variant: "ghost", size: "sm" }, "font-mono text-foreground/80")}>
            {fetch.origin}
            <AiOutlineCopy className="text-foreground/40" />
          </button>
        </Copy>
      </ToolbarField>
      {guardNames.length ? (
        <ToolbarField label={l.trans(signalText.guards)}>
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
                    label={l.trans(signalText.allGuards)}
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
      <ToolbarField label={l.trans(signalText.auth)}>
        <DocAuthModal>
          <button className={buttonRecipe({ variant: tryJwt ? "primary" : "outline", size: "sm" })} type="button">
            <BiLock /> {l.trans(tryJwt ? signalText.authorized : signalText.anonymous)}
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
          placeholder={l.trans(signalText.searchEndpoints)}
          value={search ?? ""}
        />
      ) : null}
    </Toolbar>
  );
};
interface DocAuthModalProps {
  children: ReactNode;
}
export const DocAuthModal = ({ children }: DocAuthModalProps) => {
  const { l } = usePage();
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
        title={l.trans(signalText.setJwtTitle)}
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
            <BiLock /> {l.trans(signalText.setAuthorization)}
          </button>
        }
      >
        <div className="flex w-full flex-col gap-2">
          <div className={docUi.sectionLabel}>{l.trans(signalText.bearerToken)}</div>
          <Input
            inputClassName="w-full font-mono text-xs"
            placeholder="eyJhbGciOi…"
            value={jwt ?? ""}
            onChange={setJwt}
            validate={() => true}
          />
        </div>
        <Code code={accountStr} label={l.trans(signalText.accountDecoded)} />
      </Modal>
    </>
  );
};
interface DocSignalsProps extends SignalScope {
  fetch?: FetchProxy;
}
export const DocSignals = ({ fetch = runtimeFetch, include, exclude, libs }: DocSignalsProps) => (
  <div className="flex flex-col gap-2">
    {signalRefNamesOf(fetch, { include, exclude, libs }).map((refName) => (
      <DocSignal key={refName} refName={refName} fetch={fetch} />
    ))}
  </div>
);

interface DocSignalProps {
  refName: string;
  fetch?: FetchProxy;
}
export const DocSignal = ({ refName, fetch = runtimeFetch }: DocSignalProps) => {
  const { l } = usePage();
  const desc = dictText(l, `${refName}.modelDesc`);
  return (
    <Collapse
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{refName}</span>
            <span className={docPill("muted")}>{l.trans(signalText.signal)}</span>
          </div>
          {desc ? <div className="text-foreground/55 text-sm">{desc}</div> : null}
        </div>
      }
    >
      <RestApiEndpoints refName={refName} fetch={fetch} />
    </Collapse>
  );
};

interface ZoneProps {
  refName: string;
  fetch?: FetchProxy;
  openAll?: boolean;
}
export const Zone = ({ refName, fetch = runtimeFetch, openAll }: ZoneProps) => {
  const { l } = usePage();
  const [search, setSearch] = useState("");
  const desc = dictText(l, `${refName}.modelDesc`);
  const entries = endpointEntriesOf(refName, fetch);
  const wsEntries = entries.filter(({ endpoint }) => isWsEndpoint(endpoint));
  const mcpEntries = entries.filter(({ key, endpoint }) => !mcpRefusalOf(endpoint, { refName, key }));
  const origin = fetch.serializedSignal[refName]?.origin;
  return (
    <div className="flex break-after-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={docUi.pageTitle}>{refName}</h1>
          <span className={docPill("muted")}>{l.trans(signalText.signal)}</span>
          {origin?.length ? <span className={docPill("muted", "font-mono")}>{l.trans(originText(origin))}</span> : null}
        </div>
        {desc ? <p className={docUi.sectionDescription}>{desc}</p> : null}
      </div>
      <SummaryGrid>
        <SummaryCard label={l.trans(signalText.endpoints)} value={entries.length} />
        <SummaryCard label={l.trans(signalText.restApi)} value={entries.length - wsEntries.length} />
        <SummaryCard label={l.trans(signalText.webSocket)} value={wsEntries.length} />
        <SummaryCard label={l.trans(signalText.mcpTools)} value={mcpEntries.length} />
      </SummaryGrid>
      <DocSetting fetch={fetch} onSearch={setSearch} search={search} />
      <Section title={l.trans(signalText.restApi)}>
        <RestApiEndpoints refName={refName} fetch={fetch} openAll={openAll} search={search} />
      </Section>
      <Section title={l.trans(signalText.webSocket)}>
        <WebSocketEndpoints refName={refName} fetch={fetch} openAll={openAll} search={search} />
      </Section>
    </div>
  );
};

interface ExplorerProps extends SignalScope {
  className?: string;
  fetch?: FetchProxy;
  defaultRefName?: string;
  openAll?: boolean;
  groupBy?: "lib";
}
export const Explorer = ({
  className,
  fetch = runtimeFetch,
  include,
  exclude,
  libs,
  defaultRefName,
  openAll,
  groupBy,
}: ExplorerProps) => {
  const { l } = usePage();
  const refNames = signalRefNamesOf(fetch, { include, exclude, libs });
  if (!refNames.length) return <div className={docUi.emptyPanel}>{l.trans(signalText.noSignal)}</div>;
  const groups =
    groupBy === "lib"
      ? [...signalOwnerOrderOf(fetch), ""]
          .map((owner) => ({
            owner,
            refNames: refNames.filter((refName) => (ownerOf(fetch.serializedSignal[refName]?.origin) ?? "") === owner),
          }))
          .filter((group) => group.refNames.length)
      : [{ owner: null, refNames }];
  const ordered = groups.flatMap((group) => group.refNames);
  const firstRefName = defaultRefName && ordered.includes(defaultRefName) ? defaultRefName : ordered[0];
  return (
    <Tab className={cn("flex w-full items-start gap-8", className)} defaultMenu={firstRefName}>
      <aside className="sticky top-0 flex max-h-screen w-56 shrink-0 flex-col gap-4 overflow-y-auto py-2">
        {groups.map((group) => (
          <div className="flex flex-col gap-1" key={group.owner ?? ""}>
            {group.owner === null ? null : (
              <div className={cn(docUi.sectionLabel, "px-3")}>{group.owner || l.trans(signalText.unknownOrigin)}</div>
            )}
            <Tab.Menus className="flex flex-col items-stretch gap-0.5">
              {group.refNames.map((refName) => (
                <Tab.Menu key={refName} className="truncate text-left font-mono" menu={refName} scrollToTop>
                  {refName}
                </Tab.Menu>
              ))}
            </Tab.Menus>
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        {ordered.map((refName) => (
          <Tab.Panel key={refName} loading="lazy" menu={refName}>
            <Zone refName={refName} fetch={fetch} openAll={openAll} />
          </Tab.Panel>
        ))}
      </div>
    </Tab>
  );
};
