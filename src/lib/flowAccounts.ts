// 플로우(구글 Flow 무료이미지) 계정 CRUD — Supabase moca_flow_accounts 영속.
// 토큰 소진 시 sort_order 순서대로 다음 계정으로 전환(slot 방식).
import { supabase } from "./supabase";

export interface FlowAccount {
  id: string;
  google_email: string;
  memo: string | null;
  slot: number | null;
  connected: boolean;
  sort_order: number;
  created_at: string;
}

export async function listFlowAccounts(): Promise<FlowAccount[]> {
  const { data, error } = await supabase
    .from("moca_flow_accounts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as FlowAccount[];
}

export async function addFlowAccount(email: string, memo?: string): Promise<FlowAccount> {
  // slot/sort_order = 현재 개수 기준 자동 부여
  const existing = await listFlowAccounts();
  const nextSlot = existing.length;
  const { data, error } = await supabase
    .from("moca_flow_accounts")
    .insert({ google_email: email.trim(), memo: memo?.trim() || null, slot: nextSlot, sort_order: nextSlot })
    .select()
    .single();
  if (error) throw error;
  return data as FlowAccount;
}

export async function deleteFlowAccount(id: string): Promise<void> {
  const { error } = await supabase.from("moca_flow_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function setFlowConnected(id: string, connected: boolean): Promise<void> {
  const { error } = await supabase.from("moca_flow_accounts").update({ connected }).eq("id", id);
  if (error) throw error;
}
