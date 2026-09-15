// 💬 활동·등업 — 육성 계정으로 카페 글에 좋아요·댓글 + 출석. 등급 올리기(등업 조건 충족).
// ⚠️ 로그인 필요(육성 계정). 과하면 밴 → 소량·사람처럼 천천히·텀. 카페 규정 존중.
import { useState, useRef } from "react";
import { botFetch, BOT_BASE, BotEventStream } from "../lib/botApi";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeBoard { menuId: string; name: string; type: string; }
interface Article { articleId: string; subject: string; url: string; writeMs: number; }

const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8, border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)" };
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };
const stepLabel: React.CSSProperties = { color: "var(--m-text)", fontSize: 14, fontWeight: 800, marginBottom: 10, display: "block" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--m-sub)", marginBottom: 4, display: "block" };

const DEFAULT_COMMENTS = ["좋은 정보 감사합니다 :)", "잘 보고 갑니다~", "유익한 글이네요!", "도움 많이 됐어요 감사해요", "오 좋은 글 감사합니다", "잘 읽었습니다 :)"];

interface Props { selected: Set<string>; log: UseLog; showWindow: boolean; }

export default function ActivityTab({ selected, log, showWindow }: Props) {
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [cafeId, setCafeId] = useState(() => localStorage.getItem("moca_act_cafeId") || "");
  const [boards, setBoards] = useState<CafeBoard[]>(() => { try { return JSON.parse(localStorage.getItem("moca_act_boards") || "[]"); } catch { return []; } });
  const [menuId, setMenuId] = useState(() => localStorage.getItem("moca_act_menuId") || "");
  const [articles, setArticles] = useState<Article[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [doLike, setDoLike] = useState(true);
  const [doComment, setDoComment] = useState(false);
  const [doAttend, setDoAttend] = useState(false);
  const [attendUrl, setAttendUrl] = useState(() => localStorage.getItem("moca_act_attend_url") || "");
  const [commentText, setCommentText] = useState(() => localStorage.getItem("moca_act_comments") || DEFAULT_COMMENTS.join("\n"));
  const [termSec, setTermSec] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const streamRef = useRef<BotEventStream | null>(null);

  const accId = [...selected][0];
  const cafeName = cafes.find((c) => c.cafeId === cafeId)?.name || "";
  const cafeUrl = cafes.find((c) => c.cafeId === cafeId)?.url || "";
  const boardName = boards.find((b) => b.menuId === menuId)?.name || "";

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
  async function loadBoards() {
    if (busy) return;
    if (!accId || !cafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("boards"); log.push(`게시판 불러오는 중… (${cafeName})`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/boards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: accId, cafeId }) });
      const d = await res.json();
      if (d.boards?.length) { setBoards(d.boards); localStorage.setItem("moca_act_boards", JSON.stringify(d.boards)); log.push(`게시판 ${d.boards.length}개`, "success"); }
      else log.push(`게시판 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); } finally { setBusy(null); }
  }
  async function crawl() {
    if (busy) return;
    if (!accId || !cafeId || !menuId) { log.push("계정·카페·게시판을 먼저 선택하세요", "warn"); return; }
    setBusy("crawl"); log.push(`━━ 📰 활동 대상 글 크롤: [${cafeName}] ${boardName} ━━`, "sys");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/articles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: accId, cafeId, cafeUrl, menuId, maxPages: 3 }) });
      const d = await res.json();
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("실패") ? "error" : "info"));
      const list: Article[] = d.articles || [];
      setArticles(list); setPicked(new Set(list.slice(0, 5).map((a) => a.articleId)));
      log.push(`📰 글 ${list.length}개 — 처음 5개 선택됨(과하지 않게)`, list.length ? "success" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); } finally { setBusy(null); }
  }
  function togglePick(id: string) { setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  function start() {
    if (running) return;
    if (!accId) { log.push("계정을 먼저 선택하세요", "warn"); return; }
    const targets = articles.filter((a) => picked.has(a.articleId));
    if (!targets.length && !(doAttend && attendUrl.trim())) { log.push("활동할 글을 선택하거나 출석 URL을 넣으세요", "warn"); return; }
    if (!doLike && !doComment && !doAttend) { log.push("좋아요·댓글·출석 중 하나는 켜세요", "warn"); return; }
    localStorage.setItem("moca_act_comments", commentText);
    localStorage.setItem("moca_act_attend_url", attendUrl);
    localStorage.setItem("moca_act_cafeId", cafeId); localStorage.setItem("moca_act_menuId", menuId);
    setRunning(true); setProg({ done: 0, total: targets.length });
    log.push(`━━ 💬 활동 시작: ${targets.length}개 글 · ${[doLike && "좋아요", doComment && "댓글", doAttend && "출석"].filter(Boolean).join("·")} ━━`, "sys");
    log.push(`창보기 ${showWindow ? "ON" : "OFF"} · 글 사이 텀 ${termSec}~${termSec + 6}초(사람처럼)`, "progress");
    const commentTexts = commentText.split("\n").map((s) => s.trim()).filter(Boolean);
    const es = new BotEventStream(`${BOT_BASE}/api/cafe/activity`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: accId, cafeId, cafeUrl, articles: targets, doLike, doComment, commentTexts, attendMenuUrl: doAttend ? attendUrl.trim() : "", perActionMinSec: termSec, showWindow }),
    });
    streamRef.current = es;
    es.onmessage = (ev) => {
      let d: any; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type === "log") { const m = String(d.msg || ""); log.push(m, m.includes("⚠️") ? "warn" : (m.includes("실패") || m.includes("❌")) ? "error" : (m.includes("✅") || m.includes("👍") || m.includes("🎉")) ? "success" : "info"); }
      else if (d.type === "shot") log.shot(d.caption, d.dataUrl);
      else if (d.type === "progress") setProg({ done: d.done, total: d.total });
      else if (d.type === "done") { log.push(d.success ? `🎉 활동 완료: 좋아요 ${d.liked} · 댓글 ${d.commented}${d.attended ? " · 출석 ✅" : ""}` : `활동 종료: ${d.error || "중단"}`, d.success ? "success" : "warn"); es.close(); streamRef.current = null; setRunning(false); }
    };
    es.onerror = () => { log.push("봇 연결 오류 (데스크톱 앱 필요)", "error"); streamRef.current = null; setRunning(false); };
    es.onclose = () => setRunning((r) => (r ? false : r));
  }
  function stop() {
    streamRef.current?.close(); streamRef.current = null;
    botFetch(`${BOT_BASE}/api/cafe/activity-cancel`, { method: "POST" }).catch(() => {});
    setRunning(false); log.push("🛑 활동 중단됨", "warn");
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>
      <div style={{ ...card, background: "var(--m-input)" }}>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          💬 <b style={{ color: "var(--m-text)" }}>활동·등업</b> — 육성 계정으로 카페 글에 <b style={{ color: "var(--m-gold)" }}>좋아요·댓글</b>을 달고 <b style={{ color: "var(--m-gold)" }}>출석</b>해 등급(등업 조건)을 채워요.
          <br /><span style={{ color: "var(--m-log-warn)" }}>⚠️ 로그인 필요 · 과하면 밴</span> — 하루 조금씩, 사람처럼 천천히, 카페 규정을 지키세요.
        </p>
      </div>

      <div style={card}>
        <label style={stepLabel}>① 계정</label>
        <div style={{ color: accId ? "var(--m-log-success)" : "var(--m-log-warn)", fontSize: 13 }}>{accId ? `✅ 선택됨: ${accId}` : "⚠️ '카페 계정' 탭에서 육성 계정을 선택하세요"}</div>
      </div>

      <div style={card}>
        <label style={stepLabel}>② 카페 / 게시판</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => { setCafeId(e.target.value); localStorage.setItem("moca_act_cafeId", e.target.value); }}>
            <option value="">카페 선택…</option>{cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadCafes} disabled={busy === "cafes"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy === "cafes" ? "…" : "🔄"}</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={menuId} onChange={(e) => { setMenuId(e.target.value); localStorage.setItem("moca_act_menuId", e.target.value); }}>
            <option value="">게시판 선택…</option>{boards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadBoards} disabled={busy === "boards"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy === "boards" ? "…" : "🔄"}</button>
        </div>
      </div>

      <div style={card}>
        <label style={stepLabel}>③ 활동할 글 (크롤 → 선택)</label>
        <button className="moca-w-btn" onClick={crawl} disabled={busy === "crawl"} style={{ width: "100%", background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: articles.length ? 10 : 0 }}>{busy === "crawl" ? "크롤 중…" : "📰 최근 글 불러오기"}</button>
        {articles.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--m-line)", borderRadius: 8 }}>
            {articles.map((a) => (
              <label key={a.articleId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: "1px solid var(--m-line)", cursor: "pointer", fontSize: 12.5 }}>
                <input type="checkbox" checked={picked.has(a.articleId)} onChange={() => togglePick(a.articleId)} style={{ width: "auto" }} />
                <span style={{ flex: 1, minWidth: 0, color: "var(--m-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <label style={stepLabel}>④ 활동 종류</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: 13.5, color: "var(--m-text)" }}><input type="checkbox" checked={doLike} onChange={(e) => setDoLike(e.target.checked)} style={{ width: "auto" }} />👍 좋아요(공감)</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: 13.5, color: "var(--m-text)" }}><input type="checkbox" checked={doComment} onChange={(e) => setDoComment(e.target.checked)} style={{ width: "auto" }} />💬 댓글</label>
        {doComment && <textarea className="moca-in" style={{ ...inputStyle, minHeight: 70, resize: "vertical", margin: "4px 0 8px" }} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="댓글 후보(한 줄에 하나, 랜덤으로 사용)" />}
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: 13.5, color: "var(--m-text)" }}><input type="checkbox" checked={doAttend} onChange={(e) => setDoAttend(e.target.checked)} style={{ width: "auto" }} />📅 출석</label>
        {doAttend && <input className="moca-in" style={{ ...inputStyle, marginTop: 4 }} value={attendUrl} onChange={(e) => setAttendUrl(e.target.value)} placeholder="출석부 게시판 URL (카페마다 달라요)" />}
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>글 사이 텀(초, 사람처럼)</label>
          <input type="number" min={5} max={120} className="moca-in" style={{ ...inputStyle, width: 110 }} value={termSec} onChange={(e) => setTermSec(Math.max(5, Number(e.target.value) || 10))} />
        </div>
      </div>

      <div style={card}>
        {running && <div style={{ color: "var(--m-sub)", fontSize: 12.5, marginBottom: 8 }}>진행 {prog.done}/{prog.total}</div>}
        {!running ? (
          <button className="moca-w-btn" onClick={start} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>💬 활동 시작</button>
        ) : (
          <button className="moca-w-btn" onClick={stop} style={{ width: "100%", background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>🛑 중단</button>
        )}
      </div>
    </div>
  );
}
