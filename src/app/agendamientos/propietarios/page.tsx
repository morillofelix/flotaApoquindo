"use client";

import PropietarioBanksDialog from "@/components/agendamientos/PropietarioBanksDialog";
import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { useObservationPrompt } from "@/hooks/useObservationPrompt";
import { adminFetchInit } from "@/lib/admin-fetch";
import { loadPropietarios, loadPropietarioBanks } from "@/lib/agendamientos-admin";
import {
  displayVehicleNumber,
  downloadPropietariosExcel,
  formatFileSize,
  normalizeVehicleNumber,
  parsePropietariosUploadBuffer,
  type ParsedPropietarioRow,
  type PropietarioConfig,
} from "@/lib/propietarios";
import { isValidEmail } from "@/lib/pago-propietario";
import {
  formatDateLabel,
  formatPropietarioStatusLabel,
  type PropietarioStatus,
} from "@/lib/propietario-status";
import {
  findPropietarioBankForSelection,
  getActivePropietarioBanks,
  type PropietarioBankConfig,
} from "@/lib/propietarios-banks";
import { PROPIETARIO_DEPOSIT_ACCOUNT_TYPES, formatBankRutForDisplay, formatCompanyRutForDisplay, normalizeDepositAccountType } from "@/lib/propietarios-template";
import {
  isDigitOnlySearch,
  matchesTextSearch,
  matchesVehicleNumberSearch,
} from "@/lib/maintainer-search";
import { uiListRowClass } from "@/lib/ui-borders";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PropietarioForm = PropietarioConfig & { id: string };

type BulkUploadPhase =
  | "idle"
  | "ready"
  | "reading"
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
  parsedRows: ParsedPropietarioRow[];
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
};

const bulkUploadSteps = [
  { key: "reading", label: "Leyendo archivo" },
  { key: "validating", label: "Validando datos" },
  { key: "uploading", label: "Importando registros" },
] as const;

const emptyPropietarioForm: PropietarioForm = {
  id: "",
  vehicleNumber: "",
  fullName: "",
  firstName: "",
  lastName: "",
  secondLastName: "",
  rut: "",
  email: "",
  landlinePhone: "",
  mobilePhone: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  bankName: "",
  bankAccount: "",
  accountHolder: "",
  titularRut: "",
  titularEmail: "",
  titularBankName: "",
  titularBankAccount: "",
  bankBic: "",
  paymentMethod: "",
  paymentDay: "",
  notes: "",
  branchOffice: "",
  area: "",
  costCenter: "",
  accountingAccount: "",
  isVip: false,
  gender: "",
  recordStatus: "V",
  licenseExpiryDate: "",
  birthDate: "",
  incorporationDate: "",
  deactivationDate: "",
  emergencyContactName: "",
  emergencyContactEmail: "",
  emergencyContactPhone: "",
  isActive: true,
  status: "activo",
  inactiveReason: "",
  activationReason: "",
  desvinculacionReason: "",
  desvinculacionDays: 0,
  desvinculadoUntil: "",
};

function getPropietarioRecordStatus(
  propietario: Pick<PropietarioConfig, "status" | "isActive">,
): PropietarioStatus {
  if (propietario.status) {
    return propietario.status;
  }

  return propietario.isActive ? "activo" : "inactivo";
}

function statusBadgeClassName(status: PropietarioStatus) {
  if (status === "activo") {
    return "font-semibold text-green-700";
  }

  if (status === "desvinculado") {
    return "font-semibold text-amber-700";
  }

  return "font-semibold text-slate-400";
}

function statusSelectClassName(status: PropietarioStatus) {
  if (status === "inactivo") {
    return "border-amber-400 bg-amber-50 font-semibold text-amber-950";
  }

  if (status === "desvinculado") {
    return "border-orange-400 bg-orange-50 font-semibold text-orange-950";
  }

  return "";
}

const inputClassName =
  "h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

const labelClassName = "text-xs font-semibold text-[#173b68]";

function RequiredMark() {
  return (
    <span className="ml-0.5 font-bold text-red-600" aria-hidden="true">
      *
    </span>
  );
}

function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className={labelClassName}>
      {children}
      {required ? <RequiredMark /> : null}
    </span>
  );
}

