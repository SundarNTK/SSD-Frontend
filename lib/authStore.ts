import { create } from "zustand";
import { readJson, removeKeys, writeJson } from "./storage";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  userType: "SUPER_ADMIN" | "Admin_Users" | "Customers";
  profileImage?: string | null;
  uCode?: string | null;
  /**
   * What this account can reach, as resolved at login. Used only to decide
   * which nav entries and buttons to render — the server re-checks every
   * request against the database regardless of what's stored here.
   */
  permissions?: Record<string, { view: boolean; edit: boolean; fullAccess: boolean }>;
};

/** Why the session ended, so the login page can say something useful. */
export type SessionEndReason = "signed-out" | "expired";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
};

const TOKEN_KEY = "ssd_admin_token";
const USER_KEY = "ssd_admin_user";
/** sessionStorage, not the store: it has to survive the reload that endSession triggers. */
const SESSION_END_KEY = "ssd_admin_session_end";

// The zustand initializer below runs at module-evaluation time, which in
// Next.js includes an initial server-side render pass even for "use client"
// components — localStorage doesn't exist in that Node environment, so
// reading it unguarded here would crash the server render. The client
// re-hydrates with the real value on mount; a `typeof window` check is
// enough since nothing here needs the token before that first paint.
const isBrowser = typeof window !== "undefined";

export const useAuthStore = create<AuthState>((set) => ({
  token: isBrowser ? localStorage.getItem(TOKEN_KEY) || null : null,
  user: isBrowser ? readJson<SessionUser | null>(USER_KEY, null) : null,

  setSession: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    writeJson(USER_KEY, user);
    set({ token, user });
  },

  /** In-memory half only. Use `endSession()` — it does this *and* the reload. */
  clearSession: () => {
    removeKeys(TOKEN_KEY, USER_KEY);
    set({ token: null, user: null });
  },
}));

// Several failing requests can each see a 401 at once; without this the page
// would try to navigate once per response.
let ending = false;

/**
 * The one way a session ends — the Sign out button, or the API interceptor
 * when the server stops accepting the token.
 *
 * Deliberately a full page load rather than client-side routing. Sign-out is
 * the single action where losing SPA smoothness is the right trade: a reload
 * is the only thing that reliably discards *everything* from the previous
 * session — the store, every page's cached list data, and any request still
 * in flight that would otherwise resolve into a screen the next person is
 * looking at. It also removes any dependence on component state updating in
 * the right order, which is exactly the kind of thing that makes a sign-out
 * button look like it does nothing.
 */
export function endSession(reason: SessionEndReason = "signed-out"): void {
  if (ending) return;
  ending = true;

  try {
    sessionStorage.setItem(SESSION_END_KEY, reason);
  } catch {
    // Private-browsing modes can refuse sessionStorage. Losing the notice is
    // acceptable; failing to sign out is not.
  }

  useAuthStore.getState().clearSession();
  window.location.replace("/login");
}

/** Reads and consumes the reason, so it's announced once and not on every later visit. */
export function takeSessionEndReason(): SessionEndReason | null {
  try {
    const reason = sessionStorage.getItem(SESSION_END_KEY);
    if (reason) sessionStorage.removeItem(SESSION_END_KEY);
    return (reason as SessionEndReason) || null;
  } catch {
    return null;
  }
}

/** Usable from non-React code (axios interceptors). */
export const authActions = {
  endSession,
  getToken: () => useAuthStore.getState().token,
};
