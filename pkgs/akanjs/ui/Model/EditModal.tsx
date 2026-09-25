"use client";
import { clsx, isRscNavigationFromCache, router, usePage } from "akanjs/client";
import { capitalize, deepObjectify, lowerlize } from "akanjs/common";
import { ConstantRegistry, immerify } from "akanjs/constant";
import type { ClientEdit, ServerEdit, SliceMeta } from "akanjs/fetch";
import { type CreateOption, type Submit, st } from "akanjs/store";
import { useDebounce } from "akanjs/webkit";
import { type ReactNode, type Usable, use, useCallback, useEffect, useMemo } from "react";
import { AiOutlinePlus, AiOutlineSave } from "react-icons/ai";

import { Button } from "../Button";
import { Modal } from "../Modal";

const EDIT_PAYLOAD_MAX_AGE_MS = 60_000;

interface EditModelProps<Full> {
  /** Rendering mode for the edit shell. */
  type?: "modal" | "form" | "empty";
  /** Slice metadata generated for the model store/fetch contract. */
  slice: SliceMeta;
  /** Additional classes for the wrapper. */
  className?: string;
  /** Re-check submit eligibility when form state changes. */
  checkSubmit?: boolean;
  /** Client edit promise or partial form seed. */
  edit?: ClientEdit<string, Full> | Partial<Full>;
  /** Store modal name that should activate this editor. */
  modal?: string;
  children: any;
  /** Custom loading overlay wrapper, or false to disable the default overlay. */
  loadingWrapper?: boolean | ((props: { children?: any; className?: string }) => ReactNode);
}
const EditModel = <Full,>({
  type = "modal",
  slice,
  className,
  checkSubmit = true,
  edit,
  modal,
  children,
  loadingWrapper,
}: EditModelProps<Full>) => {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => void };
  const { refName, sliceName } = slice;
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
    [],
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
      ? ({ children, className }: { children?: any; className?: string }) => children as ReactNode
      : typeof loadingWrapper === "function"
        ? loadingWrapper
        : ({ children, className }: { children?: any; className?: string }) => {
            const modelFormLoading = storeUse[names.modelFormLoading]();
            return (
              <div className={clsx("", className)}>
                {children}
                {modelFormLoading ? <div className="absolute inset-0 animate-pulse bg-base-100/50" /> : null}
              </div>
            );
          };
  }, []);

  // if (type === "empty") return null;
  return <LoadingWrapper className={clsx("w-full", className)}>{children}</LoadingWrapper>;
};

interface EditModalProps<Full extends { id: string }> extends EditModelProps<Full> {
  /** Model id used to scope edit modal state. */
  id?: string;
  /** Disable modal trigger and submit behavior. */
  disabled?: boolean;
  checkSubmit?: boolean;
  /** Additional classes for the modal window. */
  modalClassName?: string;
  /** Modal title or title renderer receiving the current model. */
  renderTitle?: ((model: Full) => string | ReactNode) | string;
  /** Submit button label. */
  submitText?: string;
  /** Additional classes for the submit button. */
  submitClassName?: string;
  /** Store submit options passed to the generated submit action. */
  submitOption?: CreateOption<Full>;
  /** Custom submit renderer, or false to hide the default submit button. */
  renderSubmit?: boolean | ((arg: any) => ReactNode);
  /** Action name or callback invoked after submit. */
  onSubmit?: string | ((model: Full) => void);
  /** Action name or callback invoked on cancel. */
  onCancel?: string | ((form?: any) => any);
}

