import { Suspense } from "react";
import { Simulator } from "@/components/sim/Simulator";
import { Spinner } from "@/components/ui/kit";

export default function Home() {
  return (
    <Suspense fallback={<div className="pt-8"><Spinner /></div>}>
      <Simulator />
    </Suspense>
  );
}
