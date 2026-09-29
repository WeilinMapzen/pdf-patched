// Timeout delays (ms) to allow PDF viewer to complete rendering before activating placement mode
export const PLACEMENT_ACTIVATION_DELAY = 60; // Standard delay for signature changes
export const FILE_SWITCH_ACTIVATION_DELAY = 80; // Slightly longer delay when switching files

// Signature preview sizing
// Tuned for a 3.6 cm x 4.1 cm receipt stamp at 72 DPI (= 102pt x 116pt).
// rem-based base font size is typically 16px so:
//   102pt / 16 ~= 6.375 rem, 116pt / 16 ~= 7.25 rem
// RATIO is set to 1.0 so the rem caps always apply (otherwise large
// viewports would scale the stamp up beyond the intended physical size).
export const MAX_PREVIEW_WIDTH_RATIO = 1.0; // Cap at rem ceiling (container-independent)
export const MAX_PREVIEW_HEIGHT_RATIO = 1.0; // Cap at rem ceiling (container-independent)
export const MAX_PREVIEW_WIDTH_REM = 6.375; // 3.6 cm receipt stamp width
export const MAX_PREVIEW_HEIGHT_REM = 7.25; // 4.1 cm receipt stamp height
export const MIN_SIGNATURE_DIMENSION_REM = 0.75; // Min dimension for visibility
export const OVERLAY_EDGE_PADDING_REM = 0.25; // Padding from container edges

// Text signature padding (relative to font size)
export const HORIZONTAL_PADDING_RATIO = 0.8;
export const VERTICAL_PADDING_RATIO = 0.6;