export default function PropietariosPage() {
  const { confirm, dialog } = useConfirmAction();
  const { promptObservation, dialog: observationDialog } =
    useObservationPrompt();
  const [propietarios, setPropietarios] = useState<PropietarioConfig[]>([]);
  const [propietarioForm, setPropietarioForm] =
    useState<PropietarioForm>(emptyPropietarioForm);
  const [propietarioFormMode, setPropietarioFormMode] = useState<
    "create" | "edit"
  >("create");
  const [propietarioSearch, setPropietarioSearch] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    "todos" | PropietarioStatus
  >("todos");
  const [depositAccountFilter, setDepositAccountFilter] = useState<
    "todos" | (typeof PROPIETARIO_DEPOSIT_ACCOUNT_TYPES)[number]
  >("todos");
  const [bankNameFilter, setBankNameFilter] = useState("todos");
  const [propietarioBanks, setPropietarioBanks] = useState<PropietarioBankConfig[]>(
    [],
  );
  const [isBanksDialogOpen, setIsBanksDialogOpen] = useState(false);
  const [propietarioMessage, setPropietarioMessage] = useState("");
  const [propietarioError, setPropietarioError] = useState("");
  const [isSavingPropietario, setIsSavingPropietario] = useState(false);
  const [highlightInactiveReason, setHighlightInactiveReason] = useState(false);
  const [highlightDesvinculacionReason, setHighlightDesvinculacionReason] =
    useState(false);
  const inactiveReasonRef = useRef<HTMLDivElement>(null);
  const desvinculacionReasonRef = useRef<HTMLDivElement>(null);
  const accountHolderManuallyEditedRef = useRef(false);
  const titularRutManuallyEditedRef = useRef(false);
  const [bulkUpload, setBulkUpload] = useState<BulkUploadState>(emptyBulkUploadState);

  const reloadPropietariosData = useCallback(async () => {
    const [loadedPropietarios, loadedBanks] = await Promise.all([
      loadPropietarios(),
      loadPropietarioBanks(),
    ]);

    setPropietarios(loadedPropietarios);
    setPropietarioBanks(loadedBanks);
    setPropietarioError("");
  }, []);

  const {
    refresh: refreshPropietariosData,
    isRefreshing,
    lastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: reloadPropietariosData,
    pause: isSavingPropietario,
  });

  useEffect(() => {
    reloadPropietariosData().catch(() =>
      setPropietarioError("No se pudieron cargar los propietarios."),
    );
  }, [reloadPropietariosData]);

  const activePropietarioBanks = useMemo(
    () => getActivePropietarioBanks(propietarioBanks),
    [propietarioBanks],
  );

  const availableBankNames = useMemo(() => {
    if (propietarioBanks.length > 0) {
      return propietarioBanks.map((bank) => bank.name);
    }

    const names = new Set<string>();

    for (const propietario of propietarios) {
      const bankName = propietario.bankName.trim();

      if (bankName) {
        names.add(bankName);
      }
    }

    return Array.from(names).sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );
  }, [propietarioBanks, propietarios]);

  const selectedBankId = useMemo(() => {
    return (
      findPropietarioBankForSelection(
        propietarioBanks,
        propietarioForm.bankName,
        propietarioForm.bankBic,
      )?.id ?? ""
    );
  }, [propietarioBanks, propietarioForm.bankBic, propietarioForm.bankName]);

  const hasUncataloguedBank =
    Boolean(propietarioForm.bankName.trim()) && !selectedBankId;

  const filteredPropietarios = useMemo(() => {
    const normalizedSearch = propietarioSearch.trim();
    const normalizedSearchLower = normalizedSearch.toLowerCase();
    const digitOnlySearch = isDigitOnlySearch(normalizedSearch);

    return propietarios.filter((propietario) => {
      const matchesSearch =
        !normalizedSearch ||
        (digitOnlySearch
          ? matchesVehicleNumberSearch(
              propietario.vehicleNumber,
              normalizedSearch,
            )
          :         matchesTextSearch(propietario.fullName, normalizedSearchLower) ||
            matchesTextSearch(propietario.rut, normalizedSearchLower) ||
            matchesTextSearch(propietario.email, normalizedSearchLower) ||
            matchesTextSearch(propietario.bankName, normalizedSearchLower) ||
            matchesTextSearch(propietario.accountHolder, normalizedSearchLower) ||
            matchesTextSearch(propietario.bankAccount, normalizedSearchLower));

      const recordStatus = getPropietarioRecordStatus(propietario);
      const matchesActiveStatus =
        activeStatusFilter === "todos" || recordStatus === activeStatusFilter;

      const matchesDepositAccount =
        depositAccountFilter === "todos" ||
        normalizeDepositAccountType(propietario.paymentMethod) ===
          depositAccountFilter;

      const matchesBankName =
        bankNameFilter === "todos" ||
        propietario.bankName.trim() === bankNameFilter;

      return (
        matchesSearch &&
        matchesActiveStatus &&
        matchesDepositAccount &&
        matchesBankName
      );
    });
  }, [
    activeStatusFilter,
    bankNameFilter,
    depositAccountFilter,
    propietarioSearch,
    propietarios,
  ]);

  const hasListFilters =
    propietarioSearch.trim().length > 0 ||
    activeStatusFilter !== "todos" ||
    depositAccountFilter !== "todos" ||
    bankNameFilter !== "todos";

  function isSelectedPropietario(propietario: PropietarioConfig) {
    if (propietarioForm.id && propietario.id) {
      return propietarioForm.id === propietario.id;
    }

    return false;
  }

  function resetPropietarioFormSyncFlags(propietario?: PropietarioConfig) {
    if (!propietario) {
      accountHolderManuallyEditedRef.current = false;
      titularRutManuallyEditedRef.current = false;
      return;
    }

    const fullName = propietario.fullName.trim();
    const accountHolder = propietario.accountHolder.trim();
    const bankRut = formatBankRutForDisplay(propietario.titularRut);
    const companyRut = formatBankRutForDisplay(propietario.rut);

    accountHolderManuallyEditedRef.current =
      accountHolder.length > 0 && accountHolder !== fullName;
    titularRutManuallyEditedRef.current =
      bankRut.length > 0 && bankRut !== companyRut;
  }

  const isCreatingPropietario = propietarioFormMode === "create";

  function editPropietario(propietario: PropietarioConfig) {
    setPropietarioFormMode("edit");
    setPropietarioForm({
      id: propietario.id ?? "",
      ...propietario,
      rut: formatCompanyRutForDisplay(propietario.rut),
      titularRut: formatBankRutForDisplay(propietario.titularRut),
    });
    resetPropietarioFormSyncFlags(propietario);
    const recordStatus = getPropietarioRecordStatus(propietario);
    setHighlightInactiveReason(recordStatus === "inactivo");
    setHighlightDesvinculacionReason(recordStatus === "desvinculado");
    setPropietarioMessage("");
    setPropietarioError("");
  }

  function resetPropietarioForm() {
    setPropietarioFormMode("create");
    setPropietarioForm(emptyPropietarioForm);
    resetPropietarioFormSyncFlags();
    setHighlightInactiveReason(false);
    setHighlightDesvinculacionReason(false);
    setPropietarioMessage("");
    setPropietarioError("");
  }

  function downloadVisiblePropietarios() {
    const fileName = hasListFilters
      ? "propietarios-filtrados.xls"
      : "propietarios.xls";

    downloadPropietariosExcel(filteredPropietarios, fileName);
  }

  async function handleBulkFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPropietarioMessage("");
    setPropietarioError("");
    setBulkUpload({
      ...emptyBulkUploadState,
      phase: "reading",
      fileName: file.name,
      fileSize: file.size,
      detail: "Leyendo el archivo seleccionado...",
      progress: 20,
    });

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePropietariosUploadBuffer(file.name, buffer);

      if (!parsed.rows.length) {
        throw new Error(
          parsed.errors[0] ?? "El archivo no tiene filas válidas para importar.",
        );
      }

      setBulkUpload({
        phase: "ready",
        fileName: file.name,
        fileSize: file.size,
        detail: `Archivo listo. Se encontraron ${parsed.rows.length} propietarios válidos.`,
        progress: 0,
        importedCount: 0,
        rowErrors: parsed.errors.slice(0, 5),
        parsedRows: parsed.rows,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo leer el archivo.";

      setBulkUpload({
        ...emptyBulkUploadState,
        phase: "error",
        fileName: file.name,
        fileSize: file.size,
        detail: message,
        progress: 100,
      });
      setPropietarioError(message);
    } finally {
      event.target.value = "";
    }
  }

  async function confirmBulkImport() {
    if (!bulkUpload.parsedRows.length) {
      return;
    }

    const confirmed = await confirm({
      title: "Importar propietarios",
      message: `¿Importar ${bulkUpload.parsedRows.length} registros y reemplazar toda la base actual?`,
      detail: "La carga masiva reemplaza por completo los propietarios existentes.",
      confirmLabel: "Sí, importar",
      tone: "danger",
    });

    if (!confirmed) {
      return;
    }

    setBulkUpload((currentState) => ({
      ...currentState,
      phase: "uploading",
      detail: `Importando ${bulkUpload.parsedRows.length} registros...`,
      progress: 70,
    }));

    try {
      const response = await fetch("/api/propietarios/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: adminFetchInit.credentials,
        body: JSON.stringify({ rows: bulkUpload.parsedRows }),
      });

      const data = (await response.json()) as {
        message?: string;
        detail?: string;
        summary?: { imported?: number; total?: number };
        errors?: string[];
        propietarios?: PropietarioConfig[];
        notificationSent?: boolean;
      };

      if (!response.ok) {
        const detail = data.detail ?? data.errors?.[0];
        throw new Error(
          detail
            ? `${data.message ?? "No se pudo importar el archivo."} ${detail}`
            : data.message ?? "No se pudo importar el archivo. Verifica el formato.",
        );
      }

      const importedCount =
        data.summary?.imported ?? data.summary?.total ?? bulkUpload.parsedRows.length;
      const notificationNote = data.notificationSent
        ? " Se notificó la carga masiva por correo."
        : "";

      setPropietarios(data.propietarios ?? []);
      setBulkUpload((currentState) => ({
        ...currentState,
        phase: "success",
        detail: `¡Su carga fue exitosa! Se importaron ${importedCount} propietarios y se reemplazó la base anterior.${notificationNote}`,
        progress: 100,
        importedCount,
      }));
      setPropietarioMessage(
        data.notificationSent
          ? `Carga masiva exitosa: ${importedCount} propietarios importados. Se envió la notificación por correo.`
          : `Carga masiva exitosa: ${importedCount} propietarios importados.`,
      );

      if (data.errors?.length) {
        setPropietarioError(
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
      setPropietarioError(message);
    }
  }

  function resetBulkUploadStatus() {
    setBulkUpload(emptyBulkUploadState);
  }

  function getBulkStepStatus(stepKey: (typeof bulkUploadSteps)[number]["key"]) {
    const thresholds = { reading: 35, validating: 65, uploading: 100 };

    if (bulkUpload.phase === "success") {
      return "success";
    }

    if (bulkUpload.phase === "error") {
      return bulkUpload.progress <= thresholds.reading
        ? stepKey === "reading"
          ? "error"
          : "pending"
        : bulkUpload.progress <= thresholds.validating
          ? ["reading", "validating"].includes(stepKey)
            ? stepKey === "validating"
              ? "error"
              : "success"
            : "pending"
          : "error";
    }

    if (bulkUpload.phase === "idle") {
      return "pending";
    }

    if (bulkUpload.phase === "ready") {
      return stepKey === "reading" || stepKey === "validating"
        ? "success"
        : "pending";
    }

    return bulkUpload.progress <= thresholds.reading
      ? stepKey === "reading"
        ? "active"
        : "pending"
      : bulkUpload.progress <= thresholds.validating
        ? stepKey === "reading"
          ? "success"
          : stepKey === "validating"
            ? "active"
            : "pending"
        : stepKey === "uploading"
          ? "active"
          : stepKey === "reading" || stepKey === "validating"
            ? "success"
            : "pending";
  }

  async function savePropietario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPropietarioMessage("");
    setPropietarioError("");

    if (propietarioForm.fullName.trim().length < 3) {
      setPropietarioError("Ingresa una razón social válida.");
      return;
    }

    const isCreatingPropietario = propietarioFormMode === "create";

    if (isCreatingPropietario) {
      if (!normalizeVehicleNumber(propietarioForm.vehicleNumber)) {
        setPropietarioError("Ingresa un número de móvil válido.");
        return;
      }

      const email = propietarioForm.email.trim();

      if (!email) {
        setPropietarioError("Ingresa un correo electrónico.");
        return;
      }

      if (!isValidEmail(email)) {
        setPropietarioError("Ingresa un correo electrónico válido.");
        return;
      }
    }

    const formStatus = getPropietarioRecordStatus(propietarioForm);

    if (formStatus === "inactivo") {
      const inactiveReason = (propietarioForm.inactiveReason ?? "").trim();

      if (inactiveReason.length < 5) {
        setHighlightInactiveReason(true);
        setPropietarioError(
          "Completa el motivo de inactivación en el recuadro destacado antes de guardar.",
        );
        inactiveReasonRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
    }

    if (formStatus === "desvinculado") {
      const desvinculacionReason = (propietarioForm.desvinculacionReason ?? "").trim();
      const desvinculacionDays = Number(propietarioForm.desvinculacionDays ?? 0);

      if (desvinculacionReason.length < 5 || desvinculacionDays < 1) {
        setHighlightDesvinculacionReason(true);
        setPropietarioError(
          "Completa el motivo y la duración en días de la desvinculación antes de guardar.",
        );
        desvinculacionReasonRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
    }

    setIsSavingPropietario(true);
    const wasEditingPropietario = propietarioFormMode === "edit";

    try {
      const payload = {
        ...propietarioForm,
        status: formStatus,
        isActive: formStatus === "activo",
        rut: formatCompanyRutForDisplay(propietarioForm.rut),
        titularRut: formatBankRutForDisplay(propietarioForm.titularRut),
      };

      const response = await fetch("/api/propietarios", {
        method: propietarioForm.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: adminFetchInit.credentials,
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        message?: string;
        notificationSent?: boolean;
        changesDetected?: number;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo guardar el registro.");
      }

      const loadedPropietarios = await loadPropietarios();
      setPropietarios(loadedPropietarios);
      resetPropietarioForm();

      if (data.notificationSent) {
        setPropietarioMessage(
          "Registro guardado correctamente. Se envió la notificación por correo.",
        );
      } else if (wasEditingPropietario && (data.changesDetected ?? 0) > 0) {
        setPropietarioMessage(
          "Registro guardado. No se pudo confirmar el envío del correo de notificación.",
        );
      } else if (!wasEditingPropietario) {
        setPropietarioMessage(
          "Registro guardado. No se pudo confirmar el envío del correo de notificación.",
        );
      } else {
        setPropietarioMessage("Registro guardado correctamente.");
      }
    } catch (error) {
      setPropietarioError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el registro.",
      );
    } finally {
      setIsSavingPropietario(false);
    }
  }

  function updateFormField<K extends keyof PropietarioForm>(
    field: K,
    value: PropietarioForm[K],
  ) {
    setPropietarioForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function handleRutChange(value: string) {
    const sanitized = value.replace(/[^\d.kK\-]/g, "");
    const formattedRut = formatCompanyRutForDisplay(sanitized);
    const bankRut = formatBankRutForDisplay(formattedRut);

    setPropietarioForm((currentForm) => ({
      ...currentForm,
      rut: formattedRut,
      titularRut: titularRutManuallyEditedRef.current
        ? currentForm.titularRut
        : bankRut,
    }));
  }

  function handleRutBlur() {
    setPropietarioForm((currentForm) => {
      const formattedRut = formatCompanyRutForDisplay(currentForm.rut);
      const bankRut = formatBankRutForDisplay(formattedRut);

      if (formattedRut === currentForm.rut && bankRut === currentForm.titularRut) {
        return currentForm;
      }

      return {
        ...currentForm,
        rut: formattedRut,
        titularRut: titularRutManuallyEditedRef.current
          ? currentForm.titularRut
          : bankRut,
      };
    });
  }

  function handleFullNameChange(value: string) {
    setPropietarioForm((currentForm) => ({
      ...currentForm,
      fullName: value,
      accountHolder: accountHolderManuallyEditedRef.current
        ? currentForm.accountHolder
        : value,
    }));
  }

  function handleAccountHolderChange(value: string) {
    accountHolderManuallyEditedRef.current = true;
    updateFormField("accountHolder", value);
  }

  function handleTitularRutChange(value: string) {
    titularRutManuallyEditedRef.current = true;
    updateFormField("titularRut", formatBankRutForDisplay(value));
  }

  async function openBanksDialog() {
    try {
      const loaded = await loadPropietarioBanks();
      setPropietarioBanks(loaded);
      setIsBanksDialogOpen(true);
    } catch {
      setPropietarioError("No se pudieron cargar los bancos.");
    }
  }

  function handleBankSelection(bankId: string) {
    if (!bankId) {
      setPropietarioForm((currentForm) => ({
        ...currentForm,
        bankName: "",
        bankBic: "",
      }));
      return;
    }

    const bank = propietarioBanks.find((item) => item.id === bankId);

    if (!bank) {
      return;
    }

    setPropietarioForm((currentForm) => ({
      ...currentForm,
      bankName: bank.name,
      bankBic: bank.bankBic,
    }));
  }

  async function handleStatusChange(nextStatus: PropietarioStatus) {
    const currentStatus = getPropietarioRecordStatus(propietarioForm);

    if (nextStatus === currentStatus) {
      return;
    }

    if (nextStatus === "activo") {
      if (propietarioFormMode === "edit") {
        const activationReason = await promptObservation({
          title: "Activar propietario",
          message:
            "Indica el motivo de la activación o reactivación. Se notificará por correo.",
          detail: propietarioForm.fullName,
          confirmLabel: "Activar",
          placeholder: "Ej.: fin de suspensión, regularización documental, etc.",
        });

        if (!activationReason) {
          return;
        }

        setHighlightInactiveReason(false);
        setHighlightDesvinculacionReason(false);
        setPropietarioForm((currentForm) => ({
          ...currentForm,
          status: "activo",
          isActive: true,
          inactiveReason: "",
          desvinculacionReason: "",
          desvinculacionDays: 0,
          desvinculadoUntil: "",
          activationReason,
        }));
        return;
      }

      setHighlightInactiveReason(false);
      setHighlightDesvinculacionReason(false);
      setPropietarioForm((currentForm) => ({
        ...currentForm,
        status: "activo",
        isActive: true,
        inactiveReason: "",
        desvinculacionReason: "",
        desvinculacionDays: 0,
        desvinculadoUntil: "",
        activationReason: "",
      }));
      return;
    }

    if (nextStatus === "inactivo") {
      setPropietarioForm((currentForm) => ({
        ...currentForm,
        status: "inactivo",
        isActive: false,
        activationReason: "",
        desvinculacionReason: "",
        desvinculacionDays: 0,
        desvinculadoUntil: "",
      }));
      setHighlightInactiveReason(true);
      setHighlightDesvinculacionReason(false);

      requestAnimationFrame(() => {
        inactiveReasonRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      return;
    }

    setPropietarioForm((currentForm) => ({
      ...currentForm,
      status: "desvinculado",
      isActive: false,
      activationReason: "",
      inactiveReason: "",
      desvinculacionDays:
        currentForm.desvinculacionDays && currentForm.desvinculacionDays > 0
          ? currentForm.desvinculacionDays
          : 1,
    }));
    setHighlightInactiveReason(false);
    setHighlightDesvinculacionReason(true);

    requestAnimationFrame(() => {
      desvinculacionReasonRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  const formStatus = getPropietarioRecordStatus(propietarioForm);

  const inactiveReasonIsInvalid = useMemo(() => {
    if (formStatus !== "inactivo") {
      return false;
    }

    return (propietarioForm.inactiveReason ?? "").trim().length < 5;
  }, [formStatus, propietarioForm.inactiveReason]);

  const desvinculacionReasonIsInvalid = useMemo(() => {
    if (formStatus !== "desvinculado") {
      return false;
    }

    return (propietarioForm.desvinculacionReason ?? "").trim().length < 5;
  }, [formStatus, propietarioForm.desvinculacionReason]);

  const desvinculacionDaysIsInvalid = useMemo(() => {
    if (formStatus !== "desvinculado") {
      return false;
    }

    return Number(propietarioForm.desvinculacionDays ?? 0) < 1;
  }, [formStatus, propietarioForm.desvinculacionDays]);

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Propietarios"
          onRefresh={() => void refreshPropietariosData()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          actions={
            <button
              type="button"
              onClick={openBanksDialog}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#0b5cab] px-4 text-xs font-semibold text-white shadow-sm shadow-[#0b5cab]/25 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              Banco
            </button>
          }
        />

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
                        Sube la plantilla CUENTAS BANCARIAS (10 columnas) en XLS, CSV o
                        SLK. La carga reemplaza por completo la base de propietarios e
                        importa todas las filas del archivo.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={downloadVisiblePropietarios}
                        disabled={filteredPropietarios.length === 0}
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
                          accept=".csv,.txt,.slk,.xls,.xlsx,text/csv,application/vnd.ms-excel"
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
                            Listo para importar
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Se importarán {bulkUpload.parsedRows.length} registros
                            y se reemplazará la base actual completa.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={resetBulkUploadStatus}
                              className="inline-flex h-8 items-center justify-center rounded-full border border-[#9fb8d9] bg-white px-3 text-[11px] font-semibold text-[#173b68]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={confirmBulkImport}
                              className="inline-flex h-8 items-center justify-center rounded-full bg-[#0b5cab] px-3 text-[11px] font-semibold text-white transition hover:bg-[#084a8c]"
                            >
                              Importar todo
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 space-y-2">
                        {bulkUploadSteps.map((step) => {
                          const status = getBulkStepStatus(step.key);

                          return (
                            <div
                              key={step.key}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span
                                className={
                                  status === "success"
                                    ? "text-green-600"
                                    : status === "error"
                                      ? "text-red-600"
                                      : status === "active"
                                        ? "text-[#0b5cab]"
                                        : "text-slate-400"
                                }
                              >
                                {status === "success"
                                  ? "✓"
                                  : status === "error"
                                    ? "✕"
                                    : status === "active"
                                      ? "…"
                                      : "○"}
                              </span>
                              <span className="font-medium text-[#0f2747]">
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {bulkUpload.detail ? (
                        <p
                          className={`mt-3 text-xs font-semibold ${
                            bulkUpload.phase === "error"
                              ? "text-red-600"
                              : bulkUpload.phase === "success"
                                ? "text-green-700"
                                : "text-[#0b5cab]"
                          }`}
                        >
                          {bulkUpload.detail}
                        </p>
                      ) : null}

                      {bulkUpload.rowErrors.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-amber-700">
                          {bulkUpload.rowErrors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[#b7cce4] bg-white p-3">
                <div className="mb-3 flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClassName}>Buscar registro</span>
                    <input
                      type="search"
                      value={propietarioSearch}
                      onChange={(event) => setPropietarioSearch(event.target.value)}
                      placeholder="Razón social, RUT, móvil o cuenta..."
                      className={inputClassName}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="flex flex-col gap-1.5">
                      <span className={labelClassName}>Estado</span>
                      <select
                        value={activeStatusFilter}
                        onChange={(event) =>
                          setActiveStatusFilter(
                            event.target.value as "todos" | PropietarioStatus,
                          )
                        }
                        className={inputClassName}
                      >
                        <option value="todos">Todos</option>
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                        <option value="desvinculado">Desvinculado</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={labelClassName}>Cta depósito</span>
                      <select
                        value={depositAccountFilter}
                        onChange={(event) =>
                          setDepositAccountFilter(
                            event.target.value as
                              | "todos"
                              | (typeof PROPIETARIO_DEPOSIT_ACCOUNT_TYPES)[number],
                          )
                        }
                        className={inputClassName}
                      >
                        <option value="todos">Todas</option>
                        {PROPIETARIO_DEPOSIT_ACCOUNT_TYPES.map((accountType) => (
                          <option key={accountType} value={accountType}>
                            {accountType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={labelClassName}>Nombre banco</span>
                      <select
                        value={bankNameFilter}
                        onChange={(event) => setBankNameFilter(event.target.value)}
                        className={inputClassName}
                      >
                        <option value="todos">Todos</option>
                        {availableBankNames.map((bankName) => (
                          <option key={bankName} value={bankName}>
                            {bankName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <p className="mb-2 text-[11px] text-slate-500">
                  {filteredPropietarios.length} de {propietarios.length} registros
                </p>

                <div className="overflow-hidden rounded-2xl border border-[#b7cce4]">
                  <div className="grid grid-cols-[0.45fr_1fr_0.7fr_0.55fr] gap-2 bg-[#eef4fb] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#173b68]">
                    <span>Móvil</span>
                    <span>Razón social</span>
                    <span>RUT</span>
                    <span>Estado</span>
                  </div>
                  <div className="max-h-[50dvh] overflow-auto divide-y divide-[#c5d8eb]">
                    {filteredPropietarios.map((propietario) => (
                      <button
                        key={propietario.id}
                        type="button"
                        onClick={() => editPropietario(propietario)}
                        className={uiListRowClass(
                          isSelectedPropietario(propietario),
                          "grid w-full grid-cols-[0.45fr_1fr_0.7fr_0.55fr] gap-2 px-3 py-2 text-left text-xs",
                        )}
                      >
                        <strong className="text-[#0f2747]">
                          {displayVehicleNumber(propietario.vehicleNumber)}
                        </strong>
                        <span className="text-[#0f2747]">
                          {propietario.fullName}
                        </span>
                        <span className="text-slate-600">{propietario.rut}</span>
                        <span
                          className={statusBadgeClassName(
                            getPropietarioRecordStatus(propietario),
                          )}
                        >
                          {formatPropietarioStatusLabel(
                            getPropietarioRecordStatus(propietario),
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <form
              noValidate
              onSubmit={savePropietario}
              className="max-h-[85vh] overflow-y-auto rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4"
            >
              <div className="mb-4 border-b border-[#c5d8eb] pb-3">
                <h4 className="font-heading text-base font-semibold text-[#0f2747]">
                  Información de empresa
                </h4>
                <p className="text-xs text-slate-500">
                  Datos principales según la plantilla CUENTAS BANCARIAS.
                </p>
                {isCreatingPropietario ? (
                  <p className="mt-2 text-xs text-slate-600">
                    Los campos marcados con{" "}
                    <span className="font-bold text-red-600">*</span> son
                    obligatorios.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>RUT.-</FieldLabel>
                  <input
                    type="text"
                    inputMode="text"
                    value={propietarioForm.rut}
                    onChange={(event) => handleRutChange(event.target.value)}
                    onBlur={handleRutBlur}
                    className={inputClassName}
                    placeholder="12.345.678-9"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Estado</FieldLabel>
                  <select
                    value={formStatus}
                    onChange={(event) =>
                      void handleStatusChange(event.target.value as PropietarioStatus)
                    }
                    className={`${inputClassName} ${statusSelectClassName(formStatus)}`}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="desvinculado">Desvinculado</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <FieldLabel required={isCreatingPropietario}>Móvil</FieldLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={propietarioForm.vehicleNumber}
                    onChange={(event) =>
                      updateFormField("vehicleNumber", event.target.value)
                    }
                    className={inputClassName}
                    required={isCreatingPropietario}
                    aria-required={isCreatingPropietario}
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <FieldLabel required={isCreatingPropietario}>
                    Razón Social
                  </FieldLabel>
                  <input
                    type="text"
                    value={propietarioForm.fullName}
                    onChange={(event) => handleFullNameChange(event.target.value)}
                    className={inputClassName}
                    required={isCreatingPropietario}
                    aria-required={isCreatingPropietario}
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <FieldLabel required={isCreatingPropietario}>Correo</FieldLabel>
                  <input
                    type="email"
                    value={propietarioForm.email}
                    onChange={(event) =>
                      updateFormField("email", event.target.value)
                    }
                    className={inputClassName}
                    required={isCreatingPropietario}
                    aria-required={isCreatingPropietario}
                  />
                </label>

                {formStatus === "inactivo" ? (
                  <div
                    ref={inactiveReasonRef}
                    className={`sm:col-span-2 rounded-[20px] border-2 px-4 py-4 transition-all duration-300 ${
                      highlightInactiveReason && inactiveReasonIsInvalid
                        ? "animate-pulse border-red-400 bg-gradient-to-br from-red-50 to-amber-50 shadow-lg shadow-red-100 ring-2 ring-red-200/70"
                        : "border-amber-400 bg-gradient-to-br from-amber-50 via-white to-orange-50/80 shadow-md shadow-amber-100/80"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-sm ${
                          highlightInactiveReason && inactiveReasonIsInvalid
                            ? "bg-red-500"
                            : "bg-amber-500"
                        }`}
                      >
                        !
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-heading text-sm font-bold tracking-tight text-amber-950">
                          Motivo de inactivación
                          <span className="ml-1 text-red-600">*</span>
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-900/85">
                          Este campo es obligatorio para inactivar el convenio.
                          Describe brevemente el motivo antes de guardar.
                        </p>
                        <textarea
                          value={propietarioForm.inactiveReason}
                          onChange={(event) => {
                            updateFormField("inactiveReason", event.target.value);

                            if (event.target.value.trim().length >= 5) {
                              setHighlightInactiveReason(false);
                              setPropietarioError("");
                            }
                          }}
                          rows={4}
                          placeholder="Ej.: término de convenio, cambio de titular, solicitud del propietario..."
                          className={`mt-3 w-full rounded-2xl border-2 bg-white px-3 py-2.5 text-sm text-[#0f2747] shadow-inner outline-none transition focus:ring-2 ${
                            highlightInactiveReason && inactiveReasonIsInvalid
                              ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                              : "border-amber-300 focus:border-[#0b5cab] focus:ring-[#0b5cab]/20"
                          }`}
                        />
                        <p
                          className={`mt-2 text-[11px] font-semibold ${
                            highlightInactiveReason && inactiveReasonIsInvalid
                              ? "text-red-600"
                              : "text-amber-800"
                          }`}
                        >
                          {highlightInactiveReason && inactiveReasonIsInvalid
                            ? "Ingresa al menos 5 caracteres para poder guardar."
                            : "Mínimo 5 caracteres · obligatorio"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {formStatus === "desvinculado" ? (
                  <div
                    ref={desvinculacionReasonRef}
                    className={`sm:col-span-2 rounded-[20px] border-2 px-4 py-4 transition-all duration-300 ${
                      highlightDesvinculacionReason &&
                      (desvinculacionReasonIsInvalid || desvinculacionDaysIsInvalid)
                        ? "animate-pulse border-red-400 bg-gradient-to-br from-red-50 to-orange-50 shadow-lg shadow-red-100 ring-2 ring-red-200/70"
                        : "border-orange-400 bg-gradient-to-br from-orange-50 via-white to-amber-50/80 shadow-md shadow-orange-100/80"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-sm ${
                          highlightDesvinculacionReason &&
                          (desvinculacionReasonIsInvalid || desvinculacionDaysIsInvalid)
                            ? "bg-red-500"
                            : "bg-orange-500"
                        }`}
                      >
                        !
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-heading text-sm font-bold tracking-tight text-orange-950">
                          Desvinculación temporal
                          <span className="ml-1 text-red-600">*</span>
                        </p>
                        <p className="mt-1 text-xs leading-5 text-orange-900/85">
                          Indica el motivo y cuántos días durará la desvinculación.
                          Al vencer el plazo, el registro volverá automáticamente a
                          activo y se notificará por correo.
                        </p>
                        {propietarioForm.desvinculadoUntil ? (
                          <p className="mt-2 text-xs font-semibold text-orange-800">
                            Vigente hasta:{" "}
                            {formatDateLabel(propietarioForm.desvinculadoUntil)}
                          </p>
                        ) : null}
                        <textarea
                          value={propietarioForm.desvinculacionReason}
                          onChange={(event) => {
                            updateFormField("desvinculacionReason", event.target.value);

                            if (event.target.value.trim().length >= 5) {
                              setHighlightDesvinculacionReason(false);
                              setPropietarioError("");
                            }
                          }}
                          rows={4}
                          placeholder="Ej.: incumplimiento temporal, revisión contractual, suspensión operativa..."
                          className={`mt-3 w-full rounded-2xl border-2 bg-white px-3 py-2.5 text-sm text-[#0f2747] shadow-inner outline-none transition focus:ring-2 ${
                            highlightDesvinculacionReason && desvinculacionReasonIsInvalid
                              ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                              : "border-orange-300 focus:border-[#0b5cab] focus:ring-[#0b5cab]/20"
                          }`}
                        />
                        <label className="mt-3 flex flex-col gap-1.5">
                          <span className="text-xs font-semibold text-orange-950">
                            Duración en días
                            <span className="ml-1 text-red-600">*</span>
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={
                              propietarioForm.desvinculacionDays > 0
                                ? propietarioForm.desvinculacionDays
                                : ""
                            }
                            onChange={(event) => {
                              const parsed = Number.parseInt(event.target.value, 10);
                              updateFormField(
                                "desvinculacionDays",
                                Number.isFinite(parsed) ? parsed : 0,
                              );

                              if (parsed >= 1) {
                                setHighlightDesvinculacionReason(false);
                                setPropietarioError("");
                              }
                            }}
                            className={`${inputClassName} ${
                              highlightDesvinculacionReason && desvinculacionDaysIsInvalid
                                ? "border-red-400"
                                : ""
                            }`}
                            placeholder="Ej.: 30"
                          />
                        </label>
                        <p
                          className={`mt-2 text-[11px] font-semibold ${
                            highlightDesvinculacionReason &&
                            (desvinculacionReasonIsInvalid || desvinculacionDaysIsInvalid)
                              ? "text-red-600"
                              : "text-orange-800"
                          }`}
                        >
                          {highlightDesvinculacionReason &&
                          (desvinculacionReasonIsInvalid || desvinculacionDaysIsInvalid)
                            ? "Completa motivo (mín. 5 caracteres) y duración (mín. 1 día)."
                            : "Motivo mín. 5 caracteres · duración mín. 1 día"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 mb-3 border-b border-[#c5d8eb] pb-3">
                <h4 className="font-heading text-sm font-semibold text-[#0f2747]">
                  Dato informacional
                </h4>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClassName}>Cta Depósito</span>
                  <select
                    value={propietarioForm.paymentMethod}
                    onChange={(event) =>
                      updateFormField("paymentMethod", event.target.value)
                    }
                    className={inputClassName}
                  >
                    <option value="">—</option>
                    {PROPIETARIO_DEPOSIT_ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClassName}>RUT BANCO</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={propietarioForm.titularRut}
                    onChange={(event) =>
                      handleTitularRutChange(event.target.value)
                    }
                    className={inputClassName}
                    placeholder="Solo dígitos"
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={labelClassName}>NOMBRE CUENTA BANCARIA</span>
                  <input
                    type="text"
                    value={propietarioForm.accountHolder}
                    onChange={(event) =>
                      handleAccountHolderChange(event.target.value)
                    }
                    className={inputClassName}
                    placeholder="Se completa desde Razón Social"
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={labelClassName}>Banco</span>
                  <select
                    value={selectedBankId}
                    onChange={(event) => handleBankSelection(event.target.value)}
                    className={inputClassName}
                  >
                    <option value="">Selecciona un banco...</option>
                    {hasUncataloguedBank ? (
                      <option value="" disabled>
                        Actual: {propietarioForm.bankName}
                        {propietarioForm.bankBic
                          ? ` (${propietarioForm.bankBic})`
                          : ""}{" "}
                        — no está en catálogo
                      </option>
                    ) : null}
                    {activePropietarioBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                        {bank.bankBic ? ` (${bank.bankBic})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedBankId ? (
                    <span className="text-[11px] text-slate-500">
                      Código bancario: {propietarioForm.bankBic || "—"}
                    </span>
                  ) : hasUncataloguedBank ? (
                    <span className="text-[11px] font-semibold text-amber-700">
                      Este registro tiene un banco fuera del catálogo. Agrégalo con
                      el botón Banco o selecciona uno existente.
                    </span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={labelClassName}>Nro. Cta. Banco</span>
                  <input
                    type="text"
                    value={propietarioForm.bankAccount}
                    onChange={(event) =>
                      updateFormField("bankAccount", event.target.value)
                    }
                    className={inputClassName}
                  />
                </label>
              </div>

              {propietarioMessage ? (
                <p className="mt-3 text-xs font-semibold text-green-700">
                  {propietarioMessage}
                </p>
              ) : null}
              {propietarioError ? (
                <p className="mt-3 text-xs font-semibold text-red-600">
                  {propietarioError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={resetPropietarioForm}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPropietario}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isCreatingPropietario ? "Crear" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
      {dialog}
      {observationDialog}
      <PropietarioBanksDialog
        open={isBanksDialogOpen}
        banks={propietarioBanks}
        onClose={() => setIsBanksDialogOpen(false)}
        onBanksChange={setPropietarioBanks}
      />
    </main>
  );
}
