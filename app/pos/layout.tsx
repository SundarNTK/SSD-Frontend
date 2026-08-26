"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../lib/authStore";
import { isAdminPanelType } from "../../lib/userTypes";

/**
 * Guards everything under /pos except /pos/login itself (that page has to
 * be reachable with no session at all — guarding it too would redirect it
 * to itself in a loop). Two checks beyond the admin dashboard's own guard:
 * the account has to be an admin-panel user type, AND carry posAccess — a
 * per-user flag on the User Master, independent of role permissions, for
 * "is this person allowed to work the counter." Either one failing sends
 * them to /pos/login, not /admin/login — the two surfaces are gated
 * differently and a POS session dying mid-transaction shouldn't land
 * someone on the admin sign-in screen.
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
    if (!token || (user && (!isAdminPanelType(user.userType) || !user.posAccess))) {
      router.replace("/pos/login");
      return;
    }
    setReady(true);
  }, [token, user, router, isLoginRoute]);

  return ready;
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const ready = usePosGuard();
  if (!ready) return null;
  return <>{children}</>;
}
