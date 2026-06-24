"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { loadDriverOwners } from "@/lib/agendamientos-admin";
import {
  countImportCategories,
  downloadDriverOwnersExcel,
  filterDriverOwnerImportRows,
  formatFileSize,
  formatPersonTypes,
  formatShifts,
  getTemporaryPasswordFromRut,
  parseDriverOwnersCsv,
  prepareDriverOwnerUploadContent,
  readDriverOwnerFileContent,
  shiftOptions,
  type BulkImportFilters,
  type DriverOwnerConfig,
  type ParsedDriverOwnerRow,
  type ShiftType,
} from "@/lib/driver-owners";
import {
  isDigitOnlySearch,
  matchesTextSearch,
  matchesVehicleNumberSearch,
} from "@/lib/maintainer-search";
import { uiListRowClass } from "@/lib/ui-borders";
import { useEffect, useMemo, useState } from "react";

type DriverOwnerForm = DriverOwnerConfig & {
  id: string;
};

type BulkUploadPhase =
  | "idle"
  | "ready"
  | "reading"
  | "validating"
  | "uploading"
  | "success"
  | "error";

type BulkUploadState = {
  phase: BulkUploadPhase;
  fileName: string;
  fileSize: number;
  detail: string;
  progress: number;
  importedCount: number;
  rowErrors: string[];
  parsedRows: ParsedDriverOwnerRow[];
  categoryCounts: {
    moviles: number;
    propietario: number;
    titular: number;
    total: number;
  };
};

const defaultBulkImportFilters: BulkImportFilters = {
  moviles: true,
  propietario: true,
  titular: true,
};

const emptyBulkUploadState: BulkUploadState = {
  phase: "idle",
  fileName: "",
  fileSize: 0,
  detail: "",
  progress: 0,
  importedCount: 0,
  rowErrors: [],
  parsedRows: [],
  categoryCounts: {
    moviles: 0,
    propietario: 0,
    titular: 0,
    total: 0,
  },
};

const bulkUploadSteps = [
  { key: "reading", label: "Leyendo archivo" },
  { key: "validating", label: "Validando datos" },
  { key: "uploading", label: "Importando registros" },
] as const;

const emptyDriverOwnerForm: DriverOwnerForm = {
  id: "",
  vehicleNumber: "",
  fullName: "",
  email: "",
  rut: "",
  licenseExpiryDate: "",
  birthDate: "",
  landlinePhone: "",
  mobilePhone: "",
  address: "",
  recordStatus: "V",
  isConductor: true,
  isPropietario: false,
  municipalLicense: "",
  shifts: [],
  emergencyContactName: "",
  emergencyContactEmail: "",
  emergencyContactPhone: "",
  licensePlate: "",
  inspectionExpiryDate: "",
  vehicleType: "",
  subscriptionDate: "",
  isActive: true,
};

function toggleDriverOwnerShift(
  currentShifts: ShiftType[],
  shift: ShiftType,
): ShiftType[] {
  return currentShifts.includes(shift)
    ? currentShifts.filter((currentShift) => currentShift !== shift)
    : [...currentShifts, shift];
}

