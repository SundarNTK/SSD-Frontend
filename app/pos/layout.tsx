"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../lib/authStore";
import { isAdminPanelType, USER_TYPES } from "../../lib/userTypes";
import { EmblemLoader, warmLoaderAssets } from "../../components/divine/EmblemLoader";

/**
 * Guards everything under /pos except /pos/login itself (that page has to
 * be reachable with no session at all — guarding it too would redirect it
 * to itself in a loop). Two checks beyond the admin dashboard's own guard:
 * the account has to be an admin-panel user type, AND carry posAccess — a
 * per-user flag on the User Master, independent of role permissions, for
 * "is this person allowed to work the counter." System Admin bypasses the
 * posAccess check the same way it bypasses every other permission in this
 * app (requirePermission on the backend does the same) — it's the one
 * account type that's never gated by a per-user flag. Either check failing
 * sends a non-System-Admin to /pos/login, not /admin/login — the two
 * surfaces are gated differently and a POS session dying mid-transaction
 * shouldn't land someone on the admin sign-in screen.
 */
function usePosGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  const isLoginRoute = pathname === "/pos/login";

  useEffect(() => {
    if (isLoginRoute) {
      setReady(true);
      return;
    }
    const isSuperAdmin = user?.userType === USER_TYPES.SUPER_ADMIN;
    if (!token || (user && !isSuperAdmin && (!isAdminPanelType(user.userType) || !user.posAccess))) {
      router.replace("/pos/login");
      return;
    }
    setReady(true);
  }, [token, user, router, isLoginRoute]);

  return ready;
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const ready = usePosGuard();

  useEffect(() => {
    warmLoaderAssets();
  }, []);
  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <EmblemLoader size="md" label="Loading…" />
      </div>
    );
  }
  return <>{children}</>;
}
