"use client";
import { clsx, router, usePage } from "@akanjs/client";
import { capitalize, deepObjectify, lowerlize } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";
import { useDebounce } from "@akanjs/next";
import { ClientEdit, immerify, ServerEdit } from "@akanjs/signal";
import { CreateOption, type Submit } from "@akanjs/store";
import { st } from "@akanjs/store";
import { type ReactNode, type Usable, use, useCallback, useEffect, useMemo } from "react";
import { AiOutlinePlus, AiOutlineSave } from "react-icons/ai";

import { Button } from "../Button";
import { Modal } from "../Modal";

interface EditModelProps<Full> {
  type?: "modal" | "form" | "empty";
  sliceName: string;
  className?: string;
  checkSubmit?: boolean;
  edit?: ClientEdit<string, Full> | Partial<Full>;
  modal?: string;
  children: any;
  loadingWrapper?: boolean | ((props: { children?: any; className?: string }) => ReactNode);
}
const EditModel = <Full,>({
  type = "modal",
  sliceName,
  className,
  checkSubmit = true,
  edit,
  modal,
  children,
  loadingWrapper,
}: EditModelProps<Full>) => {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => void };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = useMemo(() => [lowerlize(refName), capitalize(refName)], []);
  const names = useMemo(
    () => ({
      model: modelName,
      Model: ModelName,
      modelForm: `${modelName}Form`,
      modelFormLoading: `${modelName}FormLoading`,
      modelModal: `${modelName}Modal`,
      checkModelSubmitable: `check${ModelName}Submitable`,
    }),
    []
  );
  const modelModal = storeUse[names.modelModal]() as string | null;
  const modelForm = storeUse[names.modelForm]() as { id: string | null; [key: string]: any };

  const checkSubmitable = useDebounce(() => {
    storeDo[names.checkModelSubmitable]();
  });

  useEffect(() => {
    if (checkSubmit) checkSubmitable();
  }, [modelModal, modelForm]);

  const LoadingWrapper = useMemo(() => {
    return loadingWrapper === false
      ? ({ children, className }) => children as ReactNode
      : typeof loadingWrapper === "function"
        ? loadingWrapper
        : ({ children, className }: { children?: any; className?: string }) => {
            const modelFormLoading = storeUse[names.modelFormLoading]();
            return (
              <div className={clsx("", className)}>
                {children}
                {modelFormLoading ? <div className="bg-base-100/50 absolute inset-0 animate-pulse" /> : null}
              </div>
            );
          };
  }, []);

  // if (type === "empty") return null;
  return <LoadingWrapper className={clsx("w-full", className)}>{children}</LoadingWrapper>;
};

interface EditModalProps<Full extends { id: string }> extends EditModelProps<Full> {
  id?: string;
  disabled?: boolean;
  checkSubmit?: boolean;
  modalClassName?: string;
  renderTitle?: ((model: Full) => string | ReactNode) | string;
  submitOption?: CreateOption<Full>;
  renderSubmit?: boolean | ((any) => ReactNode);
  onSubmit?: string | ((model: Full) => void);
  onCancel?: string | ((form?: any) => any);
}