export default function ConductoresPage() {
  const [driverOwners, setDriverOwners] = useState<DriverOwnerConfig[]>([]);
  const [driverOwnerForm, setDriverOwnerForm] =
    useState<DriverOwnerForm>(emptyDriverOwnerForm);
  const [driverOwnerSearch, setDriverOwnerSearch] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    "todos" | "activo" | "inactivo"
  >("todos");
  const [shiftFilters, setShiftFilters] = useState<
    Record<ShiftType, boolean>
  >({
    diurno: false,
    nocturno: false,
    intermedio: false,
  });
  const [driverOwnerMessage, setDriverOwnerMessage] = useState("");
  const [driverOwnerError, setDriverOwnerError] = useState("");
  const [isSavingDriverOwner, setIsSavingDriverOwner] = useState(false);
  const [sendingTempPassword, setSendingTempPassword] = useState(false);
  const [bulkUpload, setBulkUpload] = useState<BulkUploadState>(emptyBulkUploadState);
  const [bulkImportFilters, setBulkImportFilters] =
    useState<BulkImportFilters>(defaultBulkImportFilters);

  useEffect(() => {
    loadDriverOwners()
      .then((loadedDriverOwners) => setDriverOwners(loadedDriverOwners))
      .catch(() =>
        setDriverOwnerError("No se pudieron cargar conductores y propietarios."),
      );
  }, []);

  const filteredDriverOwners = useMemo(() => {
    const normalizedSearch = driverOwnerSearch.trim();
    const normalizedSearchLower = normalizedSearch.toLowerCase();
    const digitOnlySearch = isDigitOnlySearch(normalizedSearch);
    const selectedShifts = shiftOptions
      .map((option) => option.value)
      .filter((shift) => shiftFilters[shift]);
    const hasShiftFilter = selectedShifts.length > 0;

    return driverOwners.filter((driverOwner) => {
      const matchesSearch =
        !normalizedSearch ||
        (digitOnlySearch
          ? matchesVehicleNumberSearch(
              driverOwner.vehicleNumber,
              normalizedSearch,
            )
          : matchesTextSearch(driverOwner.vehicleNumber, normalizedSearchLower) ||
            matchesTextSearch(driverOwner.fullName, normalizedSearchLower) ||
            matchesTextSearch(driverOwner.email, normalizedSearchLower) ||
            matchesTextSearch(driverOwner.rut, normalizedSearchLower) ||
            matchesTextSearch(driverOwner.mobilePhone, normalizedSearchLower) ||
            matchesTextSearch(driverOwner.licensePlate, normalizedSearchLower) ||
            matchesTextSearch(
              formatPersonTypes(
                driverOwner.isConductor,
                driverOwner.isPropietario,
              ),
              normalizedSearchLower,
            ) ||
            matchesTextSearch(
              formatShifts(driverOwner.shifts),
              normalizedSearchLower,
            ));

      const matchesActiveStatus =
        activeStatusFilter === "todos" ||
        (activeStatusFilter === "activo" && driverOwner.isActive) ||
        (activeStatusFilter === "inactivo" && !driverOwner.isActive);

      const matchesShift =
        !hasShiftFilter ||
        selectedShifts.some((shift) => driverOwner.shifts.includes(shift));

      return matchesSearch && matchesActiveStatus && matchesShift;
    });
  }, [activeStatusFilter, driverOwnerSearch, driverOwners, shiftFilters]);

  const hasListFilters =
    driverOwnerSearch.trim().length > 0 ||
    activeStatusFilter !== "todos" ||
    shiftOptions.some((option) => shiftFilters[option.value]);

  const filteredBulkRows = useMemo(() => {
    if (!bulkUpload.parsedRows.length) {
      return [];
    }

    return filterDriverOwnerImportRows(bulkUpload.parsedRows, bulkImportFilters);
  }, [bulkImportFilters, bulkUpload.parsedRows]);

  function isSelectedDriverOwner(driverOwner: DriverOwnerConfig) {
    if (driverOwnerForm.id && driverOwner.id) {
      return driverOwnerForm.id === driverOwner.id;
    }

    return (
      driverOwnerForm.vehicleNumber.trim() !== "" &&
      driverOwnerForm.vehicleNumber === driverOwner.vehicleNumber
    );
  }

  function editDriverOwner(driverOwner: DriverOwnerConfig) {
    setDriverOwnerForm({
      id: driverOwner.id ?? "",
      vehicleNumber: driverOwner.vehicleNumber,
      fullName: driverOwner.fullName,
      email: driverOwner.email,
      rut: driverOwner.rut,
      licenseExpiryDate: driverOwner.licenseExpiryDate,
      birthDate: driverOwner.birthDate,
      landlinePhone: driverOwner.landlinePhone,
      mobilePhone: driverOwner.mobilePhone,
      address: driverOwner.address,
      recordStatus: driverOwner.recordStatus,
      isConductor: driverOwner.isConductor,
      isPropietario: driverOwner.isPropietario,
      municipalLicense: driverOwner.municipalLicense,
      shifts: driverOwner.shifts,
      emergencyContactName: driverOwner.emergencyContactName,
      emergencyContactEmail: driverOwner.emergencyContactEmail,
      emergencyContactPhone: driverOwner.emergencyContactPhone,
      licensePlate: driverOwner.licensePlate,
      inspectionExpiryDate: driverOwner.inspectionExpiryDate,
      vehicleType: driverOwner.vehicleType,
      subscriptionDate: driverOwner.subscriptionDate,
      isActive: driverOwner.isActive,
    });
    setDriverOwnerMessage("");
    setDriverOwnerError("");
  }

  function resetDriverOwnerForm() {
    setDriverOwnerForm(emptyDriverOwnerForm);
    setDriverOwnerMessage("");
    setDriverOwnerError("");
  }

  function clearListFilters() {
    setDriverOwnerSearch("");
    setActiveStatusFilter("todos");
    setShiftFilters({
      diurno: false,
      nocturno: false,
      intermedio: false,
    });
  }

  function toggleShiftFilter(shift: ShiftType) {
    setShiftFilters((currentFilters) => ({
      ...currentFilters,
      [shift]: !currentFilters[shift],
    }));
  }

  function downloadVisibleDriverOwners() {
    const fileName = hasListFilters
      ? "conductores-propietarios-filtrados.xls"
      : "conductores-propietarios.xls";

    downloadDriverOwnersExcel(filteredDriverOwners, fileName);
  }

  async function handleBulkFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setDriverOwnerMessage("");
    setDriverOwnerError("");
    setBulkImportFilters(defaultBulkImportFilters);
    setBulkUpload({
      ...emptyBulkUploadState,
      phase: "reading",
      fileName: file.name,
      fileSize: file.size,
      detail: "Leyendo el archivo seleccionado...",
      progress: 20,
    });

    try {
      const rawContent = await readDriverOwnerFileContent(file);
      const prepared = prepareDriverOwnerUploadContent(file.name, rawContent);

      if ("error" in prepared) {
        throw new Error(prepared.error);
      }

      const parsed = parseDriverOwnersCsv(prepared.csvContent);

      if (!parsed.rows.length) {
        throw new Error(
          parsed.errors[0] ??
            "El archivo no tiene filas válidas para importar.",
        );
      }

      const categoryCounts = countImportCategories(parsed.rows);

      setBulkUpload({
        phase: "ready",
        fileName: file.name,
        fileSize: file.size,
        detail: `Archivo listo. Se encontraron ${categoryCounts.total} registros válidos en el archivo.`,
        progress: 0,
        importedCount: 0,
        rowErrors: parsed.errors.slice(0, 5),
        parsedRows: parsed.rows,
        categoryCounts,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo leer el archivo.";

      setBulkUpload({
        ...emptyBulkUploadState,
        phase: "error",
        fileName: file.name,
        fileSize: file.size,
        detail: message,
        progress: 100,
      });
      setDriverOwnerError(message);
    } finally {
      event.target.value = "";
    }
  }

  async function confirmBulkImport() {
    if (!bulkUpload.parsedRows.length) {
      return;
    }

    const rowsToImport = filterDriverOwnerImportRows(
      bulkUpload.parsedRows,
      bulkImportFilters,
    );

    if (!rowsToImport.length) {
      setDriverOwnerError(
        "Selecciona al menos un tipo para importar registros.",
      );
      return;
    }

    setDriverOwnerMessage("");
    setDriverOwnerError("");
    setBulkUpload((currentState) => ({
      ...currentState,
      phase: "uploading",
      detail: `Importando ${rowsToImport.length} registros filtrados...`,
      progress: 68,
    }));

    try {
      const response = await fetch("/api/driver-owners/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: rowsToImport }),
      });

      const data = (await response.json()) as {
        message?: string;
        detail?: string;
        summary?: {
          imported?: number;
          replaced?: boolean;
          failed: number;
          total: number;
        };
        errors?: string[];
        driverOwners?: DriverOwnerConfig[];
      };

      if (!response.ok) {
        throw new Error(
          data.detail ??
            data.message ??
            data.errors?.[0] ??
            "No se pudo importar el archivo. Verifica el formato.",
        );
      }

      const importedCount =
        data.summary?.imported ?? data.summary?.total ?? rowsToImport.length;

      setDriverOwners(data.driverOwners ?? []);
      setBulkUpload((currentState) => ({
        ...currentState,
        phase: "success",
        detail: `¡Su carga fue exitosa! Se importaron ${importedCount} registros y se reemplazó la base anterior.`,
        progress: 100,
        importedCount,
        rowErrors: data.errors ?? currentState.rowErrors,
        parsedRows: [],
      }));
      setDriverOwnerMessage(
        `Carga masiva exitosa: ${importedCount} conductores/propietarios importados.`,
      );

      if (data.errors?.length) {
        setDriverOwnerError(
          `Importación completada con ${data.errors.length} advertencias.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo importar el archivo.";

      setBulkUpload((currentState) => ({
        ...currentState,
        phase: "error",
        detail: message,
        progress: 100,
      }));
      setDriverOwnerError(message);
    }
  }

  function toggleBulkImportFilter(filterKey: keyof BulkImportFilters) {
    setBulkImportFilters((currentFilters) => ({
      ...currentFilters,
      [filterKey]: !currentFilters[filterKey],
    }));
  }

  function resetBulkUploadStatus() {
    setBulkUpload(emptyBulkUploadState);
    setBulkImportFilters(defaultBulkImportFilters);
  }

  function getBulkStepStatus(stepKey: (typeof bulkUploadSteps)[number]["key"]) {
    const stepOrder = ["reading", "validating", "uploading"] as const;
    const thresholds = { reading: 20, validating: 55, uploading: 100 };
    const stepIndex = stepOrder.indexOf(stepKey);

    if (bulkUpload.phase === "success") {
      return "done";
    }

    if (bulkUpload.phase === "error") {
      const failedIndex =
        bulkUpload.progress <= thresholds.reading
          ? 0
          : bulkUpload.progress <= thresholds.validating
            ? 1
            : 2;

      if (stepIndex < failedIndex) {
        return "done";
      }

      if (stepIndex === failedIndex) {
        return "error";
      }

      return "pending";
    }

    const activeIndex =
      bulkUpload.progress <= thresholds.reading
        ? 0
        : bulkUpload.progress <= thresholds.validating
          ? 1
          : 2;

    if (stepIndex < activeIndex) {
      return "done";
    }

    if (stepIndex === activeIndex) {
      return "active";
    }

    return "pending";
  }

  async function saveDriverOwner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDriverOwnerMessage("");
    setDriverOwnerError("");

    if (
      driverOwnerForm.vehicleNumber.trim().length < 1 ||
      driverOwnerForm.fullName.trim().length < 3 ||
      (!driverOwnerForm.isConductor && !driverOwnerForm.isPropietario)
    ) {
      setDriverOwnerError(
        "Ingresa móvil, nombre y al menos un tipo (conductor o propietario).",
      );
      return;
    }

    setIsSavingDriverOwner(true);

    try {
      const response = await fetch("/api/driver-owners", {
        method: driverOwnerForm.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(driverOwnerForm),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? "No se pudo guardar el registro.");
      }

      const loadedDriverOwners = await loadDriverOwners();
      setDriverOwners(loadedDriverOwners);
      setDriverOwnerForm(emptyDriverOwnerForm);
      setDriverOwnerMessage("Registro guardado correctamente.");
    } catch (error) {
      setDriverOwnerError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el registro.",
      );
    } finally {
      setIsSavingDriverOwner(false);
    }
  }

  async function sendTemporaryPassword() {
    if (!driverOwnerForm.id) {
      setDriverOwnerError(
        "Guarda o selecciona un conductor antes de enviar la clave temporal.",
      );
      return;
    }

    if (!driverOwnerForm.email.trim()) {
      setDriverOwnerError("El conductor debe tener un correo registrado.");
      return;
    }

    if (!driverOwnerForm.rut.trim()) {
      setDriverOwnerError("El conductor debe tener un RUT válido.");
      return;
    }

    const temporaryPassword = getTemporaryPasswordFromRut(driverOwnerForm.rut);

    if (!temporaryPassword) {
      setDriverOwnerError(
        "El RUT debe tener al menos 4 dígitos para generar la clave temporal.",
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Enviar clave temporal al correo ${driverOwnerForm.email.trim()}?\n\nClave que recibirá el cliente: ${temporaryPassword}`,
    );

    if (!confirmed) {
      return;
    }

    setDriverOwnerMessage("");
    setDriverOwnerError("");
    setSendingTempPassword(true);

    try {
      const response = await fetch("/api/driver-owners/temporary-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverOwnerId: driverOwnerForm.id }),
      });

      const data = (await response.json()) as { message?: string; detail?: string };

      if (!response.ok) {
        throw new Error(
          [data.message, data.detail].filter(Boolean).join(" — ") ||
            "No se pudo enviar la clave temporal.",
        );
      }

      setDriverOwnerMessage(
        `${data.message ?? "Clave temporal enviada correctamente."} Clave: ${temporaryPassword}`,
      );
    } catch (error) {
      setDriverOwnerError(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la clave temporal.",
      );
    } finally {
      setSendingTempPassword(false);
    }
  }

  async function removeDriverOwner() {
    if (!driverOwnerForm.id) {
      return;
    }

    const confirmed = window.confirm(
      "¿Eliminar este conductor o propietario del catálogo?",
    );

    if (!confirmed) {
      return;
    }

    setDriverOwnerMessage("");
    setDriverOwnerError("");

    try {
      const response = await fetch(`/api/driver-owners/${driverOwnerForm.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar el registro.");
      }

      const loadedDriverOwners = await loadDriverOwners();
      setDriverOwners(loadedDriverOwners);
      setDriverOwnerForm(emptyDriverOwnerForm);
      setDriverOwnerMessage("Registro eliminado correctamente.");
    } catch {
      setDriverOwnerError("No se pudo eliminar el registro.");
    }
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader title="Conductores y propietarios" />

        <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
              <div className="mb-3 rounded-2xl border border-[#b7cce4] bg-white p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#173b68]">
                        Cargador masivo
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Sube CSV o SLK exportado desde Access. La carga
                        reemplaza por completo la base actual.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={downloadVisibleDriverOwners}
                        disabled={filteredDriverOwners.length === 0}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                      >
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold leading-none text-white">
                          X
                        </span>
                        Exportar a Excel
                      </button>
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px">
                        {bulkUpload.phase === "reading" ||
                        bulkUpload.phase === "uploading"
                          ? "Procesando..."
                          : "Seleccionar archivo"}
                        <input
                          type="file"
                          accept=".csv,.txt,.slk,text/csv"
                          onChange={handleBulkFileSelect}
                          disabled={
                            bulkUpload.phase === "reading" ||
                            bulkUpload.phase === "uploading"
                          }
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {bulkUpload.phase !== "idle" ? (
                    <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold text-[#0f2747]">
                            Archivo seleccionado
                          </p>
                          <p className="text-sm font-semibold text-[#0b5cab]">
                            {bulkUpload.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatFileSize(bulkUpload.fileSize)}
                          </p>
                        </div>
                        {bulkUpload.phase === "success" ||
                        bulkUpload.phase === "error" ? (
                          <button
                            type="button"
                            onClick={resetBulkUploadStatus}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-[#0b5cab] px-3 text-[11px] font-semibold text-white transition hover:bg-[#084a8c]"
                          >
                            Cerrar aviso
                          </button>
                        ) : null}
                      </div>

                      {bulkUpload.phase === "ready" ? (
                        <div className="mt-3 rounded-2xl border border-[#b7cce4] bg-white p-3">
                          <p className="text-xs font-semibold text-[#173b68]">
                            ¿Qué deseas importar?
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Elige una o varias opciones según la columna Roles
                            del archivo. Si un registro dice, por ejemplo,
                            &quot;Conductor, Propietario, Titular&quot;, se
                            importa completo cuando coincida con cualquiera de
                            tus selecciones.
                          </p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-3 text-xs font-semibold text-[#173b68]">
                              Móviles / Conductor (
                              {bulkUpload.categoryCounts.moviles})
                              <input
                                type="checkbox"
                                checked={bulkImportFilters.moviles}
                                onChange={() => toggleBulkImportFilter("moviles")}
                                className="h-4 w-4 accent-[#0b5cab]"
                              />
                            </label>
                            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-3 text-xs font-semibold text-[#173b68]">
                              Propietarios (
                              {bulkUpload.categoryCounts.propietario})
                              <input
                                type="checkbox"
                                checked={bulkImportFilters.propietario}
                                onChange={() =>
                                  toggleBulkImportFilter("propietario")
                                }
                                className="h-4 w-4 accent-[#0b5cab]"
                              />
                            </label>
                            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-3 text-xs font-semibold text-[#173b68]">
                              Titulares ({bulkUpload.categoryCounts.titular})
                              <input
                                type="checkbox"
                                checked={bulkImportFilters.titular}
                                onChange={() => toggleBulkImportFilter("titular")}
                                className="h-4 w-4 accent-[#0b5cab]"
                              />
                            </label>
                          </div>
                          <p className="mt-3 text-xs font-semibold text-[#0b5cab]">
                            Se importarán {filteredBulkRows.length} de{" "}
                            {bulkUpload.categoryCounts.total} registros del
                            archivo.
                          </p>
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={resetBulkUploadStatus}
                              className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={confirmBulkImport}
                              disabled={filteredBulkRows.length === 0}
                              className="inline-flex h-9 items-center justify-center rounded-2xl bg-green-600 px-5 text-xs font-semibold text-white transition hover:bg-green-700 active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Importar selección
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {bulkUpload.phase === "uploading" ||
                      bulkUpload.phase === "success" ||
                      bulkUpload.phase === "error" ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#c5d8eb]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              bulkUpload.phase === "error"
                                ? "bg-red-500"
                                : bulkUpload.phase === "success"
                                  ? "bg-green-600"
                                  : "bg-[#0b5cab]"
                            }`}
                            style={{ width: `${bulkUpload.progress}%` }}
                          />
                        </div>
                      ) : null}

                      {bulkUpload.phase === "uploading" ||
                      bulkUpload.phase === "success" ||
                      bulkUpload.phase === "error" ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {bulkUploadSteps.map((step) => {
                            const status = getBulkStepStatus(step.key);

                            return (
                              <div
                                key={step.key}
                                className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
                                  status === "done"
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : status === "active"
                                      ? "border-blue-200 bg-blue-50 text-[#0b5cab]"
                                      : status === "error"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-[#c5d8eb] bg-white text-slate-400"
                                }`}
                              >
                                {status === "active" ? "● " : null}
                                {status === "done" ? "✓ " : null}
                                {status === "error" ? "✕ " : null}
                                {step.label}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <p
                        className={`mt-3 text-xs font-semibold ${
                          bulkUpload.phase === "success"
                            ? "text-green-700"
                            : bulkUpload.phase === "error"
                              ? "text-red-600"
                              : "text-[#173b68]"
                        }`}
                      >
                        {bulkUpload.detail}
                      </p>

                      {bulkUpload.phase === "ready" &&
                      bulkUpload.rowErrors.length ? (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                          <p className="font-semibold">
                            {bulkUpload.rowErrors.length} fila(s) omitida(s) del
                            archivo (no se importarán):
                          </p>
                          {bulkUpload.rowErrors.slice(0, 3).map((error) => (
                            <p key={error}>{error}</p>
                          ))}
                          {bulkUpload.rowErrors.length > 3 ? (
                            <p>
                              …y más filas sin número de móvil u otros datos.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mb-3 grid gap-2">
                <div className="grid gap-2 lg:grid-cols-[1.4fr_0.7fr_auto_auto] lg:items-end">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-[#173b68]">
                      Buscar registro
                    </span>
                    <input
                      type="search"
                      value={driverOwnerSearch}
                      onChange={(event) =>
                        setDriverOwnerSearch(event.target.value)
                      }
                      className="h-9 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                      placeholder="Ej: 999 o nombre"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-[#173b68]">
                      Estado
                    </span>
                    <select
                      value={activeStatusFilter}
                      onChange={(event) =>
                        setActiveStatusFilter(
                          event.target.value as "todos" | "activo" | "inactivo",
                        )
                      }
                      className="h-9 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    >
                      <option value="todos">Todos</option>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={clearListFilters}
                    className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={resetDriverOwnerForm}
                    className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                  >
                    Nuevo
                  </button>
                </div>

                <div className="rounded-2xl border border-[#b7cce4] bg-white px-3 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs font-semibold text-[#173b68]">
                      Filtrar por turno
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {shiftOptions.map((shift) => (
                        <label
                          key={shift.value}
                          className="flex h-8 items-center gap-2 rounded-full border border-[#b7cce4] bg-[#f8fbff] px-3 text-xs font-semibold text-[#173b68]"
                        >
                          {shift.label}
                          <input
                            type="checkbox"
                            checked={shiftFilters[shift.value]}
                            onChange={() => toggleShiftFilter(shift.value)}
                            className="h-4 w-4 accent-[#0b5cab]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-semibold text-slate-500">
                  Mostrando {filteredDriverOwners.length} de {driverOwners.length}{" "}
                  registros
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#b7cce4] bg-white">
                <div className="grid grid-cols-[0.55fr_1fr_0.9fr_0.8fr_0.55fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                  <span>Móvil</span>
                  <span>Nombre</span>
                  <span>Tipo</span>
                  <span>Turnos</span>
                  <span>Estado</span>
                </div>
                <div className="max-h-[50dvh] overflow-auto divide-y divide-[#c5d8eb]">
                  {filteredDriverOwners.map((driverOwner) => (
                    <button
                      key={driverOwner.id ?? driverOwner.vehicleNumber}
                      type="button"
                      aria-selected={isSelectedDriverOwner(driverOwner)}
                      onClick={() => editDriverOwner(driverOwner)}
                      className={uiListRowClass(
                        isSelectedDriverOwner(driverOwner),
                        "grid w-full grid-cols-[0.55fr_1fr_0.9fr_0.8fr_0.55fr] gap-2 px-3 py-2 text-left text-xs",
                      )}
                    >
                      <strong className="text-[#0f2747]">
                        {driverOwner.vehicleNumber}
                      </strong>
                      <span className="text-[#0f2747]">
                        {driverOwner.fullName}
                      </span>
                      <span className="text-slate-600">
                        {formatPersonTypes(
                          driverOwner.isConductor,
                          driverOwner.isPropietario,
                        )}
                      </span>
                      <span className="text-slate-600">
                        {formatShifts(driverOwner.shifts)}
                      </span>
                      <span
                        className={
                          driverOwner.isActive
                            ? "font-semibold text-green-700"
                            : "font-semibold text-slate-400"
                        }
                      >
                        {driverOwner.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form
              noValidate
              onSubmit={saveDriverOwner}
              className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4"
            >
              <div className="mb-4 border-b border-[#c5d8eb] pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-heading text-base font-semibold text-[#0f2747]">
                      Datos generales
                    </h4>
                    <p className="text-xs text-slate-500">
                      Completa los datos del registro. Puedes marcar conductor y
                      propietario a la vez.
                    </p>
                  </div>
                  {driverOwnerForm.id && driverOwnerForm.isConductor ? (
                    <button
                      type="button"
                      disabled={sendingTempPassword}
                      onClick={sendTemporaryPassword}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68] transition hover:bg-[#eef3f9] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sendingTempPassword ? "Enviando..." : "Clave temporal"}
                    </button>
                  ) : null}
                </div>
                {sendingTempPassword ? (
                  <p className="mt-3 text-xs font-medium text-[#0b5cab]">
                    Enviando clave temporal a {driverOwnerForm.email.trim()}...
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Número de móvil
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={driverOwnerForm.vehicleNumber}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        vehicleNumber: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    placeholder="Ej: 001"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Estado
                  </span>
                  <select
                    value={driverOwnerForm.isActive ? "activo" : "inactivo"}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        isActive: event.target.value === "activo",
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Nombre completo
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.fullName}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        fullName: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Correo
                  </span>
                  <input
                    type="email"
                    value={driverOwnerForm.email}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        email: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    RUT
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.rut}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        rut: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha venc. carnet
                  </span>
                  <input
                    type="date"
                    value={driverOwnerForm.licenseExpiryDate}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        licenseExpiryDate: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha nacimiento
                  </span>
                  <input
                    type="date"
                    value={driverOwnerForm.birthDate}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        birthDate: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Teléfono fijo
                  </span>
                  <input
                    type="tel"
                    value={driverOwnerForm.landlinePhone}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        landlinePhone: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Teléfono móvil
                  </span>
                  <input
                    type="tel"
                    value={driverOwnerForm.mobilePhone}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        mobilePhone: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Dirección
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.address}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        address: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <div className="sm:col-span-2">
                  <span className="mb-2 block text-xs font-semibold text-[#173b68]">
                    Tipo (doble selección)
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68]">
                      Conductor
                      <input
                        type="checkbox"
                        checked={driverOwnerForm.isConductor}
                        onChange={(event) =>
                          setDriverOwnerForm((currentForm) => ({
                            ...currentForm,
                            isConductor: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-[#0b5cab]"
                      />
                    </label>
                    <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68]">
                      Propietario
                      <input
                        type="checkbox"
                        checked={driverOwnerForm.isPropietario}
                        onChange={(event) =>
                          setDriverOwnerForm((currentForm) => ({
                            ...currentForm,
                            isPropietario: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-[#0b5cab]"
                      />
                    </label>
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Licencia municipal
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.municipalLicense}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        municipalLicense: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <div className="sm:col-span-2">
                  <span className="mb-2 block text-xs font-semibold text-[#173b68]">
                    Turnos
                  </span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {shiftOptions.map((shift) => (
                      <label
                        key={shift.value}
                        className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68]"
                      >
                        {shift.label}
                        <input
                          type="checkbox"
                          checked={driverOwnerForm.shifts.includes(shift.value)}
                          onChange={() =>
                            setDriverOwnerForm((currentForm) => ({
                              ...currentForm,
                              shifts: toggleDriverOwnerShift(
                                currentForm.shifts,
                                shift.value,
                              ),
                            }))
                          }
                          className="h-4 w-4 accent-[#0b5cab]"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Nombre contacto emergencia
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.emergencyContactName}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        emergencyContactName: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Correo emergencia
                  </span>
                  <input
                    type="email"
                    value={driverOwnerForm.emergencyContactEmail}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        emergencyContactEmail: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Teléfono emergencia
                  </span>
                  <input
                    type="tel"
                    value={driverOwnerForm.emergencyContactPhone}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        emergencyContactPhone: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Patente
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.licensePlate}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        licensePlate: event.target.value.toUpperCase(),
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Tipo vehículo
                  </span>
                  <input
                    type="text"
                    value={driverOwnerForm.vehicleType}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        vehicleType: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha venc. revisión
                  </span>
                  <input
                    type="date"
                    value={driverOwnerForm.inspectionExpiryDate}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        inspectionExpiryDate: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha suscripción
                  </span>
                  <input
                    type="date"
                    value={driverOwnerForm.subscriptionDate}
                    onChange={(event) =>
                      setDriverOwnerForm((currentForm) => ({
                        ...currentForm,
                        subscriptionDate: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>
              </div>

              {driverOwnerMessage ? (
                <p className="mt-3 text-xs font-semibold text-green-700">
                  {driverOwnerMessage}
                </p>
              ) : null}
              {driverOwnerError ? (
                <p className="mt-3 text-xs font-semibold text-red-600">
                  {driverOwnerError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {driverOwnerForm.id ? (
                  <button
                    type="button"
                    onClick={removeDriverOwner}
                    className="inline-flex h-9 items-center justify-center rounded-2xl bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-700 active:translate-y-px"
                  >
                    Eliminar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={resetDriverOwnerForm}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingDriverOwner}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {driverOwnerForm.id ? "Guardar cambios" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
