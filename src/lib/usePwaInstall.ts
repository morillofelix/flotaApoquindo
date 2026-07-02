import { useCallback, useEffect, useState } from "react";
import {
  isAndroidDevice,
  isIosDevice,
  isStandaloneMode,
} from "@/lib/pwa-utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS] = useState(isIosDevice);
  const [isAndroid] = useState(isAndroidDevice);
  const [isMobile] = useState(isIosDevice() || isAndroidDevice());

  useEffect(() => {
    setIsInstalled(isStandaloneMode());
    setIsDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      return true;
    }

    return false;
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setIsDismissed(true);
  }, []);

  const canNativeInstall = Boolean(deferredPrompt);
  const shouldSuggestInstall =
    isMobile && !isInstalled && !isDismissed && (canNativeInstall || isIOS);

  return {
    canNativeInstall,
    dismissPrompt,
    isAndroid,
    isDismissed,
    isIOS,
    isInstalled,
    isMobile,
    promptInstall,
    shouldSuggestInstall,
  };
}
