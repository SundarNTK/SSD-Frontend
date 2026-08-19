import { redirect } from "next/navigation";

// Bare /admin has no page of its own — every real screen lives under the
// (auth) or (dashboard) route groups. Land here the same way "/" does.
export default function AdminRootPage() {
  redirect("/admin/login");
}
