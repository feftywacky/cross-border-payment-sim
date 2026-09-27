import { Suspense } from "react";
import { Simulator } from "@/components/Simulator";
import { Spinner } from "@/components/ui";

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <Simulator />
    </Suspense>
  );
}