export default function EditModal<Full extends { id: string }>({
  type = "modal",
  slice,
  id,
  className,
  disabled,
  checkSubmit = true,
  modalClassName,
  edit,
  modal,
  renderTitle,
  children,
  submitText,
  submitClassName,
  submitOption,
  renderSubmit,
  loadingWrapper,
  onSubmit,
  onCancel,
}: EditModalProps<Full>) {
  const { l } = usePage();
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeSel = st.sel as <Ret>(selector: (state: unknown) => Ret) => Ret;
  const modelEdit = ((edit as Promise<any> | { then?: any } | undefined)?.then
    ? use(edit as Usable<any>)
    : edit) as unknown as ServerEdit<string, Full> | Full | undefined;
  const { refName, sliceName } = slice;
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
      editModel: `edit${ModelName}`,
      newModel: `new${ModelName}`,
      crystalizeModel: `crystalize${ModelName}`,
      modelObj: `${modelName}Obj`,
    }),
    [],
  );
  const modelModal = storeUse[names.modelModal]() as string | null;
  const modelFormId = storeSel<string | null>(
    (state: unknown) => (state as { [key: string]: { id: string | null } })[names.modelForm].id,
  );
  const modelFormLoading = storeUse[names.modelFormLoading]() as string | boolean;
  const modalId = id ?? ((modelEdit as any)?.[names.modelObj] as Full | undefined)?.id ?? undefined;
  const isModalOpen =
    modelModal === (modal ?? "edit") &&
    (modelFormLoading === false || modelFormLoading === modalId) &&
    ((!modelFormId && !modalId) || modalId === modelFormId);
  const isEditPayloadStale = useCallback((viewAt?: Date | null) => {
    if (isRscNavigationFromCache()) return true;
    return (
      viewAt instanceof Date &&
      !Number.isNaN(viewAt.getTime()) &&
      Date.now() - viewAt.getTime() > EDIT_PAYLOAD_MAX_AGE_MS
    );
  }, []);
  useEffect(() => {
    if (!modelEdit) return;
    const refName = (modelEdit as ServerEdit<string, Full>).refName;
    const editType: "edit" | "new" = refName && (modelEdit as any)[names.modelObj] ? "edit" : "new";
    const cnst = ConstantRegistry.getDatabase(modelName);
    const modelRef = cnst.full;
    if (editType === "edit") {
      const modelObj = (modelEdit as any)[names.modelObj] as Full;
      const viewAt = (modelEdit as any)[names.modelViewAt] as Date;
      const crystal = new modelRef().set(modelObj) as unknown as Full;
      st.set({
        [names.model]: crystal,
        [names.modelLoading]: false,
        [names.modelForm]: immerify(modelRef, crystal),
        [names.modelFormLoading]: false,
        [names.modelModal]: modal ?? "edit",
        [names.modelViewAt]: viewAt,
      });
      if (isEditPayloadStale(viewAt))
        void storeDo[names.editModel](modelObj.id, { modal }).catch(() => {
          st.set({ [names.modelFormLoading]: false });
        });
    } else {
      // new
      const crystal = new modelRef().set(modelEdit as Full) as unknown as Full;
      void storeDo[names.newModel](crystal, { modal, setDefault: true, sliceName });
    }
    return () => {
      // st.do[names.resetModel]();
    };
  }, [modelEdit, isEditPayloadStale]);

  const handleCancel = useCallback(() => {
    const modelForm = (st.get() as any)[names.modelForm] as Full;
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
    return modelFormLoading
      ? null
      : renderTitle
        ? typeof renderTitle === "string"
          ? `${l(`${modelName}.modelName` as "base.success")}${renderTitle === "default" ? "" : ` - ${(modelForm as any)[renderTitle] ?? l("base.new")}`}`
          : renderTitle(modelForm)
        : null;
  };
  const Submit: () => ReactNode = useMemo(
    () =>
      renderSubmit === false
        ? () => <></>
        : typeof renderSubmit === "function"
          ? () => renderSubmit(storeUse[names.modelForm]() as Full)
          : () => {
              const modelSubmit = storeUse[names.modelSubmit]() as Submit;
              const handleSubmit = async ({ onError }: { onError?: (e: string) => void } = {}) => {
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
                    if (onSubmit === "back") router.back();
                    else if (onSubmit === "reset") void storeDo[names.resetModel]();
                    else if (typeof onSubmit === "string")
                      router.replace(onSubmit.replace(new RegExp(`\\[${names.model}Id\\]`, "g"), model.id));
                  },
                });
              };
              return (
                <Button
                  className={clsx("btn btn-primary mt-4 w-full gap-2 rounded-2xl", submitClassName)}
                  disabled={modelSubmit.disabled || !!disabled}
                  onClick={async (e, { onError }) => {
                    await handleSubmit({ onError });
                  }}
                  onSuccess={() => {
                    //
                  }}
                >
                  {modelFormId ? <AiOutlineSave /> : <AiOutlinePlus />}
                  {submitText ??
                    l(modelFormId ? "base.updateModel" : "base.createModel", {
                      model: l._(`${names.model}.modelName`),
                    })}
                </Button>
              );
            },
    [disabled, modelFormId],
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
            slice={slice}
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
        slice={slice}
        className={className}
        checkSubmit={checkSubmit}
        edit={edit}
        modal={modal}
        loadingWrapper={loadingWrapper}
      >
        <Title />
        {children}
        {type === "form" ? <Submit /> : null}
      </EditModel>
    );
}
