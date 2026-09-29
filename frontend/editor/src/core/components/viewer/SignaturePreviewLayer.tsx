import { memo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
import {
  Z_INDEX_SIGNATURE_OVERLAY,
  Z_INDEX_SIGNATURE_OVERLAY_DELETE,
  Z_INDEX_SIGNATURE_OVERLAY_HANDLE,
} from "@app/styles/zIndex";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";

const DEFAULT_COLOR = "rgb(0, 122, 204)";
// 4 corner handles (lock aspect ratio) + 4 edge handles (free resize).
// Edges never lock; corners always lock.
const RESIZE_HANDLES = [
  // Corners — lock aspect
  { position: "nw", cursor: "nw-resize", top: -4, left: -4, kind: "corner" },
  { position: "ne", cursor: "ne-resize", top: -4, right: -4, kind: "corner" },
  { position: "sw", cursor: "sw-resize", bottom: -4, left: -4, kind: "corner" },
  { position: "se", cursor: "se-resize", bottom: -4, right: -4, kind: "corner" },
  // Edges — free resize
  { position: "n", cursor: "n-resize", top: -4, left: "50%", kind: "edge" },
  { position: "s", cursor: "s-resize", bottom: -4, left: "50%", kind: "edge" },
  { position: "e", cursor: "e-resize", top: "50%", right: -4, kind: "edge" },
  { position: "w", cursor: "w-resize", top: "50%", left: -4, kind: "edge" },
] as const;

// Default stamp size tuned for a 3.6 cm x 4.1 cm receipt stamp at 72 DPI
// (= 102pt x 116pt). Stored as fractions of the page; users can resize
// afterwards via the corner/edge handles.
const DEFAULT_STAMP_WIDTH_PT = 102;  // 3.6 cm
const DEFAULT_STAMP_HEIGHT_PT = 116; // 4.1 cm

export interface SignaturePreviewLayerProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  /** All previews across all pages; this layer renders only those matching pageIndex. */
  previews: SignaturePreview[];
  /** If true, previews cannot be moved, resized, or deleted. */
  readOnly: boolean;
  /** When true (and not readOnly), clicking the page places a new preview. */
  placementMode: boolean;
  /** Base64 PNG used for placement / ghost preview. */
  placementData?: string;
  /** Signature type assigned to newly placed previews. */
  placementType?: "canvas" | "image" | "text";
  /** Emits the full updated preview array (across all pages) whenever it changes. */
  onChange: (previews: SignaturePreview[]) => void;
  /** Currently selected preview id (managed by the parent layer). */
  selectedId?: string | null;
  /** Notifies the parent when a preview is selected (used for deleteSelected/hasSelected). */
  onSelect?: (id: string | null) => void;
}

