import { isRenderableSvgDataUrl } from "./svgPreview";

type SvgFrameLike = {
  svg_data_url?: string | null;
};

type LegacySlideLike = {
  thumbnail_url?: string | null;
  rendered_previews?: SvgFrameLike[] | null;
};

type AuthoritySlideLike = {
  svg_data_url?: string | null;
  frames?: SvgFrameLike[] | null;
};

export type SlideSlotPreviewLike = {
  index: number;
  legacySlide?: LegacySlideLike | null;
  authoritySlide?: AuthoritySlideLike | null;
};

export function slotHasRenderablePreview(
  slot: SlideSlotPreviewLike | null | undefined
): boolean {
  if (!slot) return false;
  if (isRenderableSvgDataUrl(slot.authoritySlide?.svg_data_url)) {
    return true;
  }
  if (
    Array.isArray(slot.authoritySlide?.frames) &&
    slot.authoritySlide.frames.some((frame) =>
      isRenderableSvgDataUrl(frame?.svg_data_url)
    )
  ) {
    return true;
  }
  if (
    Array.isArray(slot.legacySlide?.rendered_previews) &&
    slot.legacySlide.rendered_previews.some((frame) =>
      isRenderableSvgDataUrl(frame?.svg_data_url)
    )
  ) {
    return true;
  }
  return isRenderableSvgDataUrl(slot.legacySlide?.thumbnail_url);
}

export function resolveRenderableSlideIndex(
  slideSlots: SlideSlotPreviewLike[],
  preferredIndex: number
): number {
  const preferredSlot =
    slideSlots.find((slot) => slot.index === preferredIndex) ?? null;
  if (slotHasRenderablePreview(preferredSlot)) {
    return preferredIndex;
  }
  const firstRenderableSlot =
    slideSlots.find((slot) => slotHasRenderablePreview(slot)) ?? null;
  if (firstRenderableSlot) {
    return firstRenderableSlot.index;
  }
  return preferredSlot?.index ?? slideSlots[0]?.index ?? 0;
}
