"use client";

import { HomeActions } from "./HomeActions";
import { SessionGate } from "./SessionGate";

export function HomeScreen() {
  return <SessionGate>{({ supabase }) => <HomeActions supabase={supabase} />}</SessionGate>;
}
