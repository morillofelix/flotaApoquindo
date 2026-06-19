type PublicPageBannerProps = {
  title: string;
  eyebrow?: string;
};

export default function PublicPageBanner({
  title,
  eyebrow = "Transportes Apoquindo",
}: PublicPageBannerProps) {
  return (
    <div className="sticky top-0 z-10 bg-[#eef3f9]/95 px-4 pb-2 pt-2 backdrop-blur-sm sm:px-6 md:px-8">
      <div className="mx-auto w-full max-w-2xl md:max-w-3xl">
        <div className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#0b5cab] via-[#084a8c] to-[#062b5f] px-3 py-2.5 shadow-[0_8px_22px_-12px_rgba(6,43,95,0.55)] sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex shrink-0 items-center justify-center rounded-lg bg-white px-2 py-1.5 shadow-sm">
            <img
              src="/logo-apoquindo.png"
              alt="Transportes Apoquindo"
              className="h-7 w-auto object-contain sm:h-8"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9ec5ff] sm:text-[10px]">
              {eyebrow}
            </p>
            <h1 className="font-heading text-base font-semibold leading-tight tracking-tight text-white sm:text-lg">
              {title}
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
}
