"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/agendamientos", label: "Solicitudes" },
  { href: "/agendamientos/motivos", label: "Motivos" },
  { href: "/agendamientos/ejecutivos", label: "Ejecutivos" },
  { href: "/agendamientos/conductores", label: "Conductores" },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/agendamientos") {
    return pathname === "/agendamientos";
  }

  return pathname.startsWith(href);
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    setIsAuthenticated(
      window.sessionStorage.getItem("apoquindo-admin-auth") === "true",
    );
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: loginValues.user.trim(),
          password: loginValues.password,
        }),
      });

      if (response.ok) {
        window.sessionStorage.setItem("apoquindo-admin-auth", "true");
        setIsAuthenticated(true);
        setLoginValues({ user: "", password: "" });
        setIsPasswordVisible(false);
        return;
      }

      setLoginError("Usuario o clave incorrectos.");
    } catch {
      setLoginError("No se pudo validar el acceso. Intenta nuevamente.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    window.sessionStorage.removeItem("apoquindo-admin-auth");
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
        <section className="w-full max-w-md rounded-[24px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:rounded-[28px] sm:p-8">
          <div className="mb-7 border-b border-[#e3ebf5] pb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
              Acceso ejecutivo
            </p>
            <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747]">
              Administración de citas
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ingresa usuario y clave para revisar las solicitudes enviadas.
            </p>
          </div>

          <form noValidate onSubmit={handleLogin} className="grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Usuario
              </span>
              <input
                type="text"
                value={loginValues.user}
                onChange={(event) =>
                  setLoginValues((currentValues) => ({
                    ...currentValues,
                    user: event.target.value,
                  }))
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                placeholder="Usuario ejecutivo"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Clave
              </span>
              <div className="relative">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={loginValues.password}
                  onChange={(event) =>
                    setLoginValues((currentValues) => ({
                      ...currentValues,
                      password: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-[#d8e2ef] bg-white px-4 pr-12 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                  placeholder="Clave de acceso"
                />
                <button
                  type="button"
                  onClick={() =>
                    setIsPasswordVisible((currentValue) => !currentValue)
                  }
                  aria-label={
                    isPasswordVisible ? "Ocultar clave" : "Mostrar clave"
                  }
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f8fbff] hover:text-[#0b5cab] focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  {isPasswordVisible ? (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="m3 3 18 18" />
                      <path d="M10.7 5.1A10.8 10.8 0 0 1 12 5c6 0 9 7 9 7a13.2 13.2 0 0 1-2.1 3.2" />
                      <path d="M6.6 6.6C4.1 8.3 3 12 3 12s3 7 9 7a9.7 9.7 0 0 0 4.1-.9" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                      <path d="M14.1 9.9A3 3 0 0 0 9.9 14.1" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {loginError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {loginError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              {isLoggingIn ? "Validando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-5 rounded-2xl bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-slate-500">
            Acceso temporal: usuario <strong>ejecutivo</strong>, clave{" "}
            <strong>Apoquindo2026</strong>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#eef3f9] text-[#0f2747]">
      <nav className="border-b border-[#d8e2ef] bg-white shadow-sm shadow-slate-200/60">
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-3 px-3 py-3 sm:px-6 xl:px-10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1">
              {navItems.map((item) => {
                const active = isActiveRoute(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-9 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                      active
                        ? "bg-[#0b5cab] text-white shadow-md shadow-blue-900/15"
                        : "text-[#173b68] hover:bg-[#d7e7f8]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Nueva solicitud
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      {children}
    </div>
  );
}
