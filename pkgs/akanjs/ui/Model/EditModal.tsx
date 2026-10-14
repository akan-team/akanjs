"use client";
import { cn, isRscNavigationFromCache, router, usePage } from "akanjs/client";
import { capitalize, type DynamicRecord, deepObjectify, lowerlize } from "akanjs/common";
import { ConstantRegistry, immerify } from "akanjs/constant";
import type { ClientEdit, ServerEdit, SliceMeta } from "akanjs/fetch";
import { type CreateOption, type Submit, st } from "akanjs/store";
import { useDebounce } from "akanjs/webkit";
import { type ReactNode, type Usable, use, useCallback, useEffect, useMemo, useRef } from "react";
import { AiOutlinePlus, AiOutlineSave } from "react-icons/ai";

import { agentAttrs } from "../agentAttrs";
import { Button } from "../Button";
import type { ModalSurfaceProps } from "../Dialog/modalSurface";
import { Modal } from "../Modal";
import DraftBar from "./DraftBar";
import { type DraftProp, editDraftScope, newDraftScope } from "./draftScope";
import { NewFormOrigin } from "./newFormOrigin";

const EDIT_PAYLOAD_MAX_AGE_MS = 60_000;

// Editors that unmounted while open, waiting one microtask for a remount of the same editor to claim
// the modal back before the store gets reset. Keyed so a re-keyed list row cancels its own predecessor.
const pendingModalResets = new Map<string, { cancel: () => void }>();
const modalResetKey = (modelName: string, modalName: string, modalId?: string) =>
  `${modelName}|${modalName}|${modalId ?? ""}`;

interface EditModelProps<Full> {
  type?: "modal" | "form" | "empty";
  slice: SliceMeta;
  className?: string;
  draftBarClassName?: string;
  /** Re-checks submit eligibility when the form changes. */
  checkSubmit?: boolean;
  edit?: ClientEdit<string, Full> | Partial<Full>;
  /** The store modal name that opens this editor. */
  modal?: string;
  children: ReactNode;
  /** `false` disables the default loading overlay. */
  loadingWrapper?: boolean | ((props: { children?: any; className?: string }) => ReactNode);
  /** Draft recovery for this form. `false` turns it off; a string names the scope explicitly. */
  draft?: DraftProp;
}

interface OpenEditorProps<Full> extends EditModelProps<Full> {
  /** The shell's own dismissal. Absent when the shell draws none, and then nothing is published. */
  cancelEdit?: () => void;
}

const EditModel = <Full,>({
  type = "modal",
  slice,
  className,
  draftBarClassName,
  checkSubmit = true,
  edit,
  modal,
  children,
  loadingWrapper,
  cancelEdit,
}: OpenEditorProps<Full>) => {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => void };
  const { refName } = slice;
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

  // This component mounts only while the editor is open, which is what keeps one registration on a list that
  // renders an editor per row: at most one of them is ever open.
  st.tool(cancelEdit ? `cancelEditOf${ModelName}` : null)
    .desc(`Close the ${modelName} form without saving.`)
    .exec(() => cancelEdit?.());

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
              <div className={cn("", className)}>
                {children}
                {modelFormLoading ? <div className="absolute inset-0 animate-pulse bg-background/50" /> : null}
              </div>
            );
          };
  }, []);

  return (
    <LoadingWrapper className={cn("w-full", className)}>
      <DraftBar className={draftBarClassName} slice={slice} />
      {children}
    </LoadingWrapper>
  );
};

interface EditModalProps<Full extends { id: string }> extends EditModelProps<Full>, ModalSurfaceProps {
  id?: string;
  disabled?: boolean;
  checkSubmit?: boolean;
  modalClassName?: string;
  renderTitle?: ((model: Full) => string | ReactNode) | string;
  submitText?: ReactNode;
  submitClassName?: string;
  submitOption?: CreateOption<Full>;
  /** `false` hides the default submit button. */
  renderSubmit?: boolean | ((arg: any) => ReactNode);
  /** A callback, `"back"`, `"reset"`, or a path to replace to (`[<model>Id]` is filled in). */
  onSubmit?: string | ((model: Full) => void);
  /** A callback, `"back"`, `"reset"`, or a path to replace to. */
  onCancel?: string | ((form?: any) => any);
}

