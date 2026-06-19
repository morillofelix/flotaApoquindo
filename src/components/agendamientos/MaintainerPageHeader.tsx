import Link from "next/link";
import { UI_CARD_SHELL } from "@/lib/ui-borders";

export default function MaintainerPageHeader({
  title,
  subtitle = "Mantenedores",
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className={`mb-4 flex flex-col gap-1.5 ${UI_CARD_SHELL} px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b5cab]">
          {subtitle}
        </p>
        <h1 className="font-heading text-xl font-semibold text-[#0f2747] sm:text-2xl">
          {title}
        </h1>
      </div>
      <Link
        href="/agendamientos"
        className="inline-flex h-9 items-center justify-center rounded-full bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
      >
        Cerrar
      </Link>
    </header>
  );
}
