"use client";
import { clsx } from "akanjs/client";
import { ConstantRegistry } from "akanjs/constant";
import type { ClientView, ServerView } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useFetch } from "akanjs/webkit";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { Empty } from "../Empty";
import { Loading } from "../Loading";

interface DefaultProps<T extends string, M> {
  /** Additional classes for the default wrapping div. */
  className?: string;
  /** Render the model directly without the default wrapper div. */
  noDiv?: boolean;
  /** Custom fallback shown while the client view is loading. */
  loading?: ReactNode;
  /** Render callback invoked with the loaded full model. */
  renderView: (model: M) => ReactNode;
}

interface ViewProps<T extends string, Full extends { id: string }> extends DefaultProps<T, Full> {
  /** Client view promise returned by Akan fetch helpers. */
  view: ClientView<T, Full>;
}

interface RenderProps<T extends string, Full extends { id: string }> extends DefaultProps<T, Full> {
  /** Resolved server view payload used to hydrate the client store. */
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

  const renderModel = loadedId.current === modelObj.id ? model : modelInit;

  return noDiv && renderModel ? (
    <>{renderView(renderModel)}</>
  ) : renderModel ? (
    <div className={clsx("w-full", className)}>{renderView(renderModel)}</div>
  ) : null;
}

export default function View<T extends string, Full extends { id: string }>({
  className,
  view,
  noDiv,
  loading,
  renderView,
}: ViewProps<T, Full>) {
  //get Props
  const props: ViewProps<T, Full> = {
    className,
    view,
    noDiv,
    loading,
    renderView,
  };
  const { fulfilled, value: promiseView } = useFetch(view);

  return fulfilled ? (
    promiseView ? (
      <Render {...props} view={promiseView} />
    ) : (
      <div className="size-full">
        <Empty />
      </div>
    )
  ) : loading ? (
    <>{loading}</>
  ) : (
    <div className="size-full">
      <Loading.Skeleton active />
    </div>
  );
}
