"use client";
import { usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";
import { AiOutlineEdit, AiOutlineSave } from "react-icons/ai";
import { BiDotsVertical, BiTrash } from "react-icons/bi";

import { agentAttrs } from "../agentAttrs";
import { buttonRecipe } from "../Button";
import { Dropdown } from "../Dropdown";
import { Modal } from "../Modal";
import Remove from "./Remove";
import View from "./View";

/**
 * Closing is the one verb both faces of this modal share, and exactly one face is mounted while it is open —
 * so declaring it from whichever face is up publishes it once, and withdraws it when the modal closes.
 */
const useCloseViewTool = (modelName: string, closeView: () => void) =>
  st
    .tool(`closeViewOf${capitalize(modelName)}`)
    .desc(`Close the open ${modelName} modal.`)
    .exec(closeView);

interface ActionProps {
  modelName: string;
  label: string;
  onAct: () => void;
  closeView: () => void;
}

const EditAction = ({ modelName, label, onAct, closeView }: ActionProps) => {
  useCloseViewTool(modelName, closeView);
  const editModel = st
    .tool(`edit${capitalize(modelName)}`)
    .desc(`Turn the open ${modelName} from its detail view into the edit form.`)
    .exec(onAct);
  return (
    <button className={buttonRecipe({ variant: "primary" }, "w-full")} onClick={editModel} {...agentAttrs(editModel)}>
      <AiOutlineEdit /> {label}
    </button>
  );
};

const SaveAction = ({ modelName, label, onAct, closeView }: ActionProps) => {
  useCloseViewTool(modelName, closeView);
  const submitModel = st
    .tool(`submit${capitalize(modelName)}`)
    .desc(`Save the ${modelName} the open form holds.`)
    .exec(onAct);
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, "w-full")}
      onClick={submitModel}
      {...agentAttrs(submitModel)}
    >
      <AiOutlineSave /> {label}
    </button>
  );
};

interface ViewEditModalProps {
  modalClassName?: string;
  viewClassName?: string;
  slice: SliceMeta;
  renderTitle?: (model: any) => ReactNode | string;
  renderView: (model: any) => ReactNode | null;
  renderTemplate: () => ReactNode | null;
}
export default function ViewEditModal({
  modalClassName,
  viewClassName,
  slice,
  renderTitle,
  renderView,
  renderTemplate,
}: ViewEditModalProps) {
  const { l } = usePage();
  const storeUse = st.use as unknown as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => void };
  const storeSel = st.sel as unknown as <Ret, Val>(selector: (state: { [key: string]: Val }) => Ret) => Ret;
  const { refName, sliceName } = slice;
  const [modelName, ModelName] = [refName, capitalize(refName)];
  const names = {
    model: modelName,
    Model: ModelName,
    viewModel: `view${ModelName}`,
    modelLoading: `${modelName}Loading`,
    modelModal: `${modelName}Modal`,
    resetModel: `reset${ModelName}`,
    editModel: `edit${ModelName}`,
    submitModel: `submit${ModelName}`,
    modelForm: `${modelName}Form`,
    modelFormLoading: `${modelName}FormLoading`,
  };
  const model = storeUse[names.model]() as { id: string; [key: string]: any } | null;
  const modelModal = storeUse[names.modelModal]() as string | null;
  const modelLoading = storeUse[names.modelLoading]() as string | boolean;
  const modelFormLoading = storeUse[names.modelFormLoading]() as string | boolean;
  const modelFormId = storeSel<string, { id: string }>((state) => state[names.modelForm].id);
  const isModalOpen = modelModal === "view" || (modelModal === "edit" && (!!modelFormLoading || !!modelFormId));
  const Title = () => {
    if (!model || modelLoading || !renderTitle) return <></>;
    const render = renderTitle(model);
    if (typeof render === "string")
      return <h2 className="flex items-center text-sm md:text-base lg:text-lg xl:text-2xl">{render}</h2>;
    else return render;
  };
  const Template = renderTemplate;
  const closeView = () => {
    storeDo[names.resetModel]();
  };

  return (
    <Modal
      open={isModalOpen}
      onCancel={closeView}
      className={modalClassName}
      title={
        <div className="flex w-full items-center justify-between">
          <Title />
          <Dropdown
            buttonClassName="m-1 size-10 px-0"
            value={<BiDotsVertical />}
            content={
              model ? (
                <li>
                  <Remove
                    className="flex items-center gap-2 text-destructive"
                    slice={slice}
                    modelId={model.id}
                    modal={null}
                  >
                    <BiTrash /> {l("base.remove")}
                  </Remove>
                </li>
              ) : null
            }
          />
        </div>
      }
      action={
        modelModal === "view" ? (
          <EditAction
            modelName={modelName}
            label={l("base.edit")}
            closeView={closeView}
            onAct={() => {
              if (model) storeDo[names.editModel](model.id);
            }}
          />
        ) : (
          <SaveAction
            modelName={modelName}
            label={l("base.save")}
            closeView={closeView}
            onAct={() => {
              storeDo[names.submitModel]({ sliceName, modal: "view" });
            }}
          />
        )
      }
    >
      {modelModal === "view" ? (
        <View className={viewClassName} model={model} modelLoading={modelLoading} render={renderView} />
      ) : modelModal === "edit" ? (
        <Template />
      ) : null}
    </Modal>
  );
}
