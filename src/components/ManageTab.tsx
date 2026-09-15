// 🛡️ 내 카페 관리 — 내가 운영(매니저)하는 카페의 회원·가입신청·신고글·최근글 모니터링.
// 로그인 필요(매니저 계정). 관리 액션(승인/등업)은 실측 후 추가 — 지금은 현황 보기(읽기) 중심.
import { useState } from "react";
import { botFetch, BOT_BASE } from "../lib/botApi";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeArticle { articleId: string; subject: string; url: string; writeMs: number; }
interface ManageInfo { memberCount?: number; joinRequests: { id?: string; nick?: string; date?: string }[]; reports: { id?: string; subject?: string }[]; recentArticles: CafeArticle[]; diag: string[]; }

const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8, border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)" };
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };
const stepLabel: React.CSSProperties = { color: "var(--m-text)", fontSize: 14, fontWeight: 800, marginBottom: 10, display: "block" };

interface Props { selected: Set<string>; log: UseLog; }

export default function ManageTab({ selected, log }: Props) {
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [cafeId, setCafeId] = useState(() => localStorage.getItem("moca_manage_cafeId") || "");
  const [info, setInfo] = useState<ManageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const accId = [...selected][0];
  const cafeName = cafes.find((c) => c.cafeId === cafeId)?.name || "";
  const cafeUrl = cafes.find((c) => c.cafeId === cafeId)?.url || "";

  async function loadCafes() {
    if (busy) return;
    if (!accId) { log.push("먼저 '카페 계정' 탭에서 계정을 선택하세요", "warn"); return; }
    setBusy("cafes"); log.push("내 카페 목록 불러오는 중…", "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/my/${accId}`); const d = await res.json();
      if (d.cafes?.length) { setCafes(d.cafes); localStorage.setItem("moca_cafes", JSON.stringify(d.cafes)); log.push(`카페 ${d.cafes.length}개`, "success"); }
      else log.push(`카페 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); } finally { setBusy(null); }
  }
  async function loadInfo() {
    if (busy) return;
    if (!accId || !cafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("info"); setInfo(null);
    log.push(`━━ 🛡️ 카페 현황 수집: ${cafeName} ━━`, "sys");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/manage-info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: accId, cafeId, cafeUrl }) });
      const d = await res.json();
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("⚠️") ? "warn" : m.includes("실패") ? "error" : "info"));
      if (d.ok && d.info) { setInfo(d.info); localStorage.setItem("moca_manage_cafeId", cafeId); log.push("✅ 현황 수집 완료", "success"); }
      else log.push(`실패: ${d.error || "?"}`, "error");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); } finally { setBusy(null); }
  }

  const stat = (label: string, val: string | number, color = "var(--m-gold)") => (
    <div style={{ flex: 1, minWidth: 120, background: "var(--m-input)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--m-line2)" }}>
      <div style={{ color: "var(--m-dim)", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>{val}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>
      <div style={{ ...card, background: "var(--m-input)" }}>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          🛡️ <b style={{ color: "var(--m-text)" }}>내 카페 관리</b> — 내가 운영(매니저)하는 카페의 <b style={{ color: "var(--m-gold)" }}>회원·가입신청·신고글·최근글</b>을 한눈에 모니터링해요.
          <br /><span style={{ color: "var(--m-dim)" }}>가입 승인·등업 자동화는 실측 후 추가돼요(지금은 현황 보기). 매니저 계정으로 로그인하세요.</span>
        </p>
      </div>

      <div style={card}>
        <label style={stepLabel}>① 계정 / 카페</label>
        <div style={{ color: accId ? "var(--m-log-success)" : "var(--m-log-warn)", fontSize: 13, marginBottom: 10 }}>{accId ? `✅ 계정: ${accId}` : "⚠️ '카페 계정' 탭에서 매니저 계정을 선택하세요"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => setCafeId(e.target.value)}>
            <option value="">카페 선택…</option>{cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadCafes} disabled={busy === "cafes"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy === "cafes" ? "…" : "🔄"}</button>
        </div>
        <button className="moca-w-btn" onClick={loadInfo} disabled={busy === "info" || !cafeId} style={{ width: "100%", marginTop: 10, background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: busy === "info" ? 0.6 : 1 }}>{busy === "info" ? "수집 중…" : "🛡️ 카페 현황 보기"}</button>
      </div>

      {info && (
        <>
          <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {stat("회원 수", info.memberCount ?? "?")}
            {stat("가입 신청", info.joinRequests.length, info.joinRequests.length ? "var(--m-log-warn)" : "var(--m-gold)")}
            {stat("신고글", info.reports.length, info.reports.length ? "var(--m-log-error)" : "var(--m-gold)")}
            {stat("최근글", info.recentArticles.length)}
          </div>

          {info.joinRequests.length > 0 && (
            <div style={card}>
              <label style={stepLabel}>🙋 가입 신청 {info.joinRequests.length}건</label>
              {info.joinRequests.slice(0, 20).map((j, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--m-line)", fontSize: 12.5 }}>
                  <span style={{ flex: 1, color: "var(--m-text)" }}>{j.nick || j.id}</span>
                  <span style={{ color: "var(--m-dim)", fontSize: 11 }}>{j.date}</span>
                </div>
              ))}
              <p style={{ color: "var(--m-dim)", fontSize: 11, marginTop: 8 }}>승인 버튼은 실측 후 추가돼요.</p>
            </div>
          )}

          {info.recentArticles.length > 0 && (
            <div style={card}>
              <label style={stepLabel}>📰 최근 글 {info.recentArticles.length}개</label>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {info.recentArticles.map((a) => (
                  <a key={a.articleId} href={a.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--m-line)", fontSize: 12.5, textDecoration: "none" }}>
                    <span style={{ flex: 1, minWidth: 0, color: "var(--m-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</span>
                    <span style={{ color: "var(--m-dim)", fontSize: 11, flexShrink: 0 }}>{a.writeMs ? new Date(a.writeMs).toLocaleDateString("ko-KR") : ""}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
