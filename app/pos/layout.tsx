"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../lib/authStore";
import { isAdminPanelType } from "../../lib/userTypes";

/**
 * Same guard as the admin dashboard layout (app/admin/(dashboard)/layout.tsx)
 * — POS counter staff sign in through the same admin login, so the check is
 * identical: a token, and an admin-panel user type (not a Customer). Kept as
 * its own copy rather than a shared import because the two shells render
 * completely different chrome (no sidebar/topbar here) and have no other
 * reason to depend on each other.
 */
function usePosGuard() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token || (user && !isAdminPanelType(user.userType))) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [token, user, router]);

  return ready;
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const ready = usePosGuard();
  if (!ready) return null;
  return <>{children}</>;
}
