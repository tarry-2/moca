// 📈 카페 유입·조회수 — 발행과 독립적으로 동시 구동(자체 로그·SSE).
// 흐름(테리 확정): 계정 → 카페 → 게시판(카테고리) → 기간 필터 → 글 크롤(링크 수집) → 각 글 유입(조회수↑).
// 카페 목록/게시판은 글쓰기 탭과 동일 봇 API 재사용. 유입은 각 글을 세션 계정으로 방문·체류.
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

const PERIODS = [
  { k: "1w", label: "최근 1주", days: 7 },
  { k: "2w", label: "최근 2주", days: 14 },
  { k: "1m", label: "최근 한달", days: 30 },
  { k: "all", label: "전체", days: 0 },
  { k: "custom", label: "직접 지정", days: -1 },
];

interface Props { selected: Set<string>; log: UseLog; showWindow: boolean; }

export default function InflowTab({ selected, log, showWindow }: Props) {
  // 카페/게시판은 글쓰기 탭이 불러온 것과 공유(localStorage), 없으면 이 탭에서도 불러올 수 있음
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [cafeId, setCafeId] = useState(() => localStorage.getItem("moca_inflow_cafeId") || "");
  const [boards, setBoards] = useState<CafeBoard[]>(() => { try { return JSON.parse(localStorage.getItem("moca_inflow_boards") || "[]"); } catch { return []; } });
  const [menuId, setMenuId] = useState(() => localStorage.getItem("moca_inflow_menuId") || "");
  const [period, setPeriod] = useState("1w");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dwellSec, setDwellSec] = useState(35);   // 각 글 체류 시간(초) — 자연스러운 체류
  const [repeat, setRepeat] = useState(1);        // 각 글 반복 방문 횟수
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const streamRef = useRef<BotEventStream | null>(null);

  const accId = [...selected][0];
  const cafeName = cafes.find((c) => c.cafeId === cafeId)?.name || "";
  const cafeUrl = cafes.find((c) => c.cafeId === cafeId)?.url || "";
  const boardName = boards.find((b) => b.menuId === menuId)?.name || "";

  function periodRange(): { fromMs: number; toMs: number } {
    const p = PERIODS.find((x) => x.k === period);
    if (period === "custom") {
      const f = fromDate ? new Date(fromDate + "T00:00:00").getTime() : 0;
      const t = toDate ? new Date(toDate + "T23:59:59").getTime() : Date.now();
      return { fromMs: f, toMs: t };
    }
    if (!p || p.days === 0) return { fromMs: 0, toMs: Date.now() };
    return { fromMs: Date.now() - p.days * 86400000, toMs: Date.now() };
  }

  async function loadCafes() {
    if (busy) return;
    if (!accId) { log.push("먼저 '카페 계정' 탭에서 계정을 선택하세요", "warn"); return; }
    setBusy("cafes"); log.push("내 카페 목록 불러오는 중… (봇)", "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/my/${accId}`);
      const d = await res.json();
      if (d.cafes?.length) { setCafes(d.cafes); localStorage.setItem("moca_cafes", JSON.stringify(d.cafes)); log.push(`카페 ${d.cafes.length}개 불러옴`, "success"); }
      else log.push(`카페 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); }
    finally { setBusy(null); }
  }

  async function loadBoards() {
    if (busy) return;
    if (!accId || !cafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("boards"); log.push(`게시판 목록 불러오는 중… (${cafeName})`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/boards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: accId, cafeId }) });
      const d = await res.json();
      if (d.boards?.length) { setBoards(d.boards); localStorage.setItem("moca_inflow_boards", JSON.stringify(d.boards)); log.push(`게시판 ${d.boards.length}개 불러옴`, "success"); }
      else log.push(`게시판 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); }
    finally { setBusy(null); }
  }

  // ⑤⑥ 글 크롤 + 링크 수집 (기간 필터 적용)
  async function crawlArticles() {
    if (busy) return;
    if (!accId || !cafeId || !menuId) { log.push("계정·카페·게시판을 먼저 선택하세요", "warn"); return; }
    const { fromMs, toMs } = periodRange();
    setBusy("crawl");
    log.push(`━━ 📰 글 크롤 시작: [${cafeName}] ${boardName} · ${PERIODS.find(p => p.k === period)?.label} ━━`, "sys");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/articles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: accId, cafeId, cafeUrl, menuId, fromMs, toMs, maxPages: 5 }),
      });
      const d = await res.json();
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("실패") || m.includes("오류") ? "error" : "info"));
      const list: Article[] = (d.articles || []).filter((a: Article) => (!fromMs || a.writeMs >= fromMs) && a.writeMs <= toMs);
      setArticles(list);
      setPicked(new Set(list.map((a) => a.articleId)));
      log.push(`📰 글 ${list.length}개 수집(기간 필터 적용) — 유입 대상으로 전체 선택됨`, list.length ? "success" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); }
    finally { setBusy(null); }
  }

  function togglePick(id: string) { setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function pickAll() { setPicked(new Set(articles.map((a) => a.articleId))); }
  function pickNone() { setPicked(new Set()); }

  // ⑦ 유입 시작 (SSE 실시간). 각 글을 세션 계정으로 방문·체류 → 조회수.
  function startInflow() {
    if (running) return;
    const targets = articles.filter((a) => picked.has(a.articleId));
    if (!accId) { log.push("먼저 계정을 선택하세요", "warn"); return; }
    if (!targets.length) { log.push("유입할 글을 먼저 크롤·선택하세요", "warn"); return; }
    setRunning(true); setProg({ done: 0, total: targets.length * repeat });
    log.push(`━━ 🚦 유입 시작: ${targets.length}개 글 × ${repeat}회 · 글당 체류 ${dwellSec}초 ━━`, "sys");
    log.push(`창보기 ${showWindow ? "ON(크롬 창 뜸)" : "OFF(백그라운드+캡처)"}`, "progress");
    const es = new BotEventStream(`${BOT_BASE}/api/cafe/inflow`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: accId, cafeId, cafeUrl, articles: targets, dwellSec, repeat, showWindow }),
    });
    streamRef.current = es;
    es.onmessage = (ev) => {
      let d: any; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type === "log") {
        const m = String(d.msg || "");
        const type = m.includes("⚠️") ? "warn" : (m.includes("실패") || m.includes("오류") || m.includes("❌")) ? "error" : (m.includes("✅") || m.includes("🎉")) ? "success" : "info";
        log.push(m, type);
      } else if (d.type === "shot") { log.shot(d.caption, d.dataUrl); }
      else if (d.type === "progress") { setProg({ done: d.done, total: d.total }); }
      else if (d.type === "done") {
        log.push(d.success ? `🎉 유입 완료: 조회 ${d.viewed}회 (${d.ok}/${d.total})` : `유입 종료: ${d.error || "중단"}`, d.success ? "success" : "warn");
        es.close(); streamRef.current = null; setRunning(false);
      }
    };
    es.onerror = () => { log.push("봇 연결 오류 (데스크톱 앱에서 실행 필요)", "error"); streamRef.current = null; setRunning(false); };
    es.onclose = () => { if (running) setRunning(false); };
  }

  function stopInflow() {
    streamRef.current?.close(); streamRef.current = null;
    botFetch(`${BOT_BASE}/api/cafe/inflow-cancel`, { method: "POST" }).catch(() => {});
    setRunning(false);
    log.push("🛑 유입 중단됨", "warn");
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      <div style={{ ...card, background: "var(--m-input)" }}>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          📈 <b style={{ color: "var(--m-text)" }}>카페 유입·조회수</b> — 발행과 <b style={{ color: "var(--m-gold)" }}>따로 동시에</b> 돌아가요(로그도 분리).
          <br />흐름: <b>계정 → 카페 → 게시판 → 기간 → 글 크롤 → 유입</b>. 각 글을 실제 방문·체류해 조회수를 올려요.
          <br /><span style={{ color: "var(--m-log-warn)" }}>⚠️ 밴 방지</span>를 위해 글당 체류를 넉넉히, 한 번에 너무 많이 돌리지 마세요.
        </p>
      </div>

      {/* ① 계정 */}
      <div style={card}>
        <label style={stepLabel}>① 계정</label>
        <div style={{ color: accId ? "var(--m-log-success)" : "var(--m-log-warn)", fontSize: 13 }}>
          {accId ? `✅ 선택됨: ${accId}` : "⚠️ '카페 계정' 탭에서 계정을 선택하세요"}
        </div>
      </div>

      {/* ② 카페 */}
      <div style={card}>
        <label style={stepLabel}>② 카페</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => { setCafeId(e.target.value); localStorage.setItem("moca_inflow_cafeId", e.target.value); }}>
            <option value="">카페 선택…</option>
            {cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadCafes} disabled={busy === "cafes"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "cafes" ? "…" : "🔄 불러오기"}</button>
        </div>
      </div>

      {/* ③ 게시판 */}
      <div style={card}>
        <label style={stepLabel}>③ 게시판(카테고리)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={menuId} onChange={(e) => { setMenuId(e.target.value); localStorage.setItem("moca_inflow_menuId", e.target.value); }}>
            <option value="">게시판 선택…</option>
            {boards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadBoards} disabled={busy === "boards"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "boards" ? "…" : "🔄 불러오기"}</button>
        </div>
      </div>

      {/* ④ 기간 필터 */}
      <div style={card}>
        <label style={stepLabel}>④ 기간 필터</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: period === "custom" ? 10 : 0 }}>
          {PERIODS.map((p) => (
            <button key={p.k} className="moca-w-btn" onClick={() => setPeriod(p.k)} style={{ background: period === p.k ? "var(--m-gold)" : "var(--m-tabhover)", color: period === p.k ? "var(--m-goldink)" : "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{p.label}</button>
          ))}
        </div>
        {period === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" className="moca-in" style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span style={{ color: "var(--m-sub)" }}>~</span>
            <input type="date" className="moca-in" style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        )}
      </div>

      {/* ⑤ 글 크롤 */}
      <div style={card}>
        <label style={stepLabel}>⑤ 글 크롤 (링크 수집)</label>
        <button className="moca-w-btn" onClick={crawlArticles} disabled={busy === "crawl"} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: busy === "crawl" ? 0.6 : 1 }}>
          {busy === "crawl" ? "크롤 중…" : "📰 이 게시판 글 크롤"}
        </button>
        {articles.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 700 }}>글 {articles.length}개 · 선택 {picked.size}개</span>
              <button className="moca-w-btn" onClick={pickAll} style={{ marginLeft: "auto", background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>전체선택</button>
              <button className="moca-w-btn" onClick={pickNone} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>해제</button>
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--m-line)", borderRadius: 8 }}>
              {articles.map((a) => (
                <label key={a.articleId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: "1px solid var(--m-line)", cursor: "pointer", fontSize: 12.5 }}>
                  <input type="checkbox" checked={picked.has(a.articleId)} onChange={() => togglePick(a.articleId)} style={{ width: "auto" }} />
                  <span style={{ flex: 1, minWidth: 0, color: "var(--m-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</span>
                  <span style={{ color: "var(--m-dim)", fontSize: 11, flexShrink: 0 }}>{a.writeMs ? new Date(a.writeMs).toLocaleDateString("ko-KR") : ""}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ⑥ 유입 설정 + 실행 */}
      <div style={card}>
        <label style={stepLabel}>⑥ 유입 설정</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>글당 체류(초)</label>
            <input type="number" min={10} max={180} className="moca-in" style={{ ...inputStyle, width: 110 }} value={dwellSec} onChange={(e) => setDwellSec(Math.max(10, Number(e.target.value) || 35))} />
          </div>
          <div>
            <label style={labelStyle}>각 글 반복(회)</label>
            <input type="number" min={1} max={10} className="moca-in" style={{ ...inputStyle, width: 110 }} value={repeat} onChange={(e) => setRepeat(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>
        {running && <div style={{ color: "var(--m-sub)", fontSize: 12.5, marginBottom: 8 }}>진행 {prog.done}/{prog.total}</div>}
        {!running ? (
          <button className="moca-w-btn" onClick={startInflow} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>🚦 유입 시작</button>
        ) : (
          <button className="moca-w-btn" onClick={stopInflow} style={{ width: "100%", background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>🛑 중단</button>
        )}
      </div>
    </div>
  );
}
