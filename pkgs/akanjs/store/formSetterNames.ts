import { capitalize, lowerlize } from "akanjs/common";

/**
 * The keys `makeFormSetter` publishes for one field of one model.
 *
 * Computed forward from the field metadata rather than parsed back out of a key: `set(.+)On(.+)` has more than one
 * reading whenever a field or a model name contains `On`, so any reader that has only the name must build the same
 * names here instead of taking one apart.
 */
export const formSetterNames = (className: string, key: string) => {
  const classKeyName = capitalize(key);
  return {
    field: lowerlize(key),
    Field: classKeyName,
    setFieldOnModel: `set${classKeyName}On${className}`,
    addFieldOnModel: `add${classKeyName}On${className}`,
    subFieldOnModel: `sub${classKeyName}On${className}`,
    addOrSubFieldOnModel: `addOrSub${classKeyName}On${className}`,
    /**
     * The agent tool a drag-sortable list publishes. No store action answers to it: reordering *is* the whole-array
     * write the drag already performs, so the tool splices the live rows and hands them to the same setter.
     */
    moveFieldOnModel: `move${classKeyName}On${className}`,
    uploadFieldOnModel: `upload${classKeyName}On${className}`,
    /**
     * The optional hook a store declares to run after this field is written.
     *
     * It carries no model suffix and a leading `_`, so it can never collide with a generated action name — which is
     * the whole point: every generated action lives in a mapped type, and a mapped type produces *properties*, so a
     * subclass method of the same name is a TS2425 error and there is no legal way to override one. A hook under a
     * name the base type does not declare is the only shape TypeScript permits.
     */
    postSetField: `_postSet${classKeyName}`,
  };
};
