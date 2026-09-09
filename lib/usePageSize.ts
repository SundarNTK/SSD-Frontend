import { create } from "zustand";
import { authApi } from "./api";
import { useAuthStore } from "./authStore";

/**
 * "Rows per page" for every Master list screen (Item Master, Service
 * Master, Deity Master, ...) — one shared value, not a per-page default.
 * Changing it on any screen changes it everywhere else immediately, and it
 * survives logout/login because it's saved on the account itself (see the
 * backend's models/users `paginationCount` field and
 * PUT /auth/pagination-count), not just this browser's storage.
 *
 * Use it in place of a local `useState` for page size:
 *   const { pageSize, setPageSize } = usePageSize();
 *
 * Must match SSD-Backend's own allowed values (models/users' paginationCount
 * enum, controllers/auth's paginationCountSchema) and DataTable.tsx's
 * DEFAULT_PAGE_SIZE_OPTIONS — all three lists have to agree.
 */
const DEFAULT_PAGE_SIZE = 10;

type PageSizeState = {
  pageSize: number;
  setPageSize: (size: number) => void;
};

const usePageSizeStore = create<PageSizeState>((set) => ({
  // Sourced from whatever session authStore already hydrated from
  // localStorage at module-load time (see authStore.ts's own note on why
  // that read is safe here) — correct for the common case of reloading an
  // already-signed-in tab. A fresh sign-in *without* a reload is handled by
  // the subscription below instead, since this initializer only runs once.
  pageSize: useAuthStore.getState().user?.paginationCount ?? DEFAULT_PAGE_SIZE,

  setPageSize: (size) => {
    set({ pageSize: size });

    // Keep the session user (and its localStorage copy) in step too, so a
    // plain reload later in the same session — no fresh login — still opens
    // at this value instead of whatever was true when the tab first loaded.
    const { user, token, setSession } = useAuthStore.getState();
    if (user && token) {
      setSession(token, { ...user, paginationCount: size });
    }

    // Fire-and-forget: this is a "remember it for next time" preference,
    // not something the current screen needs to block on. A failure here
    // (a dropped connection, a token about to expire) leaves the change
    // fully applied for the rest of this session either way — only the
    // next LOGIN's default would silently stay at the old value, which
    // isn't worth an error toast over.
    authApi.put("/auth/pagination-count", { paginationCount: size }).catch(() => {});
  },
}));

// Re-syncs pageSize the moment a *different* saved value shows up on the
// session user — covers signing in without a full page reload (the login
// page navigates client-side into the dashboard, so this store's one-time
// initializer above never re-runs) and signing out (falls back to the
// default rather than leaking the previous account's choice into the next
// session on the same tab).
let lastKnownPaginationCount = useAuthStore.getState().user?.paginationCount;
useAuthStore.subscribe((state) => {
  if (state.user?.paginationCount === lastKnownPaginationCount) return;
  lastKnownPaginationCount = state.user?.paginationCount;
  usePageSizeStore.setState({ pageSize: state.user?.paginationCount ?? DEFAULT_PAGE_SIZE });
});

export const usePageSize = usePageSizeStore;
