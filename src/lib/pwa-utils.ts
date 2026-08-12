export function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean(
        (window.navigator as Navigator & { standalone?: boolean }).standalone,
      ))
  );
}

export function isIosDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isAndroidDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return /android/i.test(window.navigator.userAgent);
}

export function isDesktopDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return !isIosDevice() && !isAndroidDevice();
}
