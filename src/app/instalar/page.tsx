"use client";

import PwaInstallLanding from "@/components/PwaInstallLanding";

export default function InstalarAppPage() {
  return (
    <PwaInstallLanding
      onContinueInBrowser={() => {
        window.location.assign("/");
      }}
    />
  );
}
