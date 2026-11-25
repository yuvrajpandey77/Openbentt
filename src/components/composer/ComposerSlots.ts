import { createContext, useContext } from "react";

/**
 * The chat composer has exactly one owner: AppLayout. Pages that provide an
 * empty-state layout (currently ChatHome) register a DOM slot here so the
 * single composer instance can be placed inside their centred column.
 */
export type RegisterComposerSlot = (node: HTMLDivElement | null) => void;

export const EMPTY_COMPOSER_SLOT_TEST_ID = "composer-slot-empty";
export const DOCKED_COMPOSER_SLOT_TEST_ID = "composer-slot-docked";

export const ComposerSlotContext = createContext<RegisterComposerSlot | null>(null);

/** Registrar for the centre slot. Null when the page does not own an empty state. */
export const useRegisterEmptyComposerSlot = (): RegisterComposerSlot | null =>
  useContext(ComposerSlotContext);
