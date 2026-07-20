/** Marks the draggable handle so the plugin's `isOnMenu` hit-test can find it. */
export const DRAGGABLE_MENU_CLASS = "akan-draggable-block-menu";

export const isOnMenu = (element: HTMLElement): boolean => !!element.closest(`.${DRAGGABLE_MENU_CLASS}`);
