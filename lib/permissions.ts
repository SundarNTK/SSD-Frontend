import { useAuthStore } from "./authStore";
import { USER_TYPES, isAdminPanelType } from "./userTypes";

export type PermissionLevel = "view" | "edit" | "fullAccess";
export type PermissionMap = Record<string, { view: boolean; edit: boolean; fullAccess: boolean }>;

/** Module keys, mirroring User-Service's common/constants/modules.js. */
export const MODULES = {
  users: "users",
  customers: "customers",
  roles: "roles",
  emailTemplates: "email-templates",
  printingGroups: "printing-groups",
  units: "units",
  deities: "deities",
  gst: "gst",
  glGroups: "gl-groups",
  generalLedgers: "general-ledgers",
  categories: "categories",
  subCategories: "sub-categories",
  items: "items",
  services: "services",
  events: "events",
  nakshathirams: "nakshathirams",
  paymentModes: "payment-modes",
  inventory: "inventory",
  adminBooking: "admin-booking",
  posTransactions: "pos-transactions",
  posOrderConfirmation: "pos-order-confirmation",
} as const;

/**
 * Shared permission check for every screen — one implementation, so no page
 * hand-rolls its own `user.permissions?.[x]?.[y]` chain and gets the
 * SUPER_ADMIN bypass subtly wrong.
 *
 * This governs what the UI *offers*, never what the API *allows*. The
 * server re-derives permissions from the database on every single request
 * (User-Service's auth-guard.js), so editing this map in localStorage
 * reveals nothing and unlocks nothing — it only produces menu entries that
 * answer 403.
 */
export function can(
  user: { userType?: string; permissions?: PermissionMap } | null,
  module: string,
  level: PermissionLevel = "view"
): boolean {
  if (!user) return false;
  if (user.userType === USER_TYPES.SUPER_ADMIN) return true;
  return Boolean(user.permissions?.[module]?.[level]);
}

/** Hook form of `can`, for components that just need a few checks. */
export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  return {
    user,
    can: (module: string, level: PermissionLevel = "view") => can(user, module, level),
    isAdminPanelUser: isAdminPanelType(user?.userType),
  };
}