export default function EditModal<Full extends { id: string }>({
  type = "modal",
  sliceName,
  id,
  className,
  disabled,
  checkSubmit = true,
  modalClassName,
  edit,
  modal,
  renderTitle,
  children,
  submitOption,
  renderSubmit,
  loadingWrapper,
  onSubmit,
  onCancel,
}: EditModalProps<Full>) {
  const { l } = usePage();
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeSel = st.sel as <Ret>(selector: (state: unknown) => Ret) => Ret;
  const modelEdit = ((edit as Promise<any> | { then?: any } | undefined)?.then
    ? use(edit as Usable<any>)
    : edit) as unknown as ServerEdit<string, Full> | Full | undefined;

  const [modelName, ModelName] = useMemo(() => [lowerlize(refName), capitalize(refName)], []);
  const names = useMemo(
    () => ({
      model: modelName,
      modelForm: `${modelName}Form`,
      modelFormLoading: `${modelName}FormLoading`,
      modelModal: `${modelName}Modal`,
      modelSubmit: `${modelName}Submit`,
      submitModel: `submit${ModelName}`,
      resetModel: `reset${ModelName}`,
      setModelModal: `set${ModelName}Modal`,
      modelLoading: `${modelName}Loading`,
      modelViewAt: `${modelName}ViewAt`,
      newModel: `new${ModelName}`,
      crystalizeModel: `crystalize${ModelName}`,
      modelObj: `${modelName}Obj`,
    }),
    []
  );
  const modelModal = storeUse[names.modelModal]() as string | null;
  const modelFormId = storeSel<string | null>(
    (state: { [key: string]: { id: string | null } }) => state[names.modelForm].id
  );
  const modelFormLoading = storeUse[names.modelFormLoading]() as string | boolean;
  const isModalOpen =
    modelModal === (modal ?? "edit") &&
    (modelFormLoading === false || modelFormLoading === id) &&
    ((!modelFormId && !id) || id === modelFormId);

  useEffect(() => {
    if (!modelEdit) return;
    const refName = (modelEdit as ServerEdit<string, Full>).refName;
    const editType: "edit" | "new" = refName && modelEdit[names.modelObj] ? "edit" : "new";
    const cnst = constantInfo.getDatabase(modelName);
    const crystalizeModel = cnst.crystalize as (model: Full) => Full;
    const modelRef = cnst.full;
    if (editType === "edit") {
      const crystal = crystalizeModel(modelEdit[names.modelObj] as Full);
      st.set({
        [names.model]: crystal,
        [names.modelLoading]: false,
        [names.modelForm]: immerify(modelRef, crystal),
        [names.modelFormLoading]: false,
        [names.modelModal]: modal ?? "edit",
        [names.modelViewAt]: modelEdit[names.modelViewAt] as Date,
      });
    } else {
      // new
      const crystal = crystalizeModel(modelEdit as Full);
      void storeDo[names.newModel](crystal, { modal, setDefault: true, sliceName });
    }
    return () => {
      // st.do[names.resetModel]();
    };
  }, [modelEdit]);

  const handleCancel = useCallback(() => {
    const modelForm = st.get()[names.modelForm] as Full;
    const form = deepObjectify({ ...modelForm });
    // await st.do[names.resetModel]();
    void storeDo[names.setModelModal](null);
    if (typeof onCancel === "function") onCancel(form);
    else if (onCancel === "back") router.back();
    else if (onCancel === "reset") void storeDo[names.resetModel]();
    else if (typeof onCancel === "string") router.replace(onCancel);
  }, []);

  const Title: () => ReactNode = () => {
    const modelFormLoading = storeUse[names.modelFormLoading]() as string | boolean;
    const modelForm = storeUse[names.modelForm]() as Full;
    return modelFormLoading ? (
      <></>
    ) : renderTitle ? (
      typeof renderTitle === "string" ? (
        `${l(`${modelName}.modelName` as "base.success")}${renderTitle === "default" ? "" : ` - ${modelForm[renderTitle] ?? l("base.new")}`}`
      ) : (
        <>{renderTitle(modelForm)}</>
      )
    ) : (
      <></>
    );
  };
  const Submit: () => ReactNode = useMemo(
    () =>
      renderSubmit === false
        ? () => <></>
        : typeof renderSubmit === "function"
          ? () => renderSubmit(storeUse[names.modelForm]() as Full)
          : () => {
              const modelSubmit = storeUse[names.modelSubmit]() as Submit;
              const handleSubmit = useCallback(async ({ onError }: { onError?: (e: string) => void } = {}) => {
                await storeDo[names.submitModel]({
                  ...submitOption,
                  sliceName,
                  onError: (e: string) => {
                    onError?.(e);
                    submitOption?.onError?.(e);
                  },
                  onSuccess: (model: Full) => {
                    if (typeof onSubmit === "function") onSubmit(model);
                    void submitOption?.onSuccess?.(model);
                  },
                });
                if (onSubmit === "back") router.back();
                else if (onSubmit === "reset") void storeDo[names.resetModel]();
                else if (typeof onSubmit === "string") router.replace(onSubmit);
              }, []);
              return (
                <Button
                  className="btn btn-primary w-full gap-2 rounded-2xl"
                  disabled={modelSubmit.disabled || !!disabled}
                  onClick={async (e, { onError }) => {
                    await handleSubmit({ onError });
                  }}
                  onSuccess={() => {
                    //
                  }}
                >
                  {modelFormId ? <AiOutlineSave /> : <AiOutlinePlus />}
                  {l(modelFormId ? "base.updateModel" : "base.createModel", {
                    model: l._(`${names.model}.modelName`),
                  })}
                </Button>
              );
            },
    [disabled, modelFormId]
  );
  if (type === "modal")
    return (
      <Modal
        open={isModalOpen}
        onCancel={() => {
          handleCancel();
        }}
        className={modalClassName}
        title={<Title />}
        action={<Submit />}
      >
        {isModalOpen ? (
          <EditModel
            type={type}
            sliceName={sliceName}
            className={className}
            checkSubmit={checkSubmit}
            edit={edit}
            modal={modal}
            loadingWrapper={loadingWrapper}
          >
            {children}
          </EditModel>
        ) : null}
      </Modal>
    );
  else if (isModalOpen)
    return (
      <EditModel
        type={type}
        sliceName={sliceName}
        className={className}
        checkSubmit={checkSubmit}
        edit={edit}
        modal={modal}
        loadingWrapper={loadingWrapper}
      >
        <Title />
        {children}
        {type === "form" ? (
          <div className="mt-4">
            <Submit />
          </div>
        ) : null}
      </EditModel>
    );
}
