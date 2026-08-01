/**
 * Pure actor display geometry shared by the Pixi layer and Node-based tests.
 * Keeping these constants browser-free lets geometry tests run without a DOM.
 */
export const PLAYER_DISPLAY_HEIGHT = 60;
export const GUEST_DISPLAY_HEIGHT = PLAYER_DISPLAY_HEIGHT;
export const SEATED_GUEST_DISPLAY_HEIGHT = PLAYER_DISPLAY_HEIGHT;

/**
 * Every authored actor pose uses the same 128×160 frame and runtime scale.
 * Seated bodies stay naturally shorter without enlarging their heads.
 */
export const PLAYER_CONTENT_HEIGHT_PX = 160;
export const GUEST_WALK_CONTENT_HEIGHT_PX = 160;
export const GUEST_SIT_CONTENT_HEIGHT_PX = 160;
