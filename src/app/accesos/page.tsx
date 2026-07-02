"use client";

import AccessChangePasswordScreen from "@/components/AccessChangePasswordScreen";
import ExecutiveAccessLoginScreen from "@/components/ExecutiveAccessLoginScreen";
import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import {
  clearAdminSessionClient,
  fetchAdminSessionClient,
} from "@/lib/admin-auth-client";
import {
  ACCESS_PERMISSION_KEYS,
  ACCESS_PERMISSION_LABELS,
  type AccessPermissionKey,
  type AccessPermissions,
  type PublicAccessUser,
} from "@/lib/access-users";
import { uiFieldClass, uiListRowClass } from "@/lib/ui-borders";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccessUserForm = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  permissions: AccessPermissions;
};

const emptyPermissions = (): AccessPermissions => ({
  solicitudes: false,
  calendario: false,
  motivos: false,
  ejecutivos: false,
  conductores: false,
  propietarios: false,
  pagoPropietario: false,
});

const emptyForm: AccessUserForm = {
  id: "",
  email: "",
  fullName: "",
  isActive: true,
  permissions: emptyPermissions(),
};

type AccesosView = "bootstrapping" | "login" | "change-password" | "panel";

export default function AccesosPage() {
  const [view, setView] = useState<AccesosView>("bootstrapping");
  const [users, setUsers] = useState<PublicAccessUser[]>([]);
  const [form, setForm] = useState<AccessUserForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sendingTempPasswordId, setSendingTempPasswordId] = useState("");
  const [pendingPasswordChange, setPendingPasswordChange] = useState<{
    email: string;
    fullName: string;
    currentPassword: string;
  } | null>(null);

  async function loadUsers() {
    const response = await fetch("/api/access-users", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudieron cargar los usuarios.");
    }

    const data = (await response.json()) as { users?: PublicAccessUser[] };
    setUsers(data.users ?? []);
    setError("");
  }

  const reloadUsers = useCallback(async () => {
    await loadUsers();
  }, []);

  const {
    refresh: refreshUsers,
    isRefreshing,
    lastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: reloadUsers,
    enabled: view === "panel",
    pause: isSaving || sendingTempPasswordId !== "",
  });

  async function bootstrapSession() {
    const data = await fetchAdminSessionClient();

    if (!data) {
      setView("login");
      return;
    }

    if (!data.canManageAccesos) {
      await clearAdminSessionClient();
      setError("Solo el administrador principal puede gestionar accesos.");
      setView("login");
      return;
    }

    if (data.mustChangePassword) {
      setView("change-password");
      setPendingPasswordChange({
        email: data.email ?? "",
        fullName: "",
        currentPassword: "",
      });
      return;
    }

    await loadUsers();
    setView("panel");
  }

  useEffect(() => {
    bootstrapSession().catch(() => setView("login"));
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return users;
    }

    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(normalizedSearch) ||
        user.fullName.toLowerCase().includes(normalizedSearch),
    );
  }, [search, users]);

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  function handleEditUser(user: PublicAccessUser) {
    setForm({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      permissions: { ...user.permissions },
    });
    setMessage("");
    setError("");
  }

  function togglePermission(key: AccessPermissionKey) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions[key],
      },
    }));
  }

  async function handleSaveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const isEditing = Boolean(form.id);
      const response = await fetch(
        isEditing ? `/api/access-users/${form.id}` : "/api/access-users",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: form.email.trim(),
            fullName: form.fullName.trim(),
            isActive: form.isActive,
            permissions: form.permissions,
          }),
        },
      );

      const data = (await response.json()) as {
        message?: string;
        user?: PublicAccessUser;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo guardar el usuario.");
      }

      await loadUsers();
      resetForm();
      setMessage(data.message ?? "Usuario guardado.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el usuario.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUser(user: PublicAccessUser) {
    if (user.isSuperAdmin) {
      return;
    }

    if (!window.confirm(`¿Eliminar el acceso de ${user.email}?`)) {
      return;
    }

    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/access-users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo eliminar el usuario.");
      }

      await loadUsers();
      if (form.id === user.id) {
        resetForm();
      }
      setMessage(data.message ?? "Usuario eliminado.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el usuario.",
      );
    }
  }

  async function handleSendTemporaryPassword(user: PublicAccessUser) {
    setSendingTempPasswordId(user.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/access-users/temporary-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessUserId: user.id }),
      });

      const data = (await response.json()) as { message?: string; detail?: string };

      if (!response.ok) {
        throw new Error(data.message ?? data.detail ?? "No se pudo enviar la clave.");
      }

      await loadUsers();
      setMessage(data.message ?? "Clave temporal enviada.");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "No se pudo enviar la clave temporal.",
      );
    } finally {
      setSendingTempPasswordId("");
    }
  }

  async function handleLogout() {
    await clearAdminSessionClient();
    resetForm();
    setUsers([]);
    window.location.assign("/accesos");
  }

  if (view === "bootstrapping") {
    return null;
  }

  if (view === "login") {
    return (
      <ExecutiveAccessLoginScreen
        eyebrow="Super administrador"
        title="Gestión de accesos"
        description="Ingresa con tu correo y clave para administrar usuarios y permisos."
        userLabel="Correo"
        userPlaceholder="correo@empresa.cl"
        onAuthenticated={async () => {
          setError("");
          await bootstrapSession();
        }}
        onMustChangePassword={(accessUser, currentPassword) => {
          setPendingPasswordChange({
            email: accessUser.email,
            fullName: accessUser.fullName,
            currentPassword,
          });
          setView("change-password");
        }}
      />
    );
  }

  if (view === "change-password" && pendingPasswordChange) {
    return (
      <AccessChangePasswordScreen
        email={pendingPasswordChange.email}
        fullName={pendingPasswordChange.fullName}
        currentPassword={pendingPasswordChange.currentPassword}
        title="Define tu clave de super administrador"
        description="Ingresaste con la clave temporal inicial. Crea tu clave definitiva para continuar."
        onCompleted={async () => {
          setPendingPasswordChange(null);
          window.location.assign("/accesos");
        }}
        onCancel={() => {
          setPendingPasswordChange(null);
          setView("login");
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#eef3f9] text-[#0f2747]">
      <div className="border-b border-[#b7cce4] bg-[#d7e7f8] shadow-sm shadow-slate-200/40">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b5cab]">
              Accesos
            </p>
            <h1 className="font-heading text-xl font-semibold text-[#0f2747]">
              Usuarios y permisos
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/agendamientos"
              className="inline-flex h-9 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-[#173b68] transition hover:bg-white/80"
            >
              Ir a agendamientos
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#084a8c]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-6">
        <MaintainerPageHeader
          title="Usuarios de administración"
          subtitle="Crea accesos por correo, define permisos por módulo y envía claves temporales."
          onRefresh={() => void refreshUsers()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
        />

        {message ? (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="rounded-[24px] border-2 border-[#b7cce4] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0f2747]">
              {form.id ? "Editar usuario" : "Nuevo usuario"}
            </h2>

            <form onSubmit={handleSaveUser} className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#173b68]">Correo</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className={`h-11 rounded-2xl px-4 ${uiFieldClass()}`}
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#173b68]">Nombre</span>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  className={`h-11 rounded-2xl px-4 ${uiFieldClass()}`}
                />
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-[#173b68]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Usuario activo
              </label>

              <div>
                <p className="text-sm font-semibold text-[#173b68]">Permisos</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ACCESS_PERMISSION_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-2xl border border-[#d7e7f8] px-3 py-2 text-sm text-[#173b68]"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions[key]}
                        onChange={() => togglePermission(key)}
                      />
                      {ACCESS_PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c] disabled:bg-slate-300"
                >
                  {isSaving ? "Guardando..." : form.id ? "Actualizar" : "Crear usuario"}
                </button>
                {form.id ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#b7cce4] bg-white px-5 text-sm font-semibold text-[#173b68]"
                  >
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-[24px] border-2 border-[#b7cce4] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-[#0f2747]">
                Usuarios registrados
              </h2>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por correo o nombre"
                className={`h-10 w-full rounded-2xl px-4 sm:max-w-xs ${uiFieldClass()}`}
              />
            </div>

            <div className="mt-4 grid gap-3">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-slate-600">No hay usuarios para mostrar.</p>
              ) : (
                filteredUsers.map((user) => (
                  <article
                    key={user.id}
                    className={`rounded-[20px] border p-4 ${uiListRowClass(false)}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-[#0f2747]">
                          {user.fullName || user.email}
                        </p>
                        <p className="text-sm text-slate-600">{user.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {user.isSuperAdmin ? (
                            <span className="rounded-full bg-[#0b5cab] px-2.5 py-1 text-xs font-semibold text-white">
                              Super admin
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              user.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {user.isActive ? "Activo" : "Inactivo"}
                          </span>
                          {user.mustChangePassword ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                              Debe cambiar clave
                            </span>
                          ) : null}
                        </div>
                        {!user.isSuperAdmin ? (
                          <p className="mt-3 text-xs leading-5 text-slate-600">
                            {ACCESS_PERMISSION_KEYS.filter((key) => user.permissions[key])
                              .map((key) => ACCESS_PERMISSION_LABELS[key])
                              .join(" · ") || "Sin permisos asignados"}
                          </p>
                        ) : (
                          <p className="mt-3 text-xs leading-5 text-slate-600">
                            Acceso total a todos los módulos
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditUser(user)}
                          className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#b7cce4] bg-white px-3 text-sm font-semibold text-[#173b68]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendTemporaryPassword(user)}
                          disabled={sendingTempPasswordId === user.id}
                          className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-3 text-sm font-semibold text-white disabled:bg-slate-300"
                        >
                          {sendingTempPasswordId === user.id
                            ? "Enviando..."
                            : "Enviar clave temporal"}
                        </button>
                        {!user.isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            className="inline-flex h-9 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700"
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
