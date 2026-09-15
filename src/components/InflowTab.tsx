// 📈 카페 유입·조회수 — 발행과 독립 동시 구동(자체 로그·SSE). 🔓 유입 방문은 비로그인(익명)이라 계정 보호조치 위험 없음.
// 모드1(빠른유입·비로그인): 카페 주소 → 랜덤 자동 방문 / 글 링크 직접 → 그 글 집중 유입. 계정 불필요.
// 모드2(카테고리 순환·로그인): 계정 로그인 → 카페 → 카테고리 → 기간 → 글 크롤 → 순환 유입(방문은 익명).
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
  const [mode, setMode] = useState<"quick" | "category">("quick");

  // ── 공통 유입 설정 ──
  const [dwellSec, setDwellSec] = useState(35);   // 각 글 체류(초)
  const [repeat, setRepeat] = useState(1);        // 각 글 반복 방문
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const streamRef = useRef<BotEventStream | null>(null);

  // ── 모드1(빠른유입) 상태 ──
  const [quickCafeAddr, setQuickCafeAddr] = useState(() => localStorage.getItem("moca_inflow_quick_addr") || "");
  const [randomCount, setRandomCount] = useState(10); // 랜덤 방문할 글 개수
  const [focusLinks, setFocusLinks] = useState("");   // 집중 유입할 글 링크(줄바꿈)

  // ── 모드2(카테고리 순환) 상태 ──
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [cafeId, setCafeId] = useState(() => localStorage.getItem("moca_inflow_cafeId") || "");
  const [boards, setBoards] = useState<CafeBoard[]>(() => { try { return JSON.parse(localStorage.getItem("moca_inflow_boards") || "[]"); } catch { return []; } });
  const [menuId, setMenuId] = useState(() => localStorage.getItem("moca_inflow_menuId") || "");
  const [period, setPeriod] = useState("1w");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

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

  // 공통: 유입 SSE 실행
  function runInflow(payload: object, label: string) {
    if (running) return;
    setRunning(true); setProg({ done: 0, total: 0 });
    log.push(`━━ 🚦 유입 시작: ${label} ━━`, "sys");
    log.push(`창보기 ${showWindow ? "ON(크롬 창 뜸)" : "OFF(백그라운드)"} · 글당 체류 ${dwellSec}초 · 반복 ${repeat}회`, "progress");
    const es = new BotEventStream(`${BOT_BASE}/api/cafe/inflow`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
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
    es.onclose = () => { setRunning((r) => (r ? false : r)); };
  }

  function stopInflow() {
    streamRef.current?.close(); streamRef.current = null;
    botFetch(`${BOT_BASE}/api/cafe/inflow-cancel`, { method: "POST" }).catch(() => {});
    setRunning(false);
    log.push("🛑 유입 중단됨", "warn");
  }

  // ── 모드1: 집중 유입(글 링크 직접) ──
  function startFocus() {
    const urls = focusLinks.split("\n").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
    if (!urls.length) { log.push("집중 유입할 글 링크를 한 줄에 하나씩 넣으세요", "warn"); return; }
    const arts = urls.map((u, i) => ({ articleId: `focus${i}`, subject: u.slice(0, 40), url: u }));
    runInflow({ articles: arts, dwellSec, repeat, randomOrder: false, showWindow }, `집중 유입 ${urls.length}개 글`);
  }

  // ── 모드1: 랜덤 자동 방문(카페 주소 → 비로그인 크롤 → 랜덤 방문) ──
  async function startRandom() {
    if (running || busy) return;
    const addr = quickCafeAddr.trim();
    if (!addr) { log.push("카페 주소를 넣으세요 (예: cafe.naver.com/카페주소)", "warn"); return; }
    setBusy("resolve");
    localStorage.setItem("moca_inflow_quick_addr", addr);
    log.push(`카페 주소 확인 중… ${addr}`, "progress");
    try {
      const rr = await botFetch(`${BOT_BASE}/api/cafe/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeAddress: addr }) });
      const rd = await rr.json();
      if (!rd.cafeId) throw new Error(rd.error || "카페 ID를 못 찾음");
      log.push(`✅ 카페 확인: ${rd.cafeId}. 공개 글 목록 불러오는 중(비로그인)…`, "progress");
      const cr = await botFetch(`${BOT_BASE}/api/cafe/articles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId: rd.cafeId, cafeUrl: rd.cafeUrl, maxPages: 4 }) });
      const cd = await cr.json();
      (cd.logs || []).forEach((m: string) => log.push(m, m.includes("실패") || m.includes("⚠️") ? "warn" : "info"));
      const all: Article[] = cd.articles || [];
      if (!all.length) { log.push("⚠️ 공개 글을 못 찾았어요. 비공개 카페면 '카테고리 순환(로그인)' 모드를 쓰세요.", "warn"); setBusy(null); return; }
      const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, Math.max(1, randomCount));
      log.push(`🎲 글 ${all.length}개 중 ${shuffled.length}개 랜덤 선택 → 유입`, "success");
      setBusy(null);
      runInflow({ cafeId: rd.cafeId, cafeUrl: rd.cafeUrl, articles: shuffled, dwellSec, repeat, randomOrder: true, showWindow }, `랜덤 방문 ${shuffled.length}개 글`);
    } catch (e: any) { log.push(`실패: ${e?.message || e}`, "error"); setBusy(null); }
  }

  // ── 모드2: 카페/게시판 로드 + 크롤 ──
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
  async function crawlArticles() {
    if (busy) return;
    if (!accId || !cafeId || !menuId) { log.push("계정·카페·게시판을 먼저 선택하세요", "warn"); return; }
    const { fromMs, toMs } = periodRange();
    setBusy("crawl");
    log.push(`━━ 📰 글 크롤: [${cafeName}] ${boardName} · ${PERIODS.find(p => p.k === period)?.label} ━━`, "sys");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/articles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: accId, cafeId, cafeUrl, menuId, maxPages: 5 }),
      });
      const d = await res.json();
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("실패") || m.includes("오류") ? "error" : "info"));
      const list: Article[] = (d.articles || []).filter((a: Article) => (!fromMs || a.writeMs >= fromMs) && (!a.writeMs || a.writeMs <= toMs));
      setArticles(list); setPicked(new Set(list.map((a) => a.articleId)));
      log.push(`📰 글 ${list.length}개 수집(기간 필터) — 전체 선택됨`, list.length ? "success" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); }
    finally { setBusy(null); }
  }
  function togglePick(id: string) { setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function startCategoryInflow() {
    const targets = articles.filter((a) => picked.has(a.articleId));
    if (!targets.length) { log.push("유입할 글을 먼저 크롤·선택하세요", "warn"); return; }
    runInflow({ cafeId, cafeUrl, articles: targets, dwellSec, repeat, randomOrder: true, showWindow }, `카테고리 순환 ${targets.length}개 글`);
  }

  const modeBtn = (k: "quick" | "category", label: string): React.CSSProperties => ({
    flex: 1, padding: "12px", borderRadius: 8, fontSize: 13.5, fontWeight: 800, cursor: "pointer",
    background: mode === k ? "var(--m-gold)" : "var(--m-tabhover)", color: mode === k ? "var(--m-goldink)" : "var(--m-text)",
    border: "1px solid var(--m-line2)",
  });
  const settingsBlock = (
    <div style={card}>
      <label style={stepLabel}>⚙️ 유입 설정 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 🔓 비로그인 방문(계정 안전)</span></label>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div><label style={labelStyle}>글당 체류(초)</label><input type="number" min={10} max={180} className="moca-in" style={{ ...inputStyle, width: 110 }} value={dwellSec} onChange={(e) => setDwellSec(Math.max(10, Number(e.target.value) || 35))} /></div>
        <div><label style={labelStyle}>각 글 반복(회)</label><input type="number" min={1} max={20} className="moca-in" style={{ ...inputStyle, width: 110 }} value={repeat} onChange={(e) => setRepeat(Math.max(1, Number(e.target.value) || 1))} /></div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      <div style={{ ...card, background: "var(--m-input)" }}>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          📈 <b style={{ color: "var(--m-text)" }}>카페 유입·조회수</b> — 발행과 <b style={{ color: "var(--m-gold)" }}>따로 동시에</b> 돌아가요.
          유입 방문은 <b style={{ color: "var(--m-gold)" }}>🔓 비로그인(익명)</b>이라 계정 보호조치 위험이 없어요.
          <br /><span style={{ color: "var(--m-log-warn)" }}>⚠️ 밴 방지</span> — 체류를 넉넉히, 한 번에 너무 많이 돌리지 마세요.
        </p>
      </div>

      {/* 모드 선택 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="moca-w-btn" style={modeBtn("quick", "")} onClick={() => setMode("quick")}>⚡ 빠른 유입 <span style={{ fontWeight: 400, fontSize: 11 }}>(비로그인)</span></button>
        <button className="moca-w-btn" style={modeBtn("category", "")} onClick={() => setMode("category")}>🔁 카테고리 순환 <span style={{ fontWeight: 400, fontSize: 11 }}>(로그인)</span></button>
      </div>

      {/* ══ 모드1: 빠른 유입 ══ */}
      {mode === "quick" && (
        <>
          <div style={card}>
            <label style={stepLabel}>① 카페 주소 → 랜덤 자동 방문</label>
            <p style={{ color: "var(--m-dim)", fontSize: 11.5, margin: "0 0 8px", lineHeight: 1.5 }}>카페 주소만 넣으면 그 카페의 공개 글을 불러와 <b style={{ color: "var(--m-sub)" }}>랜덤으로 자동 방문</b>해요. 계정 로그인 필요 없어요.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={quickCafeAddr} onChange={(e) => setQuickCafeAddr(e.target.value)} placeholder="cafe.naver.com/카페주소 또는 전체 URL" />
              <div><input type="number" min={1} max={50} className="moca-in" style={{ ...inputStyle, width: 90 }} value={randomCount} onChange={(e) => setRandomCount(Math.max(1, Number(e.target.value) || 10))} title="랜덤 방문할 글 수" /></div>
            </div>
            <button className="moca-w-btn" onClick={startRandom} disabled={running || busy === "resolve"} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: running || busy ? 0.6 : 1 }}>
              {busy === "resolve" ? "카페 확인 중…" : `🎲 랜덤 ${randomCount}개 글 유입 시작`}
            </button>
          </div>

          <div style={card}>
            <label style={stepLabel}>② 글 링크 집중 유입</label>
            <p style={{ color: "var(--m-dim)", fontSize: 11.5, margin: "0 0 8px", lineHeight: 1.5 }}>특정 글 링크를 <b style={{ color: "var(--m-sub)" }}>한 줄에 하나씩</b> 넣으면 그 글들에 유입을 집중해요.</p>
            <textarea className="moca-in" style={{ ...inputStyle, minHeight: 80, resize: "vertical", marginBottom: 8 }} value={focusLinks} onChange={(e) => setFocusLinks(e.target.value)} placeholder={"https://cafe.naver.com/.../articles/12345\nhttps://cafe.naver.com/.../articles/12346"} />
            <button className="moca-w-btn" onClick={startFocus} disabled={running} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: running ? 0.6 : 1 }}>🎯 이 글들에 집중 유입</button>
          </div>
          {settingsBlock}
        </>
      )}

      {/* ══ 모드2: 카테고리 순환 ══ */}
      {mode === "category" && (
        <>
          <div style={card}>
            <label style={stepLabel}>① 계정 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 글 목록 크롤에만 로그인(방문은 비로그인)</span></label>
            <div style={{ color: accId ? "var(--m-log-success)" : "var(--m-log-warn)", fontSize: 13 }}>{accId ? `✅ 선택됨: ${accId}` : "⚠️ '카페 계정' 탭에서 계정을 선택하세요"}</div>
          </div>
          <div style={card}>
            <label style={stepLabel}>② 카페</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => { setCafeId(e.target.value); localStorage.setItem("moca_inflow_cafeId", e.target.value); }}>
                <option value="">카페 선택…</option>{cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
              </select>
              <button className="moca-w-btn" onClick={loadCafes} disabled={busy === "cafes"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "cafes" ? "…" : "🔄"}</button>
            </div>
          </div>
          <div style={card}>
            <label style={stepLabel}>③ 게시판(카테고리)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={menuId} onChange={(e) => { setMenuId(e.target.value); localStorage.setItem("moca_inflow_menuId", e.target.value); }}>
                <option value="">게시판 선택…</option>{boards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
              </select>
              <button className="moca-w-btn" onClick={loadBoards} disabled={busy === "boards"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "boards" ? "…" : "🔄"}</button>
            </div>
          </div>
          <div style={card}>
            <label style={stepLabel}>④ 기간 필터</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: period === "custom" ? 10 : 0 }}>
              {PERIODS.map((p) => (<button key={p.k} className="moca-w-btn" onClick={() => setPeriod(p.k)} style={{ background: period === p.k ? "var(--m-gold)" : "var(--m-tabhover)", color: period === p.k ? "var(--m-goldink)" : "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{p.label}</button>))}
            </div>
            {period === "custom" && (<div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="date" className="moca-in" style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><span style={{ color: "var(--m-sub)" }}>~</span><input type="date" className="moca-in" style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>)}
          </div>
          <div style={card}>
            <label style={stepLabel}>⑤ 글 크롤 (링크 수집)</label>
            <button className="moca-w-btn" onClick={crawlArticles} disabled={busy === "crawl"} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: busy === "crawl" ? 0.6 : 1 }}>{busy === "crawl" ? "크롤 중…" : "📰 이 게시판 글 크롤"}</button>
            {articles.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 700 }}>글 {articles.length}개 · 선택 {picked.size}개</span>
                  <button className="moca-w-btn" onClick={() => setPicked(new Set(articles.map((a) => a.articleId)))} style={{ marginLeft: "auto", background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>전체</button>
                  <button className="moca-w-btn" onClick={() => setPicked(new Set())} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>해제</button>
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
                <button className="moca-w-btn" onClick={startCategoryInflow} disabled={running} style={{ width: "100%", marginTop: 10, background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: running ? 0.6 : 1 }}>🔁 선택 글 순환 유입</button>
              </div>
            )}
          </div>
          {settingsBlock}
        </>
      )}

      {/* 진행/중단 (공통) */}
      {running && (
        <div style={card}>
          <div style={{ color: "var(--m-sub)", fontSize: 12.5, marginBottom: 8 }}>진행 {prog.done}/{prog.total || "?"}</div>
          <button className="moca-w-btn" onClick={stopInflow} style={{ width: "100%", background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>🛑 유입 중단</button>
        </div>
      )}
    </div>
  );
}
