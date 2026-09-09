import { Suspense } from "react";
import PosCustomerDisplayPage from "../../../components/pos/PosCustomerDisplayPage";
import { EmblemLoader } from "../../../components/divine/EmblemLoader";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-white">
          <EmblemLoader size="md" label="Loading display…" />
        </div>
      }
    >
      <PosCustomerDisplayPage />
    </Suspense>
  );
}
