const STYLE_PREVIEW_SLIDE_COUNTS = {
  free: 1,
  academic: 8,
  minimal: 8,
  professional: 8,
  botanical: 8,
  wabi: 8,
  memphis: 8,
  constructivism: 8,
  brutalist: 8,
  "8bit": 8,
  electro: 8,
  geometric: 8,
  morandi: 8,
  nordic: 8,
  fluid: 8,
  cinema: 8,
  coolblue: 8,
  warmvc: 8,
  modernacademic: 8,
  curatorial: 8,
} as const;

type StyleWithSlides = keyof typeof STYLE_PREVIEW_SLIDE_COUNTS;

export const STYLE_PREVIEW_SLIDES: Record<StyleWithSlides, string[]> =
  Object.fromEntries(
    Object.entries(STYLE_PREVIEW_SLIDE_COUNTS).map(([styleId, slideCount]) => [
      styleId,
      Array.from({ length: slideCount }, (_, index) => {
        const page = String(index + 1).padStart(2, "0");
        return `/images/styles/slides/${styleId}/${page}.svg`;
      }),
    ])
  ) as Record<StyleWithSlides, string[]>;

export function getStylePreviewSlides(
  styleId: string,
  coverImage: string
): string[] {
  const slides = (STYLE_PREVIEW_SLIDES as Record<string, string[]>)[styleId];
  if (!slides || slides.length === 0) {
    return [coverImage];
  }
  return slides;
}
