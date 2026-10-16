"use client";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { ConstantRegistry, labelOf } from "akanjs/constant";
import type { ClientView, ServerView } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useScreenScope } from "akanjs/webkit";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { Empty } from "../Empty";
import { Loading } from "../Loading";
import Stream from "./Stream";

interface DefaultProps<_T extends string, M> {
  className?: string;
  /** Renders the model without the default wrapper div. */
  noDiv?: boolean;
  loading?: ReactNode;
  empty?: ReactNode;
  renderView: (model: M) => ReactNode;
}

interface ViewProps<T extends string, Full extends { id: string }> extends DefaultProps<T, Full> {
  view: ClientView<T, Full>;
}

interface RenderProps<T extends string, Full extends { id: string }> extends DefaultProps<T, Full> {
  view: ServerView<T, Full>;
}

function Render<T extends string, Full extends { id: string }>({
  className,
  view,
  noDiv,
  loading,
  renderView,
}: RenderProps<T, Full>) {
  const loadedId = useRef<string | null>(null);
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName } = view;
  const model = storeUse[refName]() as Full | null;
  const cnst = ConstantRegistry.getDatabase(refName);
  const modelLoading = storeUse[`${refName}Loading`]() as string | boolean;
  const modelObj = view[`${refName}Obj`] as Full;
  const modelViewAt = view[`${refName}ViewAt`] as Date;
  if (
    !modelLoading &&
    model?.id === modelObj.id &&
    storeGet<Date>()[`${refName}ViewAt`].getTime() >= modelViewAt.getTime()
  )
    loadedId.current = modelObj.id;

  const modelInit = useMemo(() => {
    const modelObj = view[`${refName}Obj`] as Full;
    if (loadedId.current === modelObj.id) return model;
    return new cnst.full().set(modelObj) as unknown as Full;
  }, [view]);

  useEffect(() => {
    if (loadedId.current === modelObj.id) return;
    const modelViewAt = view[`${refName}ViewAt`] as Date;
    st.set({
      [refName]: modelInit,
      [`${refName}Loading`]: false,
      [`${refName}Modal`]: "view",
      [`${refName}ViewAt`]: modelViewAt,
    });
    loadedId.current = modelObj.id;
  }, [modelViewAt, modelObj.id]);

  useEffect(() => {
    // A payload older than the last local write is an RSC-cache replay, so the model hydrated above is stale.
    // `<refName>StaleAt` is the root slice's stamp, absent only when the signal declares no slice.
    const modelStaleAt = storeGet<Date | undefined>()[`${refName}StaleAt`];
    if (!modelStaleAt || storeGet<Date>()[`${refName}ViewAt`].getTime() >= modelStaleAt.getTime()) return;
    if (storeGet<string | boolean>()[`${refName}Loading`]) return;
    void storeDo[`view${capitalize(refName)}`](modelObj.id);
  }, [modelViewAt, modelObj.id]);

  const renderModel = loadedId.current === modelObj.id ? model : modelInit;
  const scopePath = useScreenScope({
    id: `${refName}-view`,
    kind: refName,
    label: renderModel ? labelOf(cnst.full, renderModel) : undefined,
  });

  return noDiv && renderModel ? (
    renderView(renderModel)
  ) : renderModel ? (
    <div className={cn("w-full", className)} data-agent-scope={scopePath}>
      {renderView(renderModel)}
    </div>
  ) : null;
}

export default function View<T extends string, Full extends { id: string }>({
  view,
  empty,
  ...props
}: ViewProps<T, Full>) {
  return (
    <Stream
      of={view}
      fallback={
        props.loading === undefined ? (
          <div className="size-full">
            <Loading.Skeleton active />
          </div>
        ) : (
          props.loading
        )
      }
    >
      {(serverView) =>
        serverView ? (
          <Render {...props} view={serverView} />
        ) : (
          (empty ?? (
            <div className="size-full">
              <Empty />
            </div>
          ))
        )
      }
    </Stream>
  );
}
