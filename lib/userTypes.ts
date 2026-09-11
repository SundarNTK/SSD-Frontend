/**
 * Mirrors User-Service's `common/constants/user-types.js`. These are the
 * values stored in the database, not display text — `USER_TYPE_LABEL` maps
 * them for the screen.
 *
 * Nothing in the UI ever *sets* a user type: the creating surface decides
 * (the User master always produces Admin_Users, public registration always
 * produces Customers), and SUPER_ADMIN comes only from the bootstrap
 * scripts. These exist to read what the server sent back.
 */
export const USER_TYPES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN_USER: "Admin_Users",
  CUSTOMER: "Customers",
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const USER_TYPE_LABEL: Record<string, string> = {
  [USER_TYPES.SUPER_ADMIN]: "System Admin",
  [USER_TYPES.ADMIN_USER]: "Admin User",
  [USER_TYPES.CUSTOMER]: "Customer",
};

/** Account types allowed into the Admin Panel — the client-side echo of `adminOnly`. */
export function isAdminPanelType(userType?: string | null): boolean {
  return userType === USER_TYPES.SUPER_ADMIN || userType === USER_TYPES.ADMIN_USER;
}

// Note: the Hall & Meal Management area is gated by the `hallMealAccess`
// boolean on SessionUser (see authStore.ts), not by userType — several
// accounts can be SUPER_ADMIN, and that area is meant for exactly one (or
// however many an Admin explicitly flips the flag on for). There is
// deliberately no `isSuperAdmin(userType)` helper here: writing that check
// against `userType` would be the wrong boundary for this area specifically.
