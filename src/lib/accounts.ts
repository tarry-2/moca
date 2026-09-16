// 카페 계정(네이버) CRUD — Supabase moca_accounts 영속 저장.
// 관리자 전용. 나갔다 들어와도 계정 그대로 유지(테리 영속성 원칙).
import { supabase } from "./supabase";

export interface CafeAccount {
  id: string;
  naver_id: string;
  naver_pw: string | null;
  nickname: string | null;
  memo: string | null;
  proxy_sessid: string | null;
  session_saved: boolean;
  created_at: string;
}

export interface AccountInput {
  naver_id: string;
  naver_pw?: string;
  nickname?: string;
  memo?: string;
  proxy_sessid?: string;
}

// 로그·화면 표시용 계정명. accId(uuid)를 "네이버아이디(닉네임)"로 바꿔 준다.
// 목록에 없으면(로드 전 등) id 원문, id 자체가 없으면 "(미선택)".
export function accountLabel(accounts: CafeAccount[], id?: string): string {
  if (!id) return "(미선택)";
  const a = accounts.find((x) => x.id === id);
  if (!a) return id;
  return a.nickname ? `${a.naver_id} (${a.nickname})` : a.naver_id;
}

export async function listAccounts(): Promise<CafeAccount[]> {
  const { data, error } = await supabase
    .from("moca_accounts")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as CafeAccount[];
}

export async function addAccount(input: AccountInput): Promise<CafeAccount> {
  const row = {
    naver_id: input.naver_id.trim(),
    naver_pw: input.naver_pw?.trim() || null,
    nickname: input.nickname?.trim() || null,
    memo: input.memo?.trim() || null,
    proxy_sessid: input.proxy_sessid?.trim() || null,
  };
  const { data, error } = await supabase.from("moca_accounts").insert(row).select().single();
  if (error) throw error;
  return data as CafeAccount;
}

export async function updateAccount(id: string, patch: Partial<AccountInput>): Promise<void> {
  const clean: Record<string, string | null> = {};
  for (const k of ["naver_id", "naver_pw", "nickname", "memo", "proxy_sessid"] as const) {
    if (k in patch) clean[k] = (patch[k] ?? "").toString().trim() || null;
  }
  const { error } = await supabase.from("moca_accounts").update(clean).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from("moca_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function setSessionSaved(id: string, saved: boolean): Promise<void> {
  const { error } = await supabase.from("moca_accounts").update({ session_saved: saved }).eq("id", id);
  if (error) throw error;
}
