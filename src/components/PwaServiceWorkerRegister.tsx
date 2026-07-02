"use client";

import { useEffect } from "react";

export default function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // El portal sigue funcionando en navegador aunque falle el registro PWA.
      });
  }, []);

  return null;
}
