"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import DivineListbox from "../divine/DivineListbox";
import DivineButton from "../divine/DivineButton";
import StatusBanner from "../divine/StatusBanner";
import { authApi, unwrap, type ApiEnvelope } from "../../lib/api";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { MODULES, usePermissions } from "../../lib/permissions";
import type { Role } from "./RolesPage";

/** `group` is the Admin Panel main-menu heading this module sits under. */
type ModuleDef = { key: string; label: string; group?: string };
type PermissionRow = { module: string; view: boolean; edit: boolean; fullAccess: boolean };

/**
 * fullAccess implies edit implies view — client-side mirror of the exact
 * same rule role.controller.js's updatePermissions() enforces server-side,
 * so the checkboxes never show a state the backend would silently correct.
 */
function normalize(row: PermissionRow, field: "view" | "edit" | "fullAccess", value: boolean): PermissionRow {
  const next = { ...row, [field]: value };
  if (field === "fullAccess" && value) return { ...next, edit: true, view: true };
  if (field === "edit" && value) return { ...next, view: true };
  if (field === "view" && !value) return { ...next, edit: false, fullAccess: false };
  if (field === "edit" && !value) return { ...next, fullAccess: false };
  return next;
}

export default function PermissionsPage() {
  const { can } = usePermissions();
  const canSave = can(MODULES.roles, "fullAccess");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preselectedRole = searchParams.get("role") ?? "";

  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState(preselectedRole);
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [saved, setSaved] = useState(false);

  const load = useAsyncAction(async () => {
    const [rolesRes, modulesRes] = await Promise.all([
      // status: 1 — an inactive role grants nothing (auth-guard filters it
      // out when resolving), so configuring one would be a no-op.
      authApi.get<ApiEnvelope<{ items: Role[]; total: number }>>("/roles", { params: { pageSize: 100, status: 1 } }),
      authApi.get<ApiEnvelope<ModuleDef[]>>("/roles/modules"),
    ]);

    // Locked roles (System Admin, Customer) are left out entirely rather than
    // shown with a caveat. Their access is decided by account type, so every
    // checkbox on them is inert — offering the choice at all invites someone
    // to tick boxes, save, and reasonably conclude permissions are broken.
    const roleItems = unwrap(rolesRes).items.filter((r) => !r.isLocked);
    setRoles(roleItems);
    setModules(unwrap(modulesRes));

    // A stale ?role= pointing at a locked or deleted role falls back to the
    // first configurable one instead of leaving the page on a blank grid.
    const preselectIsValid = roleItems.some((r) => r._id === preselectedRole);
    const initialRoleId = (preselectIsValid ? preselectedRole : roleItems[0]?._id) || "";
    setSelectedRoleId(initialRoleId);
    applyRoleToRows(initialRoleId, roleItems, unwrap(modulesRes));
  });

  const save = useAsyncAction(async () => {
    await authApi.put(`/roles/${selectedRoleId}/permissions`, { permissions: rows });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  });

  useEffect(() => {
    load.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRoleToRows(roleId: string, roleList: Role[], moduleList: ModuleDef[]) {
    const role = roleList.find((r) => r._id === roleId);
    const byModule = new Map((role?.permissions ?? []).map((p) => [p.module, p]));
    setRows(
      moduleList.map((m) => {
        const existing = byModule.get(m.key);
        return { module: m.key, view: existing?.view ?? false, edit: existing?.edit ?? false, fullAccess: existing?.fullAccess ?? false };
      })
    );
  }

  function handleRoleChange(roleId: string) {
    setSelectedRoleId(roleId);
    const params = new URLSearchParams(searchParams.toString());
    if (roleId) params.set("role", roleId);
    else params.delete("role");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    applyRoleToRows(roleId, roles, modules);
  }

  function toggleColumn(field: "view" | "edit" | "fullAccess", checked: boolean) {
    setRows((prev) => prev.map((r) => normalize(r, field, checked)));
  }

  function toggleGroup(indexes: number[], field: "view" | "edit" | "fullAccess", checked: boolean) {
    setRows((prev) => prev.map((r, i) => (indexes.includes(i) ? normalize(r, field, checked) : r)));
  }

  /**
   * Modules bucketed by their main-menu heading, preserving the order the
   * server sent them in. The row index is carried along because `rows` stays
   * a flat array aligned to `modules` — grouping is presentation only, and
   * the payload the API expects is still one flat list.
   */
  const groups = modules.reduce<{ group: string; entries: { module: ModuleDef; index: number }[] }[]>(
    (acc, module, index) => {
      const name = module.group || "Other";
      const bucket = acc.find((g) => g.group === name);
      if (bucket) bucket.entries.push({ module, index });
      else acc.push({ group: name, entries: [{ module, index }] });
      return acc;
    },
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[24px] text-ink-100">Permissions</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Choose a role, then set View / Edit / Full Access per module. Saving takes effect on that
          role's users immediately — including anyone already signed in.
        </p>
      </div>

      {load.error && <StatusBanner tone="error">{load.error}</StatusBanner>}
      {save.error && <StatusBanner tone="error">{save.error}</StatusBanner>}
      {saved && <StatusBanner tone="success">Permissions updated successfully.</StatusBanner>}

      <div className="max-w-xs">
        <DivineListbox
          label="Role"
          value={selectedRoleId}
          onChange={handleRoleChange}
          options={roles.map((r) => ({ value: r._id, label: r.name }))}
        />
      </div>

      {roles.length === 0 && !load.submitting && (
        <p className="rounded-xl border border-gold-500/20 bg-gold-500/5 px-4 py-2.5 text-[12.5px] text-amber-600">
          No configurable roles yet. System Admin and Customer aren't listed here — their access is
          decided by account type, so module permissions don't apply to them. Create a role to begin.
        </p>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-x-auto rounded-2xl border border-gold-500/15 bg-navy-900/60"
      >
        <table className="w-full min-w-[480px] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-gold-500/10 text-[11px] uppercase tracking-wide text-ink-500">
              <th className="px-5 py-3 font-normal">Module</th>
              {(["view", "edit", "fullAccess"] as const).map((field) => (
                <th key={field} className="px-5 py-3 text-center font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    {field === "view" ? "View" : field === "edit" ? "Edit" : "Full Access"}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-gold-500/10 bg-ivory-100 text-ink-300">
              <th className="px-5 py-2.5 text-left text-[12px] font-medium text-amber-600">Select all</th>
              {(["view", "edit", "fullAccess"] as const).map((field) => {
                const columnChecked = rows.length > 0 && rows.every((r) => r[field]);
                return (
                  <th key={field} className="px-5 py-2.5 text-center font-normal">
                    <input
                      type="checkbox"
                      checked={columnChecked}
                      onChange={(e) => toggleColumn(field, e.target.checked)}
                      aria-label={`Toggle ${field} for every module`}
                      className="h-4 w-4 accent-gold-500"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          {/* One <tbody> per main-menu group, so the grid reads the same way
              the sidebar does: heading, then the modules beneath it. The
              groups come from GET /roles/modules, so a new master lands under
              the right heading without this file changing. */}
          {groups.map(({ group, entries }) => {
            const indexes = entries.map((e) => e.index);
            return (
              <tbody key={group}>
                <tr className="border-b border-gold-500/10 bg-ivory-100/70">
                  <td className="px-5 py-2.5 font-accent text-[12px] uppercase tracking-[0.12em] text-amber-600">
                    {group}
                  </td>
                  {(["view", "edit", "fullAccess"] as const).map((field) => {
                    const groupChecked = indexes.every((i) => rows[i]?.[field]);
                    return (
                      <td key={field} className="px-5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={groupChecked}
                          onChange={(e) => toggleGroup(indexes, field, e.target.checked)}
                          aria-label={`Toggle ${field} for every module under ${group}`}
                          className="h-3.5 w-3.5 accent-gold-600 opacity-70"
                        />
                      </td>
                    );
                  })}
                </tr>

                {entries.map(({ module: m, index }) => {
                  const row = rows[index];
                  if (!row) return null;
                  return (
                    <tr key={m.key} className="border-b border-gold-500/5 text-ink-100">
                      <td className="py-3.5 pl-10 pr-5">
                        <span className="relative">
                          <span
                            aria-hidden="true"
                            className="absolute -left-4 top-1/2 h-3.5 w-px -translate-y-1/2 bg-gold-500/25"
                          />
                          {m.label}
                        </span>
                      </td>
                      {(["view", "edit", "fullAccess"] as const).map((field) => (
                        <td key={field} className="px-5 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={row[field]}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) => (i === index ? normalize(r, field, e.target.checked) : r))
                              )
                            }
                            className="h-4 w-4 accent-gold-500"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </motion.div>

      {canSave ? (
        <div className="max-w-xs">
          <DivineButton onClick={() => save.run()} loading={save.submitting} disabled={!selectedRoleId}>
            Save Permissions
          </DivineButton>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-500">
          You have read-only access here — changing permissions requires Full Access on Roles.
        </p>
      )}
    </div>
  );
}
