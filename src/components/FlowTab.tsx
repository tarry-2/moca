// 🌈 플로우(구글 Flow 무료이미지) 계정 관리 — 추가/삭제 + 전체·부분 연결.
// 토큰(크레딧) 소진 시 다음 계정으로 자동 전환(slot 순서). 다 쓰면 멈추고 로그.
import { useEffect, useState } from "react";
import { FlowAccount, listFlowAccounts, addFlowAccount, deleteFlowAccount, setFlowConnected } from "../lib/flowAccounts";
import type { UseLog } from "../lib/useLog";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)",
};
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };

export default function FlowTab({ log }: { log: UseLog }) {
  const [accts, setAccts] = useState<FlowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [memo, setMemo] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try { setAccts(await listFlowAccounts()); setErr(""); }
    catch (e: any) { setErr("불러오기 실패(테이블 SQL 실행했나요?): " + (e?.message || e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function add() {
    if (!email.trim()) { setErr("구글 이메일을 입력하세요"); return; }
    setBusy(true);
    try {
      const a = await addFlowAccount(email, memo);
      log.push(`플로우 계정 추가: ${a.google_email} (slot ${a.slot})`, "success");
      setEmail(""); setMemo(""); await reload();
    } catch (e: any) { setErr("추가 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  async function del(a: FlowAccount) {
    setBusy(true);
    try {
      await deleteFlowAccount(a.id);
      log.push(`플로우 계정 삭제: ${a.google_email}`, "warn");
      setConfirmDel(null); if (sel.has(a.id)) toggle(a.id); await reload();
    } catch (e: any) { setErr("삭제 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  // electron이 flow 크롬(slot별 프로필/포트)을 띄움 → 창에서 구글 로그인 1회 → connected. 한 계정씩 순차.
  async function connect(targets: FlowAccount[]) {
    if (!targets.length) { log.push("연결할 계정을 선택하세요", "warn"); return; }
    if (!window.electron?.flowLaunchChrome) { log.push("플로우 연결은 데스크톱 앱에서만 돼요(웹 미리보기엔 없음)", "error"); return; }
    setBusy(true);
    log.push(`━━ 🌈 플로우 연결 시작: ${targets.length}개 ━━`, "sys");
    for (const a of targets) {
      log.push(`[slot ${a.slot}] ${a.google_email} 크롬 여는 중… 창에서 구글 로그인 1회 해주세요`, "progress");
      try {
        const d: any = await window.electron.flowLaunchChrome(a.slot ?? 0);
        if (d?.ok) { await setFlowConnected(a.id, true); log.push(`[slot ${a.slot}] 크롬 열림 (포트 ${d.port}) — 구글 로그인 후 Flow 페이지 준비`, "success"); }
        else log.push(`[slot ${a.slot}] 실패: ${d?.error || "?"}`, "error");
      } catch (e: any) {
        log.push(`[slot ${a.slot}] 실행 실패: ${e?.message || e}`, "error");
      }
    }
    await reload();
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <style>{`.moca-f-btn:hover{filter:brightness(1.12)} .moca-f-btn:active{transform:scale(.96)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      <div style={card}>
        <b style={{ color: "var(--m-text)", fontSize: 15 }}>🌈 플로우란?</b>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: "6px 0 0", lineHeight: 1.6 }}>
          구글 Flow(무료 이미지 생성)로 카페 글에 넣을 이미지를 만들어요. 계정마다 <b style={{ color: "var(--m-gold)" }}>일일 무료 크레딧</b>이 있어,
          여러 개 등록하면 <b>토큰이 소진될 때 다음 계정으로 자동 전환</b>해 계속 만들고, 전부 소진되면 멈추고 로그에 남겨요.
        </p>
      </div>

      {/* 추가 */}
      <div style={card}>
        <b style={{ color: "var(--m-text)", fontSize: 14, fontWeight: 800 }}>➕ 구글 계정 추가</b>
        <div style={{ display: "flex", gap: 8, margin: "12px 0 8px" }}>
          <input className="moca-in" style={{ ...inputStyle, flex: 2 }} value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} placeholder="구글 이메일 (예: mycafe1@gmail.com)" />
          <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(선택)" />
        </div>
        {err && <div style={{ color: "var(--m-log-error)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
        <button className="moca-f-btn" disabled={busy} onClick={add} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 9, padding: "10px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>추가</button>
      </div>

      {/* 목록 + 연결 */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <b style={{ color: "var(--m-text)", fontSize: 14, fontWeight: 800 }}>📋 플로우 계정 <span style={{ color: "var(--m-dim)", fontWeight: 600, fontSize: 13 }}>· {accts.length}개</span></b>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="moca-f-btn" disabled={busy || !accts.length} onClick={() => connect(accts)} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>🔗 전체 연결</button>
            <button className="moca-f-btn" disabled={busy || !sel.size} onClick={() => connect(accts.filter(a => sel.has(a.id)))} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>🔗 부분 연결 ({sel.size})</button>
          </span>
        </div>

        {loading ? (
          <div style={{ color: "var(--m-dim)", fontSize: 13, padding: 12 }}>불러오는 중…</div>
        ) : accts.length === 0 ? (
          <div style={{ color: "var(--m-dim)", fontSize: 13, padding: 16, textAlign: "center" }}>등록된 플로우 계정이 없어요. 위에서 추가하세요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accts.map((a) => {
              const on = sel.has(a.id);
              return (
                <div key={a.id} onClick={() => toggle(a.id)} style={{ display: "flex", alignItems: "center", gap: 12, border: on ? "1px solid var(--m-gold)" : "1px solid var(--m-line)", borderRadius: 10, padding: "10px 12px", cursor: "pointer", background: on ? "var(--m-tabhover)" : "transparent" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid " + (on ? "var(--m-gold)" : "var(--m-line2)"), background: on ? "var(--m-gold)" : "transparent", color: "var(--m-goldink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{on ? "✓" : ""}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: "var(--m-text)", fontSize: 14, fontWeight: 700 }}>
                      <span style={{ color: "var(--m-gold)", fontSize: 12 }}>slot {a.slot}</span> · {a.google_email}
                    </div>
                    <div style={{ color: "var(--m-dim)", fontSize: 11.5, marginTop: 2 }}>
                      <span style={{ color: a.connected ? "var(--m-log-success)" : "var(--m-log-warn)" }}>{a.connected ? "✅ 연결됨" : "⚠️ 연결 필요"}</span>
                      {a.memo ? " · " + a.memo : ""}
                    </div>
                  </div>
                  {confirmDel === a.id ? (
                    <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button className="moca-f-btn" disabled={busy} onClick={() => del(a)} style={{ background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>삭제 확인</button>
                      <button className="moca-f-btn" onClick={() => setConfirmDel(null)} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>취소</button>
                    </span>
                  ) : (
                    <span onClick={(e) => e.stopPropagation()}>
                      <button className="moca-f-btn" onClick={() => setConfirmDel(a.id)} title="삭제" style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 7, padding: "6px 9px", fontSize: 12, cursor: "pointer" }}>🗑️</button>
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
