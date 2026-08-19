"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../lib/authStore";
import { isAdminPanelType } from "../../../lib/userTypes";
import Sidebar from "../../../components/admin/Sidebar";
import Topbar from "../../../components/admin/Topbar";
import ToastStack from "../../../components/admin/ToastStack";

/**
 * Signed in AND an admin-panel user type. The Customer check matters:
 * /auth/login is shared with the future Customer Portal, so a CUSTOMER
 * account gets a perfectly valid token — it just has no business here
 * (FSD §2.1: "No Admin Panel access — Customer Portal only"). Without this
 * they'd land on a dashboard where every panel answers 403.
 *
 * The API enforces the same rule independently via its adminOnly
 * middleware; this exists so the person sees an honest redirect instead of
 * a broken screen.
 *
 * A `useEffect` + `router.replace`, not `redirect()` from next/navigation —
 * the session lives in localStorage, which isn't readable during the
 * server-render pass, so the check can only run after the client mounts.
 */
function useAdminGuard() {
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

/**
 * The working shell every signed-in screen lives inside — deliberately
 * calmer than the auth pages. The starfield/embers/mandala are a
 * once-a-day arrival moment; a screen someone works in for hours needs to
 * be legible and quiet, not cinematic. Brand continuity comes from the
 * palette/type/logo, not from re-running the animation.
 *
 * Below the `md` breakpoint the sidebar is an off-canvas drawer instead of
 * a permanent column — this is the one piece of state both Sidebar and
 * Topbar need to share (Topbar's hamburger opens it, Sidebar owns closing
 * it), so it lives here rather than in either component.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ready = useAdminGuard();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!ready) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ivory-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(212,175,55,0.05),transparent_70%)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
