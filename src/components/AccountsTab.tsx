// 👤 카페 계정 관리 — 네이버 계정 추가/저장/삭제/선택 (Supabase moca_accounts 영속)
// 선택한 계정들로 글쓰기·발행·활동·유입을 순차 실행한다(다중 선택).
import { useEffect, useState } from "react";
import { CafeAccount, AccountInput, listAccounts, addAccount, updateAccount, deleteAccount, setSessionSaved } from "../lib/accounts";
import { botFetch, BOT_BASE } from "../lib/botApi";
import PasswordInput from "./PasswordInput";
import type { UseLog } from "../lib/useLog";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--m-sub)", marginBottom: 4, display: "block" };

interface Props {
  selected: Set<string>;
  onToggle: (id: string) => void;
  log: UseLog;
  onChanged?: () => void; // 계정 추가/수정/삭제 후 App의 계정 목록(로그용 단일 소스)을 다시 로드
}

export default function AccountsTab({ selected, onToggle, log, onChanged }: Props) {
  const [accounts, setAccounts] = useState<CafeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<AccountInput>({ naver_id: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AccountInput>({ naver_id: "" });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try { setAccounts(await listAccounts()); setErr(""); onChanged?.(); } // App 단일 소스도 함께 갱신(로그 계정명 정확)
    catch (e: any) { setErr("계정 불러오기 실패: " + (e?.message || e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function onAdd() {
    if (!form.naver_id.trim()) { setErr("네이버 아이디는 필수예요"); return; }
    setBusy(true);
    try {
      const acc = await addAccount(form);
      log.push(`계정 추가됨: ${acc.naver_id}`, "success", acc.naver_id);
      setForm({ naver_id: "" });
      await reload();
    } catch (e: any) { setErr("추가 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  function startEdit(a: CafeAccount) {
    setEditingId(a.id);
    setEditForm({ naver_id: a.naver_id, naver_pw: a.naver_pw || "", nickname: a.nickname || "", memo: a.memo || "", proxy_sessid: a.proxy_sessid || "" });
  }
  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await updateAccount(id, editForm);
      log.push(`계정 수정됨: ${editForm.naver_id}`, "info", editForm.naver_id);
      setEditingId(null);
      await reload();
    } catch (e: any) { setErr("수정 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }
  async function onDelete(a: CafeAccount) {
    setBusy(true);
    try {
      await deleteAccount(a.id);
      log.push(`계정 삭제됨: ${a.naver_id}`, "warn", a.naver_id);
      setConfirmDel(null);
      if (selected.has(a.id)) onToggle(a.id);
      await reload();
    } catch (e: any) { setErr("삭제 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  // 🔑 봇으로 네이버 로그인 → 세션 저장 (save-session 재사용). 데스크톱 앱에서만 봇이 떠 동작.
  async function login(a: CafeAccount) {
    if (!a.naver_pw) { setErr(`${a.naver_id}: 비밀번호가 없어요. ✏️수정에서 입력해 주세요.`); return; }
    setBusy(true);
    log.push(`━━━━━ 로그인 시작: ${a.naver_id} ━━━━━`, "sys", a.naver_id);
    log.push("봇이 크롬을 띄워 네이버 로그인 중…", "progress", a.naver_id);
    try {
      const res = await botFetch(`${BOT_BASE}/api/naver/save-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: a.id, id: a.naver_id, pw: a.naver_pw }),
      });
      const d = await res.json();
      if (d.success) {
        log.push("로그인 성공 · 세션 저장 완료", "success", a.naver_id);
        await setSessionSaved(a.id, true);
        await reload();
      } else {
        log.push(`로그인 실패: ${d.error || "알 수 없음"}`, "error", a.naver_id);
      }
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} — 데스크톱 앱에서 실행해야 봇이 떠요(웹 미리보기엔 봇 없음)`, "error", a.naver_id);
    } finally { setBusy(false); }
  }

  const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 720 }}>
      <style>{`.moca-acc-btn:hover{filter:brightness(1.12)} .moca-acc-btn:active{transform:scale(.96)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      {/* ➕ 계정 추가 */}
      <div style={card}>
        <b style={{ color: "var(--m-text)", fontSize: 15 }}>➕ 네이버 계정 추가</b>
        <p style={{ color: "var(--m-sub)", fontSize: 12, margin: "4px 0 14px", lineHeight: 1.5 }}>
          카페 활동에 쓸 네이버 계정을 등록해요. 아이디는 필수, 나머지는 선택.<br />
          <b style={{ color: "var(--m-gold)" }}>고정 IP(프록시 sessid)</b>를 넣으면 이 계정은 항상 같은 IP로 나가 연좌제 밴을 피해요.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={labelStyle}>네이버 아이디 *</label><input className="moca-in" style={inputStyle} value={form.naver_id} onChange={(e) => { setForm({ ...form, naver_id: e.target.value }); setErr(""); }} placeholder="아이디" /></div>
          <div><label style={labelStyle}>비밀번호</label><PasswordInput value={form.naver_pw || ""} onChange={(v) => setForm({ ...form, naver_pw: v })} placeholder="비밀번호" /></div>
          <div><label style={labelStyle}>닉네임(표시용)</label><input className="moca-in" style={inputStyle} value={form.nickname || ""} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="예: 육아맘계정" /></div>
          <div><label style={labelStyle}>프록시 sessid(고정IP)</label><input className="moca-in" style={inputStyle} value={form.proxy_sessid || ""} onChange={(e) => setForm({ ...form, proxy_sessid: e.target.value })} placeholder="비우면 미사용" /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={labelStyle}>메모</label><input className="moca-in" style={inputStyle} value={form.memo || ""} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="예: 정회원 승급 완료" /></div>
        {err && <div style={{ color: "var(--m-log-error)", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button className="moca-acc-btn" disabled={busy} onClick={onAdd} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 9, padding: "11px 20px", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "저장 중…" : "계정 추가"}
        </button>
      </div>

      {/* 📋 계정 목록 */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <b style={{ color: "var(--m-text)", fontSize: 15 }}>📋 등록된 계정 <span style={{ color: "var(--m-dim)", fontWeight: 600, fontSize: 13 }}>· {accounts.length}개</span></b>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--m-gold)" }}>✔ 선택 {selected.size}개</span>
        </div>

        {loading ? (
          <div style={{ color: "var(--m-dim)", fontSize: 13, padding: 12 }}>불러오는 중…</div>
        ) : accounts.length === 0 ? (
          <div style={{ color: "var(--m-dim)", fontSize: 13, padding: 16, textAlign: "center" }}>아직 등록된 계정이 없어요. 위에서 추가해 주세요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accounts.map((a) => {
              const on = selected.has(a.id);
              if (editingId === a.id) {
                return (
                  <div key={a.id} style={{ border: "1px solid var(--m-gold)", borderRadius: 10, padding: 12, background: "var(--m-input)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input className="moca-in" style={inputStyle} value={editForm.naver_id} onChange={(e) => setEditForm({ ...editForm, naver_id: e.target.value })} placeholder="아이디" />
                      <PasswordInput value={editForm.naver_pw || ""} onChange={(v) => setEditForm({ ...editForm, naver_pw: v })} placeholder="비밀번호" />
                      <input className="moca-in" style={inputStyle} value={editForm.nickname || ""} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} placeholder="닉네임" />
                      <input className="moca-in" style={inputStyle} value={editForm.proxy_sessid || ""} onChange={(e) => setEditForm({ ...editForm, proxy_sessid: e.target.value })} placeholder="프록시 sessid" />
                    </div>
                    <input className="moca-in" style={{ ...inputStyle, marginBottom: 8 }} value={editForm.memo || ""} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} placeholder="메모" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="moca-acc-btn" disabled={busy} onClick={() => saveEdit(a.id)} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 저장</button>
                      <button className="moca-acc-btn" onClick={() => setEditingId(null)} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>취소</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={a.id} onClick={() => onToggle(a.id)} style={{ display: "flex", alignItems: "center", gap: 12, border: on ? "1px solid var(--m-gold)" : "1px solid var(--m-line)", borderRadius: 10, padding: "10px 12px", cursor: "pointer", background: on ? "var(--m-tabhover)" : "transparent" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid " + (on ? "var(--m-gold)" : "var(--m-line2)"), background: on ? "var(--m-gold)" : "transparent", color: "var(--m-goldink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{on ? "✓" : ""}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: "var(--m-text)", fontSize: 14, fontWeight: 700 }}>
                      {a.naver_id}
                      {a.nickname && <span style={{ color: "var(--m-sub)", fontWeight: 500, fontSize: 12.5 }}> · {a.nickname}</span>}
                    </div>
                    <div style={{ color: "var(--m-dim)", fontSize: 11.5, marginTop: 2 }}>
                      {a.proxy_sessid ? "🔒 고정IP" : "🌐 IP 미지정"}
                      <span style={{ color: a.session_saved ? "var(--m-log-success)" : "var(--m-log-warn)" }}>
                        {a.session_saved ? " · ✅ 세션 있음" : " · ⚠️ 로그인 필요"}
                      </span>
                      {a.memo ? " · " + a.memo : ""}
                    </div>
                  </div>
                  {confirmDel === a.id ? (
                    <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button className="moca-acc-btn" disabled={busy} onClick={() => onDelete(a)} style={{ background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>삭제 확인</button>
                      <button className="moca-acc-btn" onClick={() => setConfirmDel(null)} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>취소</button>
                    </span>
                  ) : (
                    <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button className="moca-acc-btn" disabled={busy} onClick={() => login(a)} title="봇으로 네이버 로그인 후 세션 저장(데스크톱 앱에서 동작)" style={{ background: a.session_saved ? "var(--m-tabhover)" : "var(--m-gold)", color: a.session_saved ? "var(--m-text)" : "var(--m-goldink)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{a.session_saved ? "🔑 재로그인" : "🔑 로그인"}</button>
                      <button className="moca-acc-btn" onClick={() => startEdit(a)} title="수정" style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 9px", fontSize: 12, cursor: "pointer" }}>✏️</button>
                      <button className="moca-acc-btn" onClick={() => setConfirmDel(a.id)} title="삭제" style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 9px", fontSize: 12, cursor: "pointer" }}>🗑️</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
