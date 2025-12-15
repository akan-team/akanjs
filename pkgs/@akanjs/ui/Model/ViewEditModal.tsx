"use client";
import { usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import { ReactNode } from "react";
import { AiOutlineEdit, AiOutlineSave } from "react-icons/ai";
import { BiDotsVertical, BiTrash } from "react-icons/bi";

import { Modal } from "../Modal";
import Remove from "./Remove";
import View from "./View";

interface ViewEditModalProps {
  modalClassName?: string;
  viewClassName?: string;
  sliceName: string;
  renderTitle?: (model: any) => ReactNode | string;
  renderView: (model: any) => ReactNode | null;
  renderTemplate: () => ReactNode | null;
}
export default function ViewEditModal({
  modalClassName,
  viewClassName,
  sliceName,
  renderTitle,
  renderView,
  renderTemplate,
}: ViewEditModalProps) {
  const { l } = usePage();
  const storeUse = st.use as unknown as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => void };
  const storeSel = st.sel as unknown as <Ret, Val>(selector: (state: { [key: string]: Val }) => Ret) => Ret;
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
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

  return (
    <Modal
      open={isModalOpen}
      onCancel={() => {
        storeDo[names.resetModel]();
      }}
      className={modalClassName}
      title={
        <div className="flex w-full items-center justify-between">
          <Title />
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-square m-1">
              <BiDotsVertical />
            </label>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[1] p-2 shadow-sm">
              {model ? (
                <li>
                  <a>
                    <Remove
                      className="text-error flex items-center gap-2"
                      sliceName={sliceName}
                      modelId={model.id}
                      modal={null}
                    >
                      <BiTrash /> {l("base.remove")}
                    </Remove>
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      }
      action={
        modelModal === "view" ? (
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              if (model) storeDo[names.editModel](model.id);
            }}
          >
            <AiOutlineEdit /> {l("base.edit")}
          </button>
        ) : (
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              storeDo[names.submitModel]({ sliceName, modal: "view" });
            }}
          >
            <AiOutlineSave /> {l("base.save")}
          </button>
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
