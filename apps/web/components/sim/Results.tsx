"use client";

import type { Catalog, ComparisonResponse } from "@sim/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { names as namesOf } from "@/lib/derive";
import { Drawer } from "../ui/kit";
import { Frontier } from "./Frontier";
import { Excluded, Ladder, matchesFocus, type FamilyFilter } from "./Ladder";
import { RouteMap } from "./RouteMap";
import { RouteTrace } from "./RouteTrace";
import { Picks, Verdict } from "./Verdict";

/** Everything below the inputs: verdict, picks, map, frontier, ladder, exclusions, plus the trace drawer. */
export function Results({ data, catalog, research, busy }: { data: ComparisonResponse; catalog: Catalog | null; research?: ReactNode; busy?: boolean }) {
  const names = useMemo(() => namesOf(catalog), [catalog]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyFilter>("all");
  const open = data.routes.find((r) => r.id === openId);

  const highlight = useMemo(() => {
    if (!focus && family === "all") return null;
    return new Set(
      data.routes
        .filter((r) => (family === "all" || (family === "usdc" ? r.type === "usdc" : r.type !== "usdc")) && (r.type !== "usdc" ? !focus : matchesFocus(r, focus)))
        .map((r) => r.id),
    );
  }, [data, focus, family]);

  return (
    <div className={busy ? "space-y-3 opacity-60 transition-opacity" : "space-y-3 transition-opacity"} aria-busy={busy}>
      <Verdict data={data} names={names} onOpen={setOpenId} />
      <Picks data={data} onOpen={setOpenId} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Frontier data={data} highlight={highlight} onOpen={setOpenId} />
        <RouteMap data={data} names={names} focus={focus} onFocus={setFocus} />
      </div>
      <Ladder data={data} names={names} family={family} setFamily={setFamily} focus={focus} onOpen={setOpenId} />
      <Excluded data={data} names={names} />
      {research}
      <Drawer open={!!open} onClose={() => setOpenId(null)} label="Route trace">
        {open && <RouteTrace r={open} data={data} names={names} />}
      </Drawer>
    </div>
  );
}
