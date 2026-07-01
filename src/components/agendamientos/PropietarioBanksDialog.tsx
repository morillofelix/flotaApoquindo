"use client";

import { adminFetchInit } from "@/lib/admin-fetch";
import {
  sortPropietarioBanks,
  type PropietarioBankConfig,
} from "@/lib/propietarios-banks";
import { useEffect, useMemo, useState } from "react";

const inputClassName =
  "h-9 w-full min-w-0 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

const labelClassName = "text-xs font-semibold text-[#173b68]";

const primaryButtonClassName =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:opacity-60";

const secondaryButtonClassName =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] transition hover:bg-[#eef4fb]";

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
  isActive: boolean;
};

const emptyBankForm: BankForm = {
  id: "",
  name: "",
  bankBic: "",
  isActive: true,
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

  const sortedBanks = useMemo(() => sortPropietarioBanks(banks), [banks]);

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
      isActive: bank.isActive,
    });
    setBankMessage("");
    setBankError("");
  }

  async function saveBank(event: React.FormEvent) {
    event.preventDefault();

    const name = bankForm.name.trim();
    const bankBic = bankForm.bankBic.trim();
    const isEditing = Boolean(bankForm.id);

    if (name.length < 2) {
      setBankError("Ingresa un nombre de banco válido.");
      return;
    }

    setIsSavingBank(true);
    setBankMessage("");
    setBankError("");

    try {
      const response = await fetch("/api/propietarios/banks", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: adminFetchInit.credentials,
        body: JSON.stringify({
          id: bankForm.id || undefined,
          name,
          bankBic,
          isActive: isEditing ? bankForm.isActive : true,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        bank?: PropietarioBankConfig;
      };

      if (!response.ok || !data.bank) {
        throw new Error(data.message ?? "No se pudo guardar el banco.");
      }

      const nextBanks = isEditing
        ? banks.map((bank) => (bank.id === data.bank?.id ? data.bank : bank))
        : [...banks, data.bank];

      onBanksChange(sortPropietarioBanks(nextBanks));
      setBankForm(emptyBankForm);
      setBankMessage(
        isEditing ? "Banco actualizado." : "Banco agregado al catálogo.",
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
                Administra nombre, código y estado para asignarlos sin escribir
                manualmente.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={secondaryButtonClassName}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="overflow-auto px-5 py-4">
          <form
            onSubmit={saveBank}
            className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4"
          >
            <p className="text-xs font-semibold text-[#173b68]">
              {bankForm.id ? "Editar banco" : "Agregar banco"}
            </p>

            <div
              className={`mt-3 grid gap-3 ${
                bankForm.id ? "sm:grid-cols-3" : "sm:grid-cols-2"
              }`}
            >
              <label className="flex min-w-0 flex-col gap-1.5">
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

              <label className="flex min-w-0 flex-col gap-1.5">
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

              {bankForm.id ? (
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className={labelClassName}>Estado</span>
                  <select
                    value={bankForm.isActive ? "activo" : "inactivo"}
                    onChange={(event) =>
                      setBankForm((current) => ({
                        ...current,
                        isActive: event.target.value === "activo",
                      }))
                    }
                    className={inputClassName}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[#d7e5f4] pt-4">
              {bankForm.id ? (
                <button
                  type="button"
                  onClick={() => setBankForm(emptyBankForm)}
                  className={secondaryButtonClassName}
                >
                  Cancelar
                </button>
              ) : null}
              <button
                type="submit"
                disabled={isSavingBank}
                className={primaryButtonClassName}
              >
                {isSavingBank
                  ? "Guardando..."
                  : bankForm.id
                    ? "Actualizar"
                    : "Agregar"}
              </button>
            </div>

            {bankMessage ? (
              <p className="mt-3 text-xs font-semibold text-green-700">
                {bankMessage}
              </p>
            ) : null}
            {bankError ? (
              <p className="mt-3 text-xs font-semibold text-red-600">
                {bankError}
              </p>
            ) : null}
          </form>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#b7cce4]">
            <div className="grid grid-cols-[minmax(0,1fr)_0.35fr_0.35fr] gap-2 bg-[#eef4fb] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#173b68]">
              <span>Nombre banco</span>
              <span>Código</span>
              <span>Estado</span>
            </div>
            <div className="max-h-[40dvh] divide-y divide-[#c5d8eb] overflow-auto">
              {sortedBanks.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500">
                  No hay bancos en el catálogo todavía.
                </p>
              ) : (
                sortedBanks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => editBank(bank)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_0.35fr_0.35fr] gap-2 px-3 py-2 text-left text-xs transition hover:bg-[#f3f8fd] ${
                      bankForm.id === bank.id ? "bg-[#e8f2fb]" : ""
                    } ${bank.isActive ? "" : "opacity-70"}`}
                  >
                    <span className="truncate font-medium text-[#0f2747]">
                      {bank.name}
                    </span>
                    <span className="text-slate-600">{bank.bankBic || "—"}</span>
                    <span
                      className={
                        bank.isActive
                          ? "font-semibold text-green-700"
                          : "font-semibold text-slate-500"
                      }
                    >
                      {bank.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            {sortedBanks.length} banco{sortedBanks.length === 1 ? "" : "s"} en
            catálogo. Los inactivos no aparecen al crear propietarios. Los bancos
            usados en propietarios se cargan automáticamente al abrir este
            mantenedor.
          </p>
        </div>
      </div>
    </div>
  );
}
