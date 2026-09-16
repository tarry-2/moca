// 📢 홍보 — 하나의 글(키워드별 AI글)을 여러 카페에 순차로 뿌린다(카페 간 텀=밴 방지).
// 발행 로직은 글쓰기와 동일(publishCafe SSE 재활용). 인사말·링크·온파트너·공개설정·이미지 설정은
// 글쓰기 탭 설정(localStorage)을 그대로 공유한다.
// ⚠️ 홍보는 '발행'이라 계정 로그인이 필요 → 네이버 보호조치/카페 홍보금지 위험. 천천히·조금씩·규정 존중.
import { useState, useRef } from "react";
import { botFetch, BOT_BASE, BotEventStream } from "../lib/botApi";
import { getGeminiKeys, generateCafePost } from "../lib/gemini";
import { checkPublishGate } from "../lib/flowAccounts";
import { accountLabel, type CafeAccount } from "../lib/accounts";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeBoard { menuId: string; name: string; type: string; }
interface Target { cafeId: string; cafeName: string; cafeUrl: string; menuId: string; menuName: string; }

const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8, border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)" };
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };
const stepLabel: React.CSSProperties = { color: "var(--m-text)", fontSize: 14, fontWeight: 800, marginBottom: 10, display: "block" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--m-sub)", marginBottom: 4, display: "block" };

interface Props { selected: Set<string>; accounts: CafeAccount[]; log: UseLog; showWindow: boolean; }

