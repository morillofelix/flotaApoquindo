export const UI_PANEL_BORDER = "border border-[#b7cce4]";
export const UI_FIELD_BORDER = "border border-[#9fb8d9]";
export const UI_DIVIDER_BORDER = "border-[#c5d8eb]";
export const UI_FIELD_SHADOW = "shadow-[0_1px_2px_rgba(15,39,71,0.05)]";
export const UI_PANEL_SHADOW = "shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]";
export const UI_FIELD_FOCUS =
  "outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export const UI_CARD_SHELL =
  "rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]";

export function uiFieldClass(extra = "") {
  return `${UI_FIELD_BORDER} bg-white ${UI_FIELD_SHADOW} ${UI_FIELD_FOCUS} ${extra}`.trim();
}

export function uiPanelClass(extra = "") {
  return `${UI_PANEL_BORDER} ${extra}`.trim();
}

export const UI_LIST_ROW_HOVER = "transition hover:bg-[#f8fbff]";
export const UI_LIST_ROW_SELECTED =
  "bg-[#d7e7f8] shadow-[inset_3px_0_0_#0b5cab] ring-1 ring-inset ring-[#0b5cab]/25";

export function uiListRowClass(isSelected: boolean, extra = "") {
  return [
    UI_LIST_ROW_HOVER,
    isSelected ? UI_LIST_ROW_SELECTED : "",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
