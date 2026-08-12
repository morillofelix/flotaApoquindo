/** Keeps native date/time pickers visible inside scrollable mobile layouts. */
export function scrollNativePickerIntoView(
  event: { currentTarget: HTMLElement },
) {
  const target = event.currentTarget;
  window.setTimeout(() => {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, 80);
}
