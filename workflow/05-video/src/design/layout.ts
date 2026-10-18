export interface SafeBounds {
  safeLeft: number;
  safeRight: number;
  safeTop: number;
  safeBottom: number;
  contentWidth: number;
  contentHeight: number;
  isVertical: boolean;
}

/**
 * Calculates safe margins and content area for the given composition dimensions.
 * For 1080p width baseline: 80px sides, 100px top/bottom, scaled with width.
 */
export function getSafeBounds(width: number, height: number, hasCaptions: boolean = false): SafeBounds {
  const isVertical = height > width;
  const scale = width / 1920;

  // Safe padding
  const safeX = isVertical ? 60 : Math.round(140 * scale);
  const safeTop = isVertical ? 120 : Math.round(100 * (height / 1080));
  // Reserve extra bottom space if burned-in captions are present
  const captionReserve = hasCaptions ? Math.round(130 * (height / 1080)) : 0;
  const safeBottom = (isVertical ? 140 : Math.round(100 * (height / 1080))) + captionReserve;

  const contentWidth = width - safeX * 2;
  const contentHeight = height - safeTop - safeBottom;

  return {
    safeLeft: safeX,
    safeRight: safeX,
    safeTop,
    safeBottom,
    contentWidth,
    contentHeight,
    isVertical,
  };
}

/**
 * Helper to calculate 12-column grid geometry within safe content width.
 */
export function getGridGeometry(contentWidth: number, gap: number = 24) {
  const totalGaps = gap * 11;
  const columnWidth = (contentWidth - totalGaps) / 12;
  return {
    columnWidth,
    gap,
    colSpan: (cols: number) => cols * columnWidth + (cols - 1) * gap,
  };
}
