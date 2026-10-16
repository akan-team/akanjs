"use client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import type { ModalSurfaceProps } from "../Dialog/modalSurface";
import { Modal } from "../Modal";
import View from "./View";

interface ViewToolsProps {
  modelName: string;
  closeView: () => void;
}

// Mounted only by the open modal, so a list of per-row `ViewModal`s publishes the close verb once.
const ViewTools = ({ modelName, closeView }: ViewToolsProps) => {
  st.tool(`closeViewOf${capitalize(modelName)}`)
    .desc(`Close the ${modelName} detail view.`)
    .exec(closeView);
  return null;
};

interface ViewModalProps extends ModalSurfaceProps {
  id: string;
  modal?: string;
  modalClassName?: string;
  viewClassName?: string;
  slice: SliceMeta;
  renderTitle?: (model: any) => ReactNode | string;
  renderAction?: (model: any) => ReactNode;
  renderView: (model: any) => ReactNode | null;
}
export default function ViewModal({
  id,
  modal,
  modalClassName,
  presentation,
  placement,
  viewClassName,
  slice,
  renderTitle,
  renderAction,
  renderView,
}: ViewModalProps) {
  const storeUse = st.use as unknown as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => void };
  const { refName } = slice;
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
    if (!model || modelLoading || !renderTitle) return null;
    const render = renderTitle(model);
    if (typeof render === "string") return <h2 className="flex items-center text-2xl">{render}</h2>;
    else return render;
  };
  const Action = () => {
    if (!model || modelLoading || !renderAction) return null;
    const render = renderAction(model);
    return render;
  };

  const closeView = () => {
    storeDo[names.resetModel]();
  };
  return (
    <>
      {isModalOpen ? <ViewTools modelName={modelName} closeView={closeView} /> : null}
      <Modal
        open={isModalOpen}
        onCancel={closeView}
        className={modalClassName}
        presentation={presentation}
        placement={placement}
        title={<Title />}
        action={<Action />}
      >
        <View className={viewClassName} model={model} modelLoading={modelLoading} render={renderView} />
      </Modal>
    </>
  );
}
