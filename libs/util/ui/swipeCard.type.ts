export type Direction = "left" | "right" | "up" | "down" | "none";
export type SwipeHandler = (direction: Direction) => void;
export type CardLeftScreenHandler = (direction: Direction) => void;
export type SwipeRequirementFulfillUpdate = (direction: Direction) => void;
export type SwipeRequirementUnfulfillUpdate = () => void;

export interface API {
  swipe(dir?: Direction): Promise<void>;
  restoreCard(): Promise<void>;
}
