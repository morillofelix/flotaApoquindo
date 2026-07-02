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

export function hasInstallQueryParam() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("instalar") === "1";
}

export function clearInstallQueryParam() {
  if (typeof window === "undefined" || !hasInstallQueryParam()) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("instalar");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function shouldShowPwaInstallLanding() {
  return hasInstallQueryParam() && !isStandaloneMode();
}
