"use client";

import { adminFetchInit } from "@/lib/admin-fetch";
import {
  type PropietarioBankConfig,
} from "@/lib/propietarios-banks";
import { useEffect, useState } from "react";

const inputClassName =
  "h-9 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

const labelClassName = "text-xs font-semibold text-[#173b68]";

type PropietarioBanksDialogProps = {
  open: boolean;
  banks: PropietarioBankConfig[];
  onClose: () => void;
  onBanksChange: (banks: PropietarioBankConfig[]) => void;
};

type BankForm = {
  id: string;
  name: string;
  bankBic: string;
};

const emptyBankForm: BankForm = {
  id: "",
  name: "",
  bankBic: "",
};

export default function PropietarioBanksDialog({
  open,
  banks,
  onClose,
  onBanksChange,
}: PropietarioBanksDialogProps) {
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm);
  const [bankMessage, setBankMessage] = useState("");
  const [bankError, setBankError] = useState("");
  const [isSavingBank, setIsSavingBank] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setBankForm(emptyBankForm);
      setBankMessage("");
      setBankError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function editBank(bank: PropietarioBankConfig) {
    setBankForm({
      id: bank.id,
      name: bank.name,
      bankBic: bank.bankBic,
    });
    setBankMessage("");
    setBankError("");
  }

  async function saveBank(event: React.FormEvent) {
    event.preventDefault();

    const name = bankForm.name.trim();
    const bankBic = bankForm.bankBic.trim();

    if (name.length < 2) {
      setBankError("Ingresa un nombre de banco válido.");
      return;
    }

    setIsSavingBank(true);
    setBankMessage("");
    setBankError("");

    try {
      const response = await fetch("/api/propietarios/banks", {
        method: bankForm.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: adminFetchInit.credentials,
        body: JSON.stringify({
          id: bankForm.id || undefined,
          name,
          bankBic,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        bank?: PropietarioBankConfig;
      };

      if (!response.ok || !data.bank) {
        throw new Error(data.message ?? "No se pudo guardar el banco.");
      }

      const nextBanks = bankForm.id
        ? banks.map((bank) => (bank.id === data.bank?.id ? data.bank : bank))
        : [...banks, data.bank].sort((left, right) =>
            left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
          );

      onBanksChange(nextBanks);
      setBankForm(emptyBankForm);
      setBankMessage(
        bankForm.id ? "Banco actualizado." : "Banco agregado al catálogo.",
      );
    } catch (error) {
      setBankError(
        error instanceof Error ? error.message : "No se pudo guardar el banco.",
      );
    } finally {
      setIsSavingBank(false);
    }
  }

  return (
    <div
      aria-labelledby="propietario-banks-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f2747]/55 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/25"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="propietario-banks-title"
                className="font-heading text-base font-semibold text-[#0f2747]"
              >
                Catálogo de bancos
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Administra nombre y código bancario para asignarlos sin escribir
                manualmente.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center justify-center rounded-full border border-[#9fb8d9] bg-white px-3 text-[11px] font-semibold text-[#173b68]"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="overflow-auto px-5 py-4">
          <form onSubmit={saveBank} className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
            <p className="text-xs font-semibold text-[#173b68]">
              {bankForm.id ? "Editar banco" : "Agregar banco"}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_0.45fr_auto]">
              <label className="flex flex-col gap-1.5">
                <span className={labelClassName}>Nombre banco</span>
                <input
                  type="text"
                  value={bankForm.name}
                  onChange={(event) =>
                    setBankForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="Banco de Chile"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClassName}>Código banco</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bankForm.bankBic}
                  onChange={(event) =>
                    setBankForm((current) => ({
                      ...current,
                      bankBic: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="001"
                />
              </label>
              <div className="flex items-end gap-2">
                {bankForm.id ? (
                  <button
                    type="button"
                    onClick={() => setBankForm(emptyBankForm)}
                    className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]"
                  >
                    Cancelar
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={isSavingBank}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:opacity-60"
                >
                  {isSavingBank
                    ? "Guardando..."
                    : bankForm.id
                      ? "Actualizar"
                      : "Agregar"}
                </button>
              </div>
            </div>
            {bankMessage ? (
              <p className="mt-2 text-xs font-semibold text-green-700">
                {bankMessage}
              </p>
            ) : null}
            {bankError ? (
              <p className="mt-2 text-xs font-semibold text-red-600">
                {bankError}
              </p>
            ) : null}
          </form>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#b7cce4]">
            <div className="grid grid-cols-[1fr_0.45fr] gap-2 bg-[#eef4fb] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#173b68]">
              <span>Nombre banco</span>
              <span>Código</span>
            </div>
            <div className="max-h-[40dvh] divide-y divide-[#c5d8eb] overflow-auto">
              {banks.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500">
                  No hay bancos en el catálogo todavía.
                </p>
              ) : (
                banks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => editBank(bank)}
                    className={`grid w-full grid-cols-[1fr_0.45fr] gap-2 px-3 py-2 text-left text-xs transition hover:bg-[#f3f8fd] ${
                      bankForm.id === bank.id ? "bg-[#e8f2fb]" : ""
                    }`}
                  >
                    <span className="font-medium text-[#0f2747]">{bank.name}</span>
                    <span className="text-slate-600">
                      {bank.bankBic || "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            {banks.length} banco{banks.length === 1 ? "" : "s"} en catálogo.
            Los bancos usados en propietarios se cargan automáticamente al abrir
            este mantenedor.
          </p>
        </div>
      </div>
    </div>
  );
}
