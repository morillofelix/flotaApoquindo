import Link from "next/link";
import DataRefreshButton from "@/components/agendamientos/DataRefreshButton";
import { UI_CARD_SHELL } from "@/lib/ui-borders";

export default function MaintainerPageHeader({
  title,
  subtitle = "Mantenedores",
  actions,
  onRefresh,
  isRefreshing,
  lastUpdatedAt,
  refreshVariant = "toolbar",
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  refreshVariant?: "default" | "toolbar" | "prominent";
}) {
  return (
    <header className={`mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${UI_CARD_SHELL} px-3 py-2 sm:px-4`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b5cab]">
          {subtitle}
        </p>
        <h1 className="font-heading text-lg font-semibold text-[#0f2747] sm:text-xl">
          {title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {onRefresh ? (
          <>
            <DataRefreshButton
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
              lastUpdatedAt={lastUpdatedAt}
              variant={refreshVariant}
            />
            <span
              aria-hidden="true"
              className="mx-0.5 hidden h-5 w-px bg-[#c5d8eb] sm:block"
            />
          </>
        ) : null}
        {actions}
        <Link
          href="/agendamientos"
          className="inline-flex h-9 items-center justify-center rounded-full bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
        >
          Cerrar
        </Link>
      </div>
    </header>
  );
}
