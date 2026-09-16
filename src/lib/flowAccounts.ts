// 플로우(구글 Flow 무료이미지) 계정 CRUD — Supabase moca_flow_accounts 영속.
// 토큰 소진 시 sort_order 순서대로 다음 계정으로 전환(slot 방식).
import { supabase } from "./supabase";
import type { CafeAccount } from "./accounts";

export interface FlowAccount {
  id: string;
  google_email: string;
  memo: string | null;
  slot: number | null;
  connected: boolean;
  sort_order: number;
  created_at: string;
}

// 🔴 발행/홍보 전 연결 점검(공용). 미연결이면 ok=false + 빨간 경고 문구.
//   ① 네이버 계정 세션 미연결(로그인 안 됨) → 발행 자체 불가.
//   ② 이미지(imgCount>0)를 쓰는데 연결된 플로우 계정이 없음 → 이미지 못 만듦.
//   연결돼 있으면 사용할 플로우 slot 목록 + 계정명(google_email)을 함께 돌려줘 로그에 찍는다.
export interface PublishGate { ok: boolean; msg: string; flowSlots: number[]; flowNames: string; }
export async function checkPublishGate(account: CafeAccount | undefined, accName: string, needImage: boolean): Promise<PublishGate> {
  if (!account?.session_saved) {
    return { ok: false, msg: `❌ '${accName}' 네이버 계정이 연결(로그인)되어 있지 않아요. '카페 계정' 탭에서 로그인한 뒤 다시 시작하세요.`, flowSlots: [], flowNames: "" };
  }
  if (!needImage) return { ok: true, msg: "", flowSlots: [], flowNames: "" };
  const flows = (await listFlowAccounts().catch(() => [])).filter((a) => a.connected);
  if (!flows.length) {
    return { ok: false, msg: `❌ 연결된 플로우(이미지) 계정이 없어요. '플로우' 탭에서 연결한 뒤 다시 시작하세요. (이미지 장수를 0으로 하면 이미지 없이 글만 발행돼요)`, flowSlots: [], flowNames: "" };
  }
  return { ok: true, msg: "", flowSlots: flows.map((a) => a.slot ?? 0), flowNames: flows.map((a) => a.google_email).join(", ") };
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
