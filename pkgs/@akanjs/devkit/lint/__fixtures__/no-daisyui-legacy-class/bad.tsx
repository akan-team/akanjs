export const CompoundButton = () => <button className="btn-primary" />; // @warn
export const CompoundBadge = () => <span className="badge-success" />; // @warn
export const CompoundStatValue = () => <div className="md:stat-value" />; // @warn
export const BothHalvesReportTheColourSlot = () => <div className="btn-primary bg-base-100" />; // @flag
export const DroppedBaseSurface = () => <div className="bg-base-100" />; // @flag
export const DroppedBaseContentWithOpacity = () => <div className="text-base-content/70" />; // @flag
export const DroppedBaseOnABorderSide = () => <div className="border-t-base-300" />; // @flag
export const DroppedPrimaryContent = () => <div className="text-primary-content" />; // @flag
export const DroppedErrorSlot = () => <div className="bg-error/5" />; // @flag
