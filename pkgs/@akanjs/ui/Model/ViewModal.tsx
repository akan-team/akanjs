"use client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import { ReactNode } from "react";

import { Modal } from "../Modal";
import View from "./View";

interface ViewModalProps {
  id: string;
  modal?: string;
  modalClassName?: string;
  viewClassName?: string;
  sliceName: string;
  renderTitle?: (model: any) => ReactNode | string;
  renderAction?: (model: any) => ReactNode;
  renderView: (model: any) => ReactNode | null;
}
export default function ViewModal({
  id,
  modal,
  modalClassName,
  viewClassName,
  sliceName,
  renderTitle,
  renderAction,
  renderView,
}: ViewModalProps) {
  const storeUse = st.use as unknown as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => void };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = [refName, capitalize(refName)];
  const names = {
    model: modelName,
    Model: ModelName,
    viewModel: `view${ModelName}`,
    modelLoading: `${modelName}Loading`,
    modelModal: `${modelName}Modal`,
    resetModel: `reset${ModelName}`,
  };
  const model = storeUse[names.model]() as { id: string; [key: string]: any } | null;
  const modelModal = storeUse[names.modelModal]() as string | null;
  const modelLoading = storeUse[names.modelLoading]() as string | boolean;
  const isModalOpen = modelModal === (modal ?? "view") && (modelLoading === id || model?.id === id);
  const Title = () => {
    if (!model || modelLoading || !renderTitle) return <></>;
    const render = renderTitle(model);
    if (typeof render === "string") return <h2 className="flex items-center text-2xl">{render}</h2>;
    else return render;
  };
  const Action = () => {
    if (!model || modelLoading || !renderAction) return <></>;
    const render = renderAction(model);
    return render;
  };

  return (
    <Modal
      open={isModalOpen}
      onCancel={() => {
        storeDo[names.resetModel]();
      }}
      className={modalClassName}
      title={<Title />}
      action={<Action />}
    >
      <View className={viewClassName} model={model} modelLoading={modelLoading} render={renderView} />
    </Modal>
  );
}
