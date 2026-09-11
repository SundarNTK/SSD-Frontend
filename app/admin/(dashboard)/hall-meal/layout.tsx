"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../../lib/authStore";
import { EmblemLoader } from "../../../../components/divine/EmblemLoader";

/**
 * Second gate inside the dashboard shell: the parent layout's
 * `useAdminGuard()` already confirmed this is a signed-in Admin Panel
 * user (Super Admin or Admin User); this one narrows further to the
 * `hallMealAccess` flag specifically, matching the API's
 * `hallMealAccessOnly` middleware.
 *
 * Deliberately NOT a `userType === SUPER_ADMIN` check — several accounts
 * can be Super Admin, and this area is meant for exactly one (or however
 * many an Admin explicitly flips this flag on for), not "every Super
 * Admin". See models/users' `hallMealAccess` field on the backend.
 *
 * Nobody without the flag ever sees a link to these screens (Sidebar
 * hides the group entirely), but this still exists for anyone landing
 * here by a direct URL — an honest redirect instead of a screen full of
 * 403s. The API is the real boundary; this is UX only.
 */
function useHallMealAccessGuard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (user && user.hallMealAccess !== true) {
      router.replace("/admin/dashboard");
      return;
    }
    if (user) setReady(true);
  }, [user, router]);

  return ready;
}

export default function HallMealLayout({ children }: { children: React.ReactNode }) {
  const ready = useHallMealAccessGuard();

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmblemLoader size="md" label="Loading…" />
      </div>
    );
  }

  return <>{children}</>;
}