/** Per-page overlay for signature previews; supports click-to-place, drag, resize, and delete. Coordinates are FRACTIONS (0–1) of the page. */
export const SignaturePreviewLayer = memo(function SignaturePreviewLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  previews,
  readOnly,
  placementMode,
  placementData,
  placementType,
  onChange,
  selectedId,
  onSelect,
}: SignaturePreviewLayerProps) {
  const { t } = useTranslation();
  const { provides: interactionManager } = useInteractionManagerCapability();

  // Track if a drag operation just occurred to prevent click from firing.
  const isDraggingRef = useRef(false);

  // Track cursor position over this page for the ghost hover preview.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const pauseInteraction = () => interactionManager?.pause();
  const resumeInteraction = () => interactionManager?.resume();

  const pagePreviews = previews.filter(
    (preview) => preview.pageIndex === pageIndex,
  );

  const handlePlaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;
    if (readOnly || !placementMode || !placementData) return;

    const rect = e.currentTarget.getBoundingClientRect();
    // Store as fractions (0–1) of the rendered page so overlays remain correct
    // at any zoom level.
    const sigWidth = DEFAULT_STAMP_WIDTH_PT / pageWidth;
    const sigHeight = DEFAULT_STAMP_HEIGHT_PT / pageHeight;
    const rawX = (e.clientX - rect.left) / pageWidth;
    const rawY = (e.clientY - rect.top) / pageHeight;
    const x = Math.max(0, Math.min(rawX - sigWidth / 2, 1 - sigWidth));
    const y = Math.max(0, Math.min(rawY - sigHeight / 2, 1 - sigHeight));

    const newPreview: SignaturePreview = {
      id: `sig-preview-${Date.now()}-${Math.random()}`,
      pageIndex,
      x,
      y,
      width: sigWidth,
      height: sigHeight,
      signatureData: placementData,
      signatureType: placementType ?? "image",
    };
    onChange([...previews, newPreview]);
    onSelect?.(newPreview.id);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        cursor: !readOnly && placementMode ? "crosshair" : "default",
        // Let clicks fall through to the page except in placement mode, where we
        // need to capture click-to-place. Individual previews opt back in below.
        pointerEvents: !readOnly && placementMode ? "auto" : "none",
      }}
      onMouseMove={
        !readOnly && placementMode && placementData
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCursorPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }
          : undefined
      }
      onMouseLeave={() => setCursorPos(null)}
      onClick={!readOnly && placementMode ? handlePlaceClick : undefined}
    >
      {pagePreviews.map((preview) => {
        if (!preview.signatureData) return null;
        const color = preview.color ?? DEFAULT_COLOR;
        const colorOpacity = (opacity: number) =>
          color.startsWith("rgb(")
            ? color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`)
            : color;
        return (
          <Tooltip
            key={preview.id}
            label={preview.participantName ?? ""}
            position="top"
            withArrow
            disabled={!preview.participantName}
          >
            <div
              style={{
                position: "absolute",
                left: preview.x * pageWidth,
                top: preview.y * pageHeight,
                width: preview.width * pageWidth,
                height: preview.height * pageHeight,
                border: readOnly
                  ? `1px dashed ${colorOpacity(0.4)}`
                  : `2px solid ${color}`,
                boxShadow: readOnly ? "none" : `0 0 10px ${colorOpacity(0.5)}`,
                cursor: readOnly ? "default" : "move",
                zIndex: Z_INDEX_SIGNATURE_OVERLAY,
                backgroundColor: readOnly
                  ? "transparent"
                  : "rgba(255, 255, 255, 0.1)",
                pointerEvents: "auto",
              }}
            >
              {/* Delete button - only show when not read-only */}
              {!readOnly && (
                <ActionIcon
                  size="sm"
                  shape="circle"
                  variant="primary"
                  accent="danger"
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    zIndex: Z_INDEX_SIGNATURE_OVERLAY_DELETE,
                    pointerEvents: "auto",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    border: "2px solid white",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(previews.filter((p) => p.id !== preview.id));
                    if (selectedId === preview.id) onSelect?.(null);
                  }}
                  aria-label={t("viewer.signature.delete", "Delete signature")}
                >
                  <Icon name="x" size={"0.8rem"} />
                </ActionIcon>
              )}

              <div
                style={{
                  width: "100%",
                  height: "100%",
                  pointerEvents: readOnly ? "none" : "auto",
                }}
                onPointerDown={
                  readOnly
                    ? undefined
                    : (e) => {
                        if ((e.target as HTMLElement).dataset.resizeHandle)
                          return;
                        e.stopPropagation();
                        e.preventDefault();
                        onSelect?.(preview.id);
                        const el = e.currentTarget;
                        el.setPointerCapture(e.pointerId);
                        pauseInteraction();

                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startLeft = preview.x;
                        const startTop = preview.y;

                        const handlePointerMove = (moveEvent: PointerEvent) => {
                          isDraggingRef.current = true;
                          const deltaX =
                            (moveEvent.clientX - startX) / pageWidth;
                          const deltaY =
                            (moveEvent.clientY - startY) / pageHeight;
                          onChange(
                            previews.map((p) =>
                              p.id === preview.id
                                ? {
                                    ...p,
                                    x: startLeft + deltaX,
                                    y: startTop + deltaY,
                                  }
                                : p,
                            ),
                          );
                        };

                        const handlePointerUp = (upEvent: PointerEvent) => {
                          el.removeEventListener(
                            "pointermove",
                            handlePointerMove,
                          );
                          el.removeEventListener("pointerup", handlePointerUp);
                          el.releasePointerCapture(upEvent.pointerId);
                          resumeInteraction();
                          window.getSelection()?.removeAllRanges();
                          setTimeout(() => {
                            isDraggingRef.current = false;
                          }, 10);
                        };

                        el.addEventListener("pointermove", handlePointerMove);
                        el.addEventListener("pointerup", handlePointerUp);
                      }
                }
              >
                <img
                  src={preview.signatureData}
                  alt="Signature preview"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />

                {/* Resize handles */}
                {!readOnly &&
                  RESIZE_HANDLES.map((handle) => {
                    // Edge handles sit on the box midline; the relevant axis
                    // needs -50% so the 8px square is centred on top/left.
                    const isEdge = handle.kind === "edge";
                    return (
                      <div
                        key={handle.position}
                        data-resize-handle="true"
                        style={{
                          position: "absolute",
                          width: 8,
                          height: 8,
                          backgroundColor: color,
                          border: "1px solid white",
                          cursor: handle.cursor,
                          zIndex: Z_INDEX_SIGNATURE_OVERLAY_HANDLE,
                          ...("top" in handle && handle.top !== undefined
                            ? {
                                top: handle.top,
                                transform: isEdge
                                  ? "translate(-50%, 0)"
                                  : undefined,
                              }
                            : {}),
                          ...("bottom" in handle && handle.bottom !== undefined
                            ? {
                                bottom: handle.bottom,
                                transform: isEdge
                                  ? "translate(-50%, 0)"
                                  : undefined,
                              }
                            : {}),
                          ...("left" in handle && handle.left !== undefined
                            ? {
                                left: handle.left,
                                transform: isEdge
                                  ? "translate(0, -50%)"
                                  : undefined,
                              }
                            : {}),
                          ...("right" in handle && handle.right !== undefined
                            ? {
                                right: handle.right,
                                transform: isEdge
                                  ? "translate(0, -50%)"
                                  : undefined,
                              }
                            : {}),
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSelect?.(preview.id);
                          const el = e.currentTarget;
                          el.setPointerCapture(e.pointerId);
                          pauseInteraction();

                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startWidth = preview.width;
                        const startHeight = preview.height;
                        const startLeft = preview.x;
                        const startTop = preview.y;

                        const handlePointerMove = (moveEvent: PointerEvent) => {
                          isDraggingRef.current = true;
                          const deltaX =
                            (moveEvent.clientX - startX) / pageWidth;
                          const deltaY =
                            (moveEvent.clientY - startY) / pageHeight;

                          let newWidth = startWidth;
                          let newHeight = startHeight;
                          let newX = startLeft;
                          let newY = startTop;

                          // Min sizes as fractions: 50px / pageWidth, 25px / pageHeight
                          const minW = 50 / pageWidth;
                          const minH = 25 / pageHeight;

                          if (handle.position.includes("e")) {
                            newWidth = Math.max(minW, startWidth + deltaX);
                          }
                          if (handle.position.includes("w")) {
                            newWidth = Math.max(minW, startWidth - deltaX);
                            newX = startLeft + (startWidth - newWidth);
                          }
                          if (handle.position.includes("s")) {
                            newHeight = Math.max(minH, startHeight + deltaY);
                          }
                          if (handle.position.includes("n")) {
                            newHeight = Math.max(minH, startHeight - deltaY);
                            newY = startTop + (startHeight - newHeight);
                          }

                          // Corner handles lock aspect ratio. Drive newWidth
                          // off the horizontal delta and derive newHeight so
                          // the box keeps startWidth:startHeight. Re-centre
                          // around startLeft/startTop so the opposite corner
                          // stays anchored under the user's pointer.
                          if (handle.kind === "corner") {
                            const aspect = startWidth / Math.max(startHeight, 1e-6);
                            const wantsLeft = handle.position.includes("w");
                            const wantsTop = handle.position.includes("n");
                            newHeight = Math.max(minH, newWidth / aspect);
                            newWidth = Math.max(minW, newHeight * aspect);
                            newX = wantsLeft
                              ? startLeft + (startWidth - newWidth)
                              : startLeft + (startWidth - newWidth) / 2;
                            newY = wantsTop
                              ? startTop + (startHeight - newHeight)
                              : startTop + (startHeight - newHeight) / 2;
                          }

                          // Keep the box on-page (mirrors the placement clamp).
                          newWidth = Math.min(newWidth, 1);
                          newHeight = Math.min(newHeight, 1);
                          newX = Math.max(0, Math.min(newX, 1 - newWidth));
                          newY = Math.max(0, Math.min(newY, 1 - newHeight));

                          onChange(
                            previews.map((p) =>
                              p.id === preview.id
                                ? {
                                    ...p,
                                    x: newX,
                                    y: newY,
                                    width: newWidth,
                                    height: newHeight,
                                  }
                                : p,
                            ),
                          );
                        };

                        const handlePointerUp = (upEvent: PointerEvent) => {
                          el.removeEventListener(
                            "pointermove",
                            handlePointerMove,
                          );
                          el.removeEventListener("pointerup", handlePointerUp);
                          el.releasePointerCapture(upEvent.pointerId);
                          resumeInteraction();
                          window.getSelection()?.removeAllRanges();
                          setTimeout(() => {
                            isDraggingRef.current = false;
                          }, 10);
                        };

                        el.addEventListener("pointermove", handlePointerMove);
                        el.addEventListener("pointerup", handlePointerUp);
                      }}
                      </div>
                  );
                })}
              </div>
            </div>
          </Tooltip>
        );
      })}

      {/* Hover preview: ghost signature following cursor in placement mode */}
      {!readOnly && placementMode && placementData && cursorPos && (
        <img
          src={placementData}
          alt=""
          style={{
            position: "absolute",
            left: Math.max(0, Math.min(cursorPos.x - DEFAULT_STAMP_WIDTH_PT / 2, pageWidth - DEFAULT_STAMP_WIDTH_PT)),
            top: Math.max(0, Math.min(cursorPos.y - DEFAULT_STAMP_HEIGHT_PT / 2, pageHeight - DEFAULT_STAMP_HEIGHT_PT)),
            width: DEFAULT_STAMP_WIDTH_PT,
            height: DEFAULT_STAMP_HEIGHT_PT,
            opacity: 0.6,
            pointerEvents: "none",
            objectFit: "contain",
            boxShadow:
              "0 0 0 1px rgba(30, 136, 229, 0.55), 0 6px 18px rgba(30, 136, 229, 0.25)",
            borderRadius: "4px",
            zIndex: Z_INDEX_SIGNATURE_OVERLAY + 1,
          }}
        />
      )}
    </div>
  );
});