export default function PromoTab({ selected, accounts, log, showWindow }: Props) {
  const accId = [...selected][0];
  const accName = accountLabel(accounts, accId); // 로그·화면에 찍을 계정명
  // 카페 목록은 글쓰기 탭이 불러온 것 공유
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [pickCafeId, setPickCafeId] = useState("");
  const [pickBoards, setPickBoards] = useState<CafeBoard[]>([]);
  const [pickMenuId, setPickMenuId] = useState("");
  const [targets, setTargets] = useState<Target[]>(() => { try { return JSON.parse(localStorage.getItem("moca_promo_targets") || "[]"); } catch { return []; } });
  const [keywords, setKeywords] = useState("");
  const [imgCount, setImgCount] = useState(2);
  const [lengthChars, setLengthChars] = useState(1000);
  const [termMin, setTermMin] = useState(30);       // 카페 사이 간격(분) — 밴 방지
  const [termRand, setTermRand] = useState(true);
  const [draftOnly, setDraftOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "paused">("idle");
  const [prog, setProg] = useState({ idx: 0, total: 0, ok: 0, fail: 0 });
  const [waitInfo, setWaitInfo] = useState("");
  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const resumeIdxRef = useRef(0);
  const streamRef = useRef<BotEventStream | null>(null);

  const pickCafeName = cafes.find((c) => c.cafeId === pickCafeId)?.name || "";

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
    if (!accId || !pickCafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("boards"); log.push(`게시판 불러오는 중… (${pickCafeName})`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/boards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: accId, cafeId: pickCafeId }) });
      const d = await res.json();
      if (d.boards?.length) { setPickBoards(d.boards); log.push(`게시판 ${d.boards.length}개`, "success"); }
      else log.push(`게시판 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) { log.push(`봇 연결 실패: ${e?.message || e}`, "error"); }
    finally { setBusy(null); }
  }
  function addTarget() {
    if (!pickCafeId || !pickMenuId) { log.push("카페와 게시판을 고른 뒤 추가하세요", "warn"); return; }
    const cafe = cafes.find((c) => c.cafeId === pickCafeId);
    const board = pickBoards.find((b) => b.menuId === pickMenuId);
    if (!cafe || !board) return;
    if (targets.some((t) => t.cafeId === pickCafeId && t.menuId === pickMenuId)) { log.push("이미 추가된 대상이에요", "warn"); return; }
    const next = [...targets, { cafeId: cafe.cafeId, cafeName: cafe.name, cafeUrl: cafe.url, menuId: board.menuId, menuName: board.name }];
    setTargets(next); localStorage.setItem("moca_promo_targets", JSON.stringify(next));
    log.push(`대상 추가: ${cafe.name} > ${board.name} (총 ${next.length})`, "success");
  }
  function removeTarget(i: number) { const next = targets.filter((_, idx) => idx !== i); setTargets(next); localStorage.setItem("moca_promo_targets", JSON.stringify(next)); }

  // 공유 설정(글쓰기 탭) 읽기
  function readShared() {
    const useGreeting = true;
    const greeting = localStorage.getItem("moca_greeting") || "";
    const linkName = localStorage.getItem("moca_link_name") || "";
    const linkUrl = localStorage.getItem("moca_link_url") || "";
    const links = linkUrl.trim() ? [{ name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim() }] : [];
    let onPartnerProducts: any[] = [];
    try { const items = JSON.parse(localStorage.getItem("moca_onpartner_items") || "[]"); onPartnerProducts = items.filter((it: any) => it.product?.available && it.product?.partnerUrl).map((it: any) => ({ name: it.product.name, partnerUrl: it.product.partnerUrl, banner: it.banner })); } catch {}
    let publishOptions: any = undefined;
    try { publishOptions = JSON.parse(localStorage.getItem("moca_pub_opts") || "null") || undefined; } catch {}
    return { greeting: useGreeting ? greeting : "", links, onPartnerProducts, publishOptions };
  }

  function buildImgPrompts(n: number, kw: string): string[] {
    const k = kw.replace(/[^\w가-힣 ]/g, "").trim();
    const fb = [
      `${k}, bright natural lighting, clean editorial photography, no text, no letters, no people`,
      `${k}, cozy warm mood, close-up detail shot, no text, no letters, no people`,
      `${k}, fresh vivid colors, top-down flat lay, no text, no letters, no people`,
      `${k}, soft daylight, lifestyle scene, no text, no letters, no people`,
      `${k}, minimal background, product photography, no text, no letters, no people`,
    ];
    return Array.from({ length: n }, (_, i) => fb[i % fb.length]);
  }

  // 발행 1건(SSE). 성공 여부 반환.
  function publishOne(t: Target, post: { title: string; body: string; faq: string; hashtags: string }, imgPrompts: string[], flowSlots: number[]): Promise<boolean> {
    const shared = readShared();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => { if (settled) return; settled = true; streamRef.current = null; resolve(ok); };
      const es = new BotEventStream(`${BOT_BASE}/api/cafe/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: accId, cafeId: t.cafeId, cafeUrl: t.cafeUrl, menuId: t.menuId, title: post.title, body: post.body, faq: post.faq, hashtags: post.hashtags, imgCount, imgPrompts, flowSlots, draftOnly, showWindow, ...shared }),
      });
      streamRef.current = es;
      es.onmessage = (ev) => {
        let d: any; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.type === "log") { const m = String(d.msg || ""); log.push(m, m.includes("⚠️") ? "warn" : (m.includes("실패") || m.includes("❌") || m.includes("오류")) ? "error" : (m.includes("🎉") || m.includes("✅")) ? "success" : "info", t.cafeName); }
        else if (d.type === "shot") log.shot(d.caption, d.dataUrl, t.cafeName);
        else if (d.type === "done") { log.push(d.success ? `✅ [${t.cafeName}] 발행 완료: ${d.url}` : `❌ [${t.cafeName}] 발행 실패: ${d.error || "?"}`, d.success ? "success" : "error", t.cafeName); es.close(); finish(!!d.success); }
      };
      es.onerror = () => { log.push(`봇 연결 오류 (${t.cafeName})`, "error", t.cafeName); finish(false); };
      es.onclose = () => finish(false);
    });
  }

  async function waitControllable(ms: number, label: string): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (stopRef.current || pauseRef.current) return false;
      const left = Math.ceil((end - Date.now()) / 1000);
      setWaitInfo(`${label} ${left > 60 ? Math.ceil(left / 60) + "분" : left + "초"} 남음`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setWaitInfo(""); return true;
  }

  async function run(fromIdx: number) {
    if (!accId) { log.push("계정을 먼저 선택하세요", "warn"); return; }
    if (!targets.length) { log.push("홍보 대상(카페+게시판)을 먼저 추가하세요", "warn"); return; }
    const kws = keywords.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!kws.length) { log.push("홍보할 키워드를 한 줄에 하나씩 넣으세요", "warn"); return; }
    stopRef.current = false; pauseRef.current = false;
    setRunState("running");
    setProg((p) => ({ ...p, total: targets.length, idx: fromIdx, ...(fromIdx === 0 ? { ok: 0, fail: 0 } : {}) }));
    // 🔴 홍보 전 연결 점검: 네이버 세션 미연결, 또는 이미지 쓰는데 플로우 미연결이면 빨간 경고 후 중단.
    const gate = await checkPublishGate(accounts.find(a => a.id === accId), accName, imgCount > 0);
    if (!gate.ok) { log.push(gate.msg, "error", accName); setRunState("idle"); return; }
    log.push(fromIdx === 0 ? `━━ 📢 홍보 시작: ${targets.length}개 카페 (카페 간 ${termMin}분${termRand ? "±랜덤" : ""}) ━━` : `▶ 이어가기: ${fromIdx + 1}번째 카페부터`, "sys");
    if (fromIdx === 0) {
      log.push(`👤 홍보 계정: ${accName}`, "info", accName);
      if (imgCount > 0) log.push(`🎨 이미지 계정: ${gate.flowNames} (${gate.flowSlots.length}개 · 소진 시 다음 계정)`, "info", accName);
    }
    // 이미지용 플로우 계정(위 게이트에서 확인됨)
    const flowSlots: number[] = gate.flowSlots;

    let ok = prog.ok, fail = prog.fail;
    for (let i = fromIdx; i < targets.length; i++) {
      if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn"); setRunState("idle"); setWaitInfo(""); return; }
      if (pauseRef.current) { resumeIdxRef.current = i; log.push(`⏸ 정지 — ${i + 1}번째 카페에서 멈춤`, "warn"); setRunState("paused"); setWaitInfo(""); return; }
      const t = targets[i];
      const kw = kws[i % kws.length]; // 카페마다 키워드 순환(다른 글=도배 아니게)
      setProg({ idx: i, total: targets.length, ok, fail });
      log.push(`[${i + 1}/${targets.length}] ${t.cafeName} > ${t.menuName} · "${kw}" AI 생성 중…`, "progress", t.cafeName);
      try {
        const post = await generateCafePost(kw, t.cafeName, t.menuName, lengthChars, (m) => log.push(m, "progress", t.cafeName));
        const imgPrompts = imgCount > 0 ? (post.imagePrompts?.length ? post.imagePrompts : buildImgPrompts(imgCount, kw)) : [];
        log.push(`[${i + 1}/${targets.length}] 제목: ${post.title}`, "info", t.cafeName);
        const success = await publishOne(t, post, imgPrompts, flowSlots);
        if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn"); setRunState("idle"); setWaitInfo(""); return; }
        if (pauseRef.current) { resumeIdxRef.current = i; log.push(`⏸ 정지 — ${i + 1}번째 카페 중단(이어가기로 다시)`, "warn"); setRunState("paused"); setWaitInfo(""); return; }
        if (success) ok++; else fail++;
      } catch (e: any) {
        if (pauseRef.current) { resumeIdxRef.current = i; setRunState("paused"); setWaitInfo(""); return; }
        fail++; log.push(`[${i + 1}] 생성/발행 실패: ${e?.message || e}`, "error", t.cafeName);
      }
      setProg({ idx: i + 1, total: targets.length, ok, fail });
      if (i < targets.length - 1) {
        let ms = termMin * 60 * 1000;
        if (termRand) ms = Math.round(ms * (0.7 + Math.random() * 0.6));
        log.push(`⏳ 다음 카페까지 ${Math.round(ms / 60000)}분 대기(밴 방지)`, "progress");
        const cont = await waitControllable(ms, "⏳ 다음 카페까지");
        if (!cont) { if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn"); setRunState("idle"); return; } resumeIdxRef.current = i + 1; log.push(`⏸ 정지 — 다음은 ${i + 2}번째`, "warn"); setRunState("paused"); return; }
      }
    }
    log.push(`━━ 🎉 홍보 완료: 성공 ${ok} · 실패 ${fail} ━━`, "success");
    setRunState("idle"); setWaitInfo("");
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      <div style={{ ...card, background: "var(--m-input)" }}>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          📢 <b style={{ color: "var(--m-text)" }}>홍보</b> — 대상 카페를 여러 개 담고, 키워드로 <b style={{ color: "var(--m-gold)" }}>카페마다 다른 AI 글</b>을 순차 발행해요(도배 아니게 키워드 순환).
          인사말·내 링크·온파트너·공개설정·이미지는 <b style={{ color: "var(--m-sub)" }}>글쓰기 탭 설정을 그대로</b> 써요.
          <br /><span style={{ color: "var(--m-log-warn)" }}>⚠️ 홍보는 '발행'이라 로그인이 필요</span> — 네이버 보호조치·카페 홍보금지 위험이 있어요. <b>카페 간 텀을 넉넉히</b>, 조금씩, 규정을 지키세요.
        </p>
      </div>

      {/* 계정 */}
      <div style={card}>
        <label style={stepLabel}>① 계정</label>
        <div style={{ color: accId ? "var(--m-log-success)" : "var(--m-log-warn)", fontSize: 13 }}>{accId ? `✅ 선택됨: ${accName}` : "⚠️ '카페 계정' 탭에서 계정을 선택하세요"}</div>
      </div>

      {/* 대상 추가 */}
      <div style={card}>
        <label style={stepLabel}>② 홍보 대상 추가 (카페 + 게시판)</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={pickCafeId} onChange={(e) => { setPickCafeId(e.target.value); setPickBoards([]); setPickMenuId(""); }}>
            <option value="">카페 선택…</option>{cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadCafes} disabled={busy === "cafes"} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "cafes" ? "…" : "🔄 카페"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={pickMenuId} onChange={(e) => setPickMenuId(e.target.value)}>
            <option value="">게시판 선택…</option>{pickBoards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
          </select>
          <button className="moca-w-btn" onClick={loadBoards} disabled={busy === "boards" || !pickCafeId} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "boards" ? "…" : "🔄 게시판"}</button>
        </div>
        <button className="moca-w-btn" onClick={addTarget} style={{ width: "100%", background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>➕ 대상에 추가</button>

        {targets.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>홍보 대상 {targets.length}개</div>
            {targets.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, background: "var(--m-panel)", borderRadius: 8, border: "1px solid var(--m-line)" }}>
                <span style={{ flex: 1, minWidth: 0, color: "var(--m-text)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.cafeName} <span style={{ color: "var(--m-dim)" }}>&gt; {t.menuName}</span></span>
                <button className="moca-w-btn" onClick={() => removeTarget(i)} style={{ background: "transparent", color: "var(--m-log-error)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 키워드 + 옵션 */}
      <div style={card}>
        <label style={stepLabel}>③ 홍보 키워드 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 한 줄에 하나 (카페마다 순환하며 다른 글 생성)</span></label>
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 70, resize: "vertical", marginBottom: 10 }} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"생선 보관법\n제철 해산물 고르는 법"} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div><label style={labelStyle}>본문 글자수</label><input type="number" min={300} max={3000} step={100} className="moca-in" style={{ ...inputStyle, width: 110 }} value={lengthChars} onChange={(e) => setLengthChars(Math.max(300, Number(e.target.value) || 1000))} /></div>
          <div><label style={labelStyle}>이미지 장수</label><input type="number" min={0} max={5} className="moca-in" style={{ ...inputStyle, width: 90 }} value={imgCount} onChange={(e) => setImgCount(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} /></div>
          <div><label style={labelStyle}>카페 간 텀(분)</label><input type="number" min={5} max={240} className="moca-in" style={{ ...inputStyle, width: 100 }} value={termMin} onChange={(e) => setTermMin(Math.max(5, Number(e.target.value) || 30))} /></div>
          <label style={{ display: "flex", alignItems: "flex-end", gap: 6, fontSize: 12.5, color: "var(--m-sub)", cursor: "pointer", paddingBottom: 10 }}><input type="checkbox" checked={termRand} onChange={(e) => setTermRand(e.target.checked)} style={{ width: "auto" }} />텀 ±랜덤</label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--m-text)", cursor: "pointer", fontWeight: 700, marginTop: 12 }}>
          <input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} style={{ width: "auto" }} />🧪 임시등록으로 테스트 (실제 공개 안 함)
        </label>
      </div>

      {/* 제어 */}
      <div style={card}>
        {runState !== "idle" && <div style={{ color: "var(--m-sub)", fontSize: 12.5, marginBottom: 8 }}>{runState === "running" ? "▶ 진행 중" : "⏸ 정지됨"} · {prog.idx}/{prog.total} · ✅{prog.ok} ❌{prog.fail}{waitInfo ? ` · ${waitInfo}` : ""}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="moca-w-btn" disabled={runState !== "idle"} onClick={() => run(0)} style={{ flex: 1, background: runState === "idle" ? "var(--m-gold)" : "var(--m-tabhover)", color: runState === "idle" ? "var(--m-goldink)" : "var(--m-dim)", border: "none", borderRadius: 8, padding: "13px", fontSize: 14, fontWeight: 800, cursor: runState === "idle" ? "pointer" : "default" }}>📢 홍보 시작</button>
          <button className="moca-w-btn" disabled={runState !== "running"} onClick={() => { pauseRef.current = true; streamRef.current?.close(); botFetch(`${BOT_BASE}/api/cafe/cancel`, { method: "POST" }).catch(() => {}); log.push("⏸ 정지 요청", "warn"); }} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⏸ 정지</button>
          <button className="moca-w-btn" disabled={runState !== "paused"} onClick={() => run(resumeIdxRef.current)} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⏭ 이어가기</button>
          <button className="moca-w-btn" disabled={runState === "idle"} onClick={() => { stopRef.current = true; pauseRef.current = false; streamRef.current?.close(); botFetch(`${BOT_BASE}/api/cafe/cancel`, { method: "POST" }).catch(() => {}); setRunState("idle"); setWaitInfo(""); log.push("🛑 즉시 취소", "error"); }} style={{ background: "var(--m-log-error)", color: "#fff", border: "none", borderRadius: 8, padding: "13px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>🛑 취소</button>
        </div>
      </div>
    </div>
  );
}