export default function EditModal<Full extends { id: string }>({
  type = "modal",
  slice,
  id,
  className,
  draftBarClassName,
  disabled,
  checkSubmit = true,
  modalClassName,
  presentation,
  placement,
  edit,
  modal,
  renderTitle,
  children,
  submitText,
  submitClassName,
  submitOption,
  renderSubmit,
  loadingWrapper,
  draft,
  onSubmit,
  onCancel,
}: EditModalProps<Full>) {
  const { l, path } = usePage();
  const storeUse = st.use as { [key: string]: (option?: { agent?: boolean }) => unknown };
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
      loadModelDraft: `load${ModelName}FormDraft`,
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
  const modalId = id ?? ((modelEdit as DynamicRecord)?.[names.modelObj] as Full | undefined)?.id ?? undefined;
  const opensNewForm = NewFormOrigin.useEditor(modelName, sliceName, modal ?? "edit", !modalId);
  const isModalOpen =
    modelModal === (modal ?? "edit") &&
    (modelFormLoading === false || modelFormLoading === modalId) &&
    ((!modelFormId && !modalId && opensNewForm) || (!!modalId && modalId === modelFormId));
  useEffect(() => {
    if (!modelModal) NewFormOrigin.clear(modelName);
  }, [modelModal]);
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
    const editType: "edit" | "new" = refName && (modelEdit as DynamicRecord)[names.modelObj] ? "edit" : "new";
    const cnst = ConstantRegistry.getDatabase(modelName);
    const modelRef = cnst.full;
    if (editType === "edit") {
      const modelObj = (modelEdit as DynamicRecord)[names.modelObj] as Full;
      const viewAt = (modelEdit as DynamicRecord)[names.modelViewAt] as Date;
      const crystal = new modelRef().set(modelObj) as unknown as Full;
      const draftScope = editDraftScope(draft, modelObj.id);
      st.set({
        [names.model]: crystal,
        [names.modelLoading]: false,
        [names.modelForm]: immerify(modelRef, crystal),
        [names.modelFormLoading]: false,
        [names.modelModal]: modal ?? "edit",
        [names.modelViewAt]: viewAt,
      });
      if (isEditPayloadStale(viewAt))
        void storeDo[names.editModel](modelObj.id, { modal, draftScope }).catch(() => {
          st.set({ [names.modelFormLoading]: false });
        });
      // A fresh payload skips `edit<Model>`, so the draft load it would have ended with happens here.
      else void storeDo[names.loadModelDraft](draftScope);
    } else {
      const crystal = new modelRef().set(modelEdit as Full) as unknown as Full;
      const draftScope = newDraftScope(draft, {
        seed: modelEdit as object,
        modal: modal ?? "edit",
        sliceName,
        routePath: path,
      });
      void storeDo[names.newModel](crystal, { modal, setDefault: true, sliceName, draftScope });
    }
  }, [modelEdit, isEditPayloadStale]);

  const ownershipRef = useRef({ wasOpen: false, modalName: modal ?? "edit", modalId });
  useEffect(() => {
    ownershipRef.current = {
      wasOpen: ownershipRef.current.wasOpen || isModalOpen,
      modalName: modal ?? "edit",
      modalId,
    };
  }, [isModalOpen, modal, modalId]);
  useEffect(() => {
    pendingModalResets.get(modalResetKey(modelName, modal ?? "edit", modalId))?.cancel();
    return () => {
      // Openness lives in the store, so an editor torn down while open would leave `<model>Modal` set and reopen on
      // the next mount. Reset only what this editor owns, after a same-commit remount had its chance to claim it.
      const { wasOpen, modalName, modalId } = ownershipRef.current;
      if (!wasOpen) return;
      const key = modalResetKey(modelName, modalName, modalId);
      let cancelled = false;
      pendingModalResets.set(key, {
        cancel: () => {
          cancelled = true;
        },
      });
      queueMicrotask(() => {
        pendingModalResets.delete(key);
        if (cancelled) return;
        const state = st.get() as unknown as { [key: string]: unknown };
        if (state[names.modelModal] !== modalName) return;
        const formId = (state[names.modelForm] as { id: string | null } | undefined)?.id ?? null;
        if (formId !== (modalId ?? null)) return;
        void storeDo[names.setModelModal](null);
      });
    };
  }, []);

  const handleCancel = useCallback(() => {
    const modelForm = (st.get() as DynamicRecord)[names.modelForm] as Full;
    const form = deepObjectify(modelForm);
    void storeDo[names.setModelModal](null);
    if (typeof onCancel === "function") onCancel(form);
    else if (onCancel === "back") router.back();
    else if (onCancel === "reset") void storeDo[names.resetModel]();
    else if (typeof onCancel === "string") router.replace(onCancel);
  }, []);

  const Title: () => ReactNode = () => {
    const modelFormLoading = storeUse[names.modelFormLoading]() as string | boolean;
    // `fill<Model>Form` belongs to the editor body below, which subscribes the same key — reading it here to
    // label the modal would register that tool a second time.
    const modelForm = storeUse[names.modelForm]({ agent: false }) as Full;
    return modelFormLoading
      ? null
      : renderTitle
        ? typeof renderTitle === "string"
          ? `${l(`${modelName}.modelName` as "base.success")}${renderTitle === "default" ? "" : ` - ${(modelForm as DynamicRecord)[renderTitle] ?? l("base.new")}`}`
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
              const submitModel = st
                .tool(names.submitModel, {
                  guard: () =>
                    modelSubmit.disabled || disabled ? `The ${names.model} form is not ready to submit.` : true,
                })
                .desc(`Save the ${names.model} the open form holds.`)
                .exec(() => handleSubmit());
              return (
                <Button
                  {...agentAttrs(submitModel)}
                  className={cn("mt-4 w-full gap-2", submitClassName)}
                  disabled={modelSubmit.disabled || !!disabled}
                  onClick={async (e, { onError }) => {
                    await handleSubmit({ onError });
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
  const editProps = { type, slice, className, draftBarClassName, checkSubmit, edit, modal, loadingWrapper };
  if (type === "modal")
    return (
      <Modal
        open={isModalOpen}
        onCancel={() => {
          handleCancel();
        }}
        className={modalClassName}
        presentation={presentation}
        placement={placement}
        title={<Title />}
        action={<Submit />}
      >
        {isModalOpen ? (
          <EditModel {...editProps} cancelEdit={handleCancel}>
            {children}
          </EditModel>
        ) : null}
      </Modal>
    );
  else if (isModalOpen)
    return (
      <EditModel {...editProps}>
        <Title />
        {children}
        {type === "form" ? <Submit /> : null}
      </EditModel>
    );
}
