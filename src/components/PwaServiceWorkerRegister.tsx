"use client";

import { useEffect } from "react";

export default function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then(async (registration) => {
        await registration.update();

        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            const timeout = window.setTimeout(resolve, 4000);

            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => {
                window.clearTimeout(timeout);
                resolve();
              },
              { once: true },
            );
          });
        }

        window.dispatchEvent(new CustomEvent("pwa-service-worker-ready"));
      })
      .catch(() => {
        // El portal sigue funcionando en navegador aunque falle el registro PWA.
      });
  }, []);

  return null;
}
