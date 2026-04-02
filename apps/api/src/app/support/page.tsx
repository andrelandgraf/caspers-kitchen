import { Suspense } from "react";
import SupportCaseLookup from "./support-case-lookup";

export default function SupportPage() {
  return (
    <Suspense>
      <SupportCaseLookup />
    </Suspense>
  );
}
