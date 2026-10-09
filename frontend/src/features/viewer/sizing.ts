export type PageSize = { width: number; height: number };
export type SizingMode = "auto" | "page" | "width" | "actual" | "custom";

export function documentScale(
  mode: SizingMode,
  page: PageSize,
  available: PageSize,
  zoom: number,
) {
  const width = Math.max(1, available.width) / page.width;
  if (mode === "width") return width;
  if (mode === "page")
    return Math.min(width, Math.max(1, available.height - 40) / page.height);
  if (mode === "actual") return 1;
  if (mode === "custom") return zoom / 100;
  return Math.min(1, width);
}
