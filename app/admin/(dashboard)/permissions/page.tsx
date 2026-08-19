import { Suspense } from "react";
import PermissionsPage from "../../../../components/admin/PermissionsPage";

// useSearchParams() inside PermissionsPage needs a Suspense boundary at the
// route level, or Next deopts the whole route to client-side rendering
// instead of just this subtree.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PermissionsPage />
    </Suspense>
  );
}
