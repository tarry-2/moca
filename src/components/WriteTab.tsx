// 📝 카페 글쓰기·발행 — 계정선택 → 카페선택 → 게시판선택 → 키워드 → AI글 → 발행
// 카페 목록/게시판은 봇 필요(데스크톱 앱). AI 글 생성은 웹에서도 됨(Gemini 직접).
import { useState, useRef } from "react";
import { botFetch, BOT_BASE } from "../lib/botApi";
import { getGeminiKey, setGeminiKey, generateCafePost } from "../lib/gemini";
import { listFlowAccounts } from "../lib/flowAccounts";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeBoard { menuId: string; name: string; type: string; }

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)",
};
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };
const stepLabel: React.CSSProperties = { color: "var(--m-text)", fontSize: 14, fontWeight: 800, marginBottom: 10, display: "block" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--m-sub)", marginBottom: 4, display: "block" };

interface Props {
  selected: Set<string>;
  log: UseLog;
  showWindow: boolean;
}

export default function WriteTab({ selected, log, showWindow: showWindowState }: Props) {
  const [keyInput, setKeyInput] = useState(getGeminiKey());
  const [keySaved, setKeySaved] = useState(!!getGeminiKey());
  const [keyOpen, setKeyOpen] = useState(!getGeminiKey()); // 키 없으면 펼침, 있으면 접힘
  // 불러온 카페/게시판·선택값은 localStorage 영속(탭 이동·앱 재시작에도 유지, 다시 안 불러와도 됨)
  const [cafes, setCafes] = useState<MyCafe[]>(() => { try { return JSON.parse(localStorage.getItem("moca_cafes") || "[]"); } catch { return []; } });
  const [cafeId, setCafeId] = useState(() => localStorage.getItem("moca_cafeId") || "");
  const [boards, setBoards] = useState<CafeBoard[]>(() => { try { return JSON.parse(localStorage.getItem("moca_boards") || "[]"); } catch { return []; } });
  const [menuId, setMenuId] = useState(() => localStorage.getItem("moca_menuId") || "");
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");   // 본문(이미지는 이 안에서 끝남)
  const [faq, setFaq] = useState("");     // 자주 묻는 질문(맨 마지막, 이미지 뒤로 안 내려감)
  const [hashtags, setHashtags] = useState(""); // 해시태그(맨 끝, 검색 노출용)
  const [aiImgPrompts, setAiImgPrompts] = useState<string[]>([]); // AI가 만든 영어 이미지 프롬프트
  const [imgCount, setImgCount] = useState(2); // 플로우로 만들 이미지 장수(0=없음)
  const [lengthChars, setLengthChars] = useState(1000); // AI 본문 목표 글자수
  const [busy, setBusy] = useState<string | null>(null);
  // 인사말·링크(저장되는 설정) — 관리자 전용, localStorage 영속
  const [greeting, setGreeting] = useState(() => localStorage.getItem("moca_greeting") || "");
  const [savedGreeting, setSavedGreeting] = useState(() => localStorage.getItem("moca_greeting") || "");
  const [linkName, setLinkName] = useState(() => localStorage.getItem("moca_link_name") || "");
  const [linkUrl, setLinkUrl] = useState(() => localStorage.getItem("moca_link_url") || "");
  const [useGreeting, setUseGreeting] = useState(true);
  const [useLink, setUseLink] = useState(true);
  const [draftOnly, setDraftOnly] = useState(true); // 처음엔 안전하게 임시등록 기본 ON
  const ONPARTNER = { name: "온파트너", url: "https://partner.yuanfnb.com" };

  // ── 🔁 순차 발행(여러 키워드 자동) + 제어 4개(발행시작/정지/이어가기/취소) ──
  const [seqKeywords, setSeqKeywords] = useState("");
  const [runState, setRunState] = useState<"idle" | "running" | "paused">("idle");
  const [seqProg, setSeqProg] = useState({ idx: 0, total: 0, ok: 0, fail: 0 });
  const stopRef = useRef(false);   // 취소
  const pauseRef = useRef(false);  // 정지
  const resumeIdxRef = useRef(0);  // 이어가기 시작 인덱스
  const abortRef = useRef<AbortController | null>(null); // 진행 중 봇 요청 즉시 중단용
  // ⏰ 예약·텀(간격) — 앱 켜둔 상태 예약. 텀=밴 방지(연속 도배 금지)
  const [useSchedule, setUseSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(""); // datetime-local
  const [termMin, setTermMin] = useState(30);       // 글 사이 간격(분)
  const [termRand, setTermRand] = useState(true);   // 간격 ±랜덤(사람처럼)
  const [waitInfo, setWaitInfo] = useState("");     // 대기 상태 표시

  // 이미지 프롬프트 N개 만들기: AI가 만든 영어 프롬프트 우선, 모자라면 영어 기본값(한글 금지 — Flow가 깨짐)
  function buildImgPrompts(n: number, kwArg?: string): string[] {
    const out = [...aiImgPrompts].filter((s) => s && !/[가-힣]/.test(s));
    const kw = (kwArg || keyword || title || "food").replace(/[^\w가-힣 ]/g, "").trim();
    const fallback = [
      `${kw}, bright natural lighting, clean editorial photography, no text, no letters, no people`,
      `${kw}, cozy warm mood, close-up detail shot, no text, no letters, no people`,
      `${kw}, fresh and vivid colors, top-down flat lay, no text, no letters, no people`,
      `${kw}, soft daylight, lifestyle scene, no text, no letters, no people`,
      `${kw}, minimal background, product photography, no text, no letters, no people`,
    ];
    let i = 0;
    while (out.length < n) out.push(fallback[i++ % fallback.length]);
    return out.slice(0, n);
  }

  const accId = [...selected][0];
  const cafeName = cafes.find((c) => c.cafeId === cafeId)?.name || "";
  const boardName = boards.find((b) => b.menuId === menuId)?.name || "";

  function saveKey() {
    setGeminiKey(keyInput);
    setKeySaved(!!keyInput.trim());
    if (keyInput.trim()) setKeyOpen(false); // 저장되면 접기
    log.push("Gemini API 키 저장됨", "info");
  }
  function saveGreeting() {
    const g = greeting.trim();
    localStorage.setItem("moca_greeting", g);
    setSavedGreeting(g);
    log.push(g ? "글쓴이 인사말 저장됨(앞으로 모든 글에 자동 삽입)" : "인사말 비움", "success");
  }
  function saveLink() {
    localStorage.setItem("moca_link_name", linkName.trim());
    localStorage.setItem("moca_link_url", linkUrl.trim());
    log.push(linkUrl.trim() ? `내 링크 저장됨: ${linkName.trim() || linkUrl.trim()}` : "내 링크 비움", "success");
  }

  async function loadCafes() {
    if (busy) return;
    if (!accId) { log.push("먼저 '카페 계정' 탭에서 계정을 선택하세요", "warn"); return; }
    setBusy("cafes");
    log.push("내 카페 목록 불러오는 중… (봇)", "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/my/${accId}`);
      const d = await res.json();
      if (d.cafes?.length) { setCafes(d.cafes); localStorage.setItem("moca_cafes", JSON.stringify(d.cafes)); log.push(`카페 ${d.cafes.length}개 불러옴`, "success"); }
      else log.push(`카페 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} (데스크톱 앱에서 실행 필요)`, "error");
    } finally { setBusy(null); }
  }

  async function loadBoards() {
    if (busy) return;
    if (!accId || !cafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("boards");
    log.push(`게시판 목록 불러오는 중… (${cafeName})`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/boards`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: accId, cafeId }),
      });
      const d = await res.json();
      if (d.boards?.length) { setBoards(d.boards); localStorage.setItem("moca_boards", JSON.stringify(d.boards)); log.push(`게시판 ${d.boards.length}개 불러옴`, "success"); }
      else log.push(`게시판 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} (데스크톱 앱에서 실행 필요)`, "error");
    } finally { setBusy(null); }
  }

  async function genAI() {
    if (busy) return; // 중복 클릭 방지
    if (!keyword.trim()) { log.push("키워드를 입력하세요", "warn"); return; }
    setBusy("ai");
    log.push(`━━ AI 글 생성: "${keyword}" ━━`, "sys");
    try {
      const r = await generateCafePost(keyword, cafeName || "카페", boardName || "게시판", lengthChars, (m) => log.push(m, "progress"));
      setTitle(r.title);
      setBody(r.body);
      setFaq(r.faq);
      setHashtags(r.hashtags);
      setAiImgPrompts(r.imagePrompts || []);
      log.push(`제목: ${r.title}`, "success");
      log.push(`본문 ${r.body.length}자 + FAQ ${r.faq ? "포함" : "없음"} + 해시태그 ${r.hashtags ? "포함" : "없음"}`, "info");
    } catch (e: any) {
      log.push(`AI 생성 실패: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  }

  async function publish() {
    if (busy) return;
    if (!accId || !cafeId || !menuId || !title.trim() || !body.trim()) {
      log.push("계정·카페·게시판·제목·본문을 모두 채워주세요", "warn");
      return;
    }
    setBusy("publish");
    log.push(`━━ 🚀 발행 시작: [${cafeName}] ${boardName} ━━`, "sys", cafeName);
    log.push(`제목: ${title}`, "info", cafeName);
    const links = [
      ...(useLink && linkUrl.trim() ? [{ name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim() }] : []),
      { name: ONPARTNER.name, url: ONPARTNER.url }, // 온파트너 항상 포함(원하면 아래 토글로 뺄 수 있게 추후)
    ];
    // 🌈 이미지: 연결된 플로우 계정 slot 목록(순서대로, 크레딧 소진 시 다음) + 프롬프트 생성
    let flowSlots: number[] = [];
    let imgPrompts: string[] = [];
    if (imgCount > 0) {
      const flowAccts = await listFlowAccounts().catch(() => []);
      flowSlots = flowAccts.filter(a => a.connected).map(a => a.slot ?? 0);
      if (!flowSlots.length) log.push("⚠️ 연결된 플로우 계정이 없어 이미지 없이 글만 발행돼요(플로우 탭에서 연결하세요)", "warn", cafeName);
      // ★이미지 프롬프트 = AI가 만든 영어 프롬프트 사용(Flow는 한글 못 받아 깨짐). 모자라면 영어 기본값.
      imgPrompts = buildImgPrompts(imgCount);
    }
    log.push(`배치: 제목 → 썸네일 → ${useGreeting && savedGreeting ? "인사말 → " : ""}본문(글·이미지 ${imgCount}장 번갈아) → 본문 끝나면 바로 ${faq ? "❓FAQ" : "(FAQ 없음)"}`, "info", cafeName);
    if (links.length) log.push(`링크 삽입: ${links.map(l => l.name).join(", ")}`, "info", cafeName);
    if (imgCount > 0) log.push(`이미지: 플로우 계정 ${flowSlots.length}개로 ${imgCount}장 생성(소진 시 다음 계정)`, "info", cafeName);
    log.push(`창보기 ${showWindowState ? "ON(크롬 창 뜸)" : "OFF(백그라운드+캡처)"}`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // greeting=인사말(맨 위), body=본문(글·이미지 번갈아), links=온파트너/내링크, faq=질문형식(맨 아래).
        body: JSON.stringify({ userId: accId, cafeId, cafeUrl: cafes.find(c => c.cafeId === cafeId)?.url, menuId, title, greeting: useGreeting ? savedGreeting : "", body, links, faq, hashtags, imgCount, imgPrompts, flowSlots, draftOnly, showWindow: showWindowState }),
      });
      const d = await res.json();
      // 봇 진단 로그를 화면 로그로
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("⚠️") ? "warn" : m.includes("실패") || m.includes("오류") ? "error" : "info", cafeName));
      // 단계별 캡처
      (d.shots || []).forEach((s: any) => log.shot(s.caption, s.dataUrl, cafeName));
      if (d.success) log.push(`발행 결과: ${d.url}`, "success", cafeName);
      else log.push(`발행 실패: ${d.error || "알 수 없음"}`, "error", cafeName);
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} (데스크톱 앱에서 실행 필요)`, "error", cafeName);
    } finally { setBusy(null); }
  }

  // 발행 1건 요청(순차 발행에서 재사용). 성공 여부 반환.
  async function sendOnePublish(kw: string, post: { title: string; body: string; faq: string; hashtags: string }): Promise<boolean> {
    const links = [
      ...(useLink && linkUrl.trim() ? [{ name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim() }] : []),
      { name: ONPARTNER.name, url: ONPARTNER.url },
    ];
    let flowSlots: number[] = [];
    let imgPrompts: string[] = [];
    if (imgCount > 0) {
      const fa = await listFlowAccounts().catch(() => []);
      flowSlots = fa.filter(a => a.connected).map(a => a.slot ?? 0);
      imgPrompts = buildImgPrompts(imgCount);
    }
    try {
      abortRef.current = new AbortController();
      const res = await botFetch(`${BOT_BASE}/api/cafe/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({ userId: accId, cafeId, cafeUrl: cafes.find(c => c.cafeId === cafeId)?.url, menuId, title: post.title, greeting: useGreeting ? savedGreeting : "", body: post.body, links, faq: post.faq, hashtags: post.hashtags, imgCount, imgPrompts, flowSlots, draftOnly, showWindow: showWindowState }),
      });
      const d = await res.json();
      (d.logs || []).forEach((m: string) => log.push(m, m.includes("⚠️") ? "warn" : (m.includes("실패") || m.includes("오류")) ? "error" : "info", cafeName));
      (d.shots || []).forEach((s: any) => log.shot(s.caption, s.dataUrl, cafeName));
      if (d.success) { log.push(`✅ 발행 완료: ${d.url}`, "success", cafeName); return true; }
      log.push(`발행 실패: ${d.error || "?"}`, "error", cafeName); return false;
    } catch (e: any) {
      if (e?.name === "AbortError") { log.push("🛑 발행 즉시 중단됨", "warn", cafeName); return false; }
      log.push(`봇 연결 실패: ${e?.message || e}`, "error", cafeName); return false;
    } finally { abortRef.current = null; }
  }

  // 중단 가능한 대기(1초마다 취소/정지 체크). 취소=false 반환(중단), 완료=true.
  async function waitControllable(ms: number, label: string): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (stopRef.current || pauseRef.current) return false;
      const left = Math.ceil((end - Date.now()) / 1000);
      setWaitInfo(`${label} ${left > 60 ? Math.ceil(left / 60) + "분" : left + "초"} 남음`);
      await new Promise(r => setTimeout(r, 1000));
    }
    setWaitInfo("");
    return true;
  }

  // 🔁 순차 발행 루프(골든시드 방식): 예약 대기 → 키워드마다 AI생성+발행, 글 사이 텀. 정지/취소 체크.
  async function runSeq(fromIdx: number) {
    const kws = seqKeywords.split("\n").map(s => s.trim()).filter(Boolean);
    if (!kws.length) { log.push("발행할 키워드를 한 줄에 하나씩 입력하세요", "warn"); return; }
    if (!accId || !cafeId || !menuId) { log.push("계정·카페·게시판을 먼저 선택하세요", "warn"); return; }
    stopRef.current = false; pauseRef.current = false;
    setRunState("running");
    setSeqProg((p) => ({ ...p, total: kws.length, idx: fromIdx, ...(fromIdx === 0 ? { ok: 0, fail: 0 } : {}) }));

    // ⏰ 예약 시각까지 대기(첫 시작 때만)
    if (fromIdx === 0 && useSchedule && scheduleAt) {
      const target = new Date(scheduleAt).getTime();
      const wait = target - Date.now();
      if (wait > 0) {
        log.push(`⏰ 예약: ${new Date(target).toLocaleString("ko-KR")}까지 대기 (앱을 켜두세요)`, "sys", cafeName);
        const ok = await waitControllable(wait, "⏰ 예약 발행까지");
        if (!ok) { log.push(stopRef.current ? "🛑 예약 취소됨" : "⏸ 예약 대기 중 정지", "warn", cafeName); setRunState(stopRef.current ? "idle" : "paused"); if (pauseRef.current) resumeIdxRef.current = 0; return; }
      }
    }

    log.push(fromIdx === 0 ? `━━ 🔁 순차 발행 시작: ${kws.length}개 키워드 (간격 ${termMin}분${termRand ? "±랜덤" : ""}) ━━` : `▶ 이어가기: ${fromIdx + 1}번째부터`, "sys", cafeName);
    let ok = seqProg.ok, fail = seqProg.fail;
    for (let i = fromIdx; i < kws.length; i++) {
      if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn", cafeName); setRunState("idle"); setWaitInfo(""); return; }
      if (pauseRef.current) { resumeIdxRef.current = i; log.push(`⏸ 정지됨 — ${i + 1}번째에서 멈춤 (완료 ${ok}·실패 ${fail})`, "warn", cafeName); setRunState("paused"); setWaitInfo(""); return; }
      setSeqProg({ idx: i, total: kws.length, ok, fail });
      log.push(`[${i + 1}/${kws.length}] "${kws[i]}" AI 생성 중…`, "progress", cafeName);
      try {
        const post = await generateCafePost(kws[i], cafeName || "카페", boardName || "게시판", lengthChars, (m) => log.push(m, "progress"));
        log.push(`[${i + 1}/${kws.length}] 제목: ${post.title}`, "info", cafeName);
        const success = await sendOnePublish(kws[i], post);
        if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn", cafeName); setRunState("idle"); setWaitInfo(""); return; }
        if (success) ok++; else fail++;
      } catch (e: any) { fail++; log.push(`[${i + 1}] 생성 실패: ${e?.message || e}`, "error", cafeName); }
      setSeqProg({ idx: i + 1, total: kws.length, ok, fail });

      // 글 사이 텀(마지막 글 뒤엔 안 기다림) — 밴 방지
      if (i < kws.length - 1) {
        let ms = termMin * 60 * 1000;
        if (termRand) ms = Math.round(ms * (0.7 + Math.random() * 0.6)); // ±30% 랜덤
        log.push(`⏳ 다음 글까지 ${Math.round(ms / 60000)}분 대기(밴 방지)`, "progress", cafeName);
        const cont = await waitControllable(ms, "⏳ 다음 글까지");
        if (!cont) {
          if (stopRef.current) { log.push(`🛑 취소됨 (완료 ${ok}·실패 ${fail})`, "warn", cafeName); setRunState("idle"); return; }
          resumeIdxRef.current = i + 1; log.push(`⏸ 정지됨 — 다음은 ${i + 2}번째 (완료 ${ok}·실패 ${fail})`, "warn", cafeName); setRunState("paused"); return;
        }
      }
    }
    log.push(`━━ 🎉 순차 발행 완료: 성공 ${ok} · 실패 ${fail} ━━`, "success", cafeName);
    setRunState("idle"); setWaitInfo("");
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`.moca-w-btn:hover{filter:brightness(1.12)} .moca-w-btn:active{transform:scale(.97)} .moca-in:focus{outline:none;border-color:var(--m-gold)}`}</style>

      {/* AI 키 (접기/펴기) */}
      <div style={{ ...card, paddingBottom: keyOpen ? 16 : 12 }}>
        <div onClick={() => setKeyOpen((v) => !v)} style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
          <span style={{ color: "var(--m-text)", fontSize: 14, fontWeight: 800 }}>
            🤖 Gemini API 키 {keySaved
              ? <span style={{ color: "var(--m-log-success)", fontSize: 12, fontWeight: 600 }}>· ✅ 설정됨</span>
              : <span style={{ color: "var(--m-log-warn)", fontSize: 12, fontWeight: 600 }}>· ⚠️ 미설정</span>}
          </span>
          <span style={{ marginLeft: "auto", color: "var(--m-sub)", fontSize: 13 }}>{keyOpen ? "▲ 접기" : "▼ 펴기"}</span>
        </div>
        {keyOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--m-sub)", fontSize: 12, margin: "0 0 8px", lineHeight: 1.5 }}>AI 글 생성에 필요해요. 브라우저에만 저장되고 서버로 안 보내요.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="moca-in" style={inputStyle} type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="AIza..." />
              <button className="moca-w-btn" onClick={saveKey} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>저장</button>
            </div>
          </div>
        )}
      </div>

      {/* 선택 계정 */}
      <div style={card}>
        <label style={stepLabel}>👤 발행 계정</label>
        {accId ? (
          <div style={{ color: "var(--m-sub)", fontSize: 13 }}>선택된 계정 <b style={{ color: "var(--m-gold)" }}>{selected.size}개</b> · 카페/게시판은 첫 계정 기준으로 불러와요.</div>
        ) : (
          <div style={{ color: "var(--m-log-warn)", fontSize: 13 }}>⚠️ '카페 계정' 탭에서 계정을 먼저 선택하세요.</div>
        )}
      </div>

      {/* ① 카페 */}
      <div style={card}>
        <label style={stepLabel}>① 카페 선택</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => { setCafeId(e.target.value); localStorage.setItem("moca_cafeId", e.target.value); setBoards([]); setMenuId(""); localStorage.removeItem("moca_boards"); localStorage.removeItem("moca_menuId"); }}>
            <option value="">{cafes.length ? "카페를 선택하세요" : "먼저 불러오기 →"}</option>
            {cafes.map((c) => <option key={c.cafeId} value={c.cafeId}>{c.name}</option>)}
          </select>
          <button className="moca-w-btn" disabled={busy === "cafes"} onClick={loadCafes} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "cafes" ? "불러오는 중…" : "내 카페 불러오기"}</button>
        </div>
      </div>

      {/* ② 게시판 */}
      <div style={card}>
        <label style={stepLabel}>② 게시판(카테고리) 선택</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={menuId} onChange={(e) => { setMenuId(e.target.value); localStorage.setItem("moca_menuId", e.target.value); }}>
            <option value="">{boards.length ? "게시판을 선택하세요" : "카페 선택 후 불러오기 →"}</option>
            {boards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
          </select>
          <button className="moca-w-btn" disabled={busy === "boards" || !cafeId} onClick={loadBoards} style={{ background: cafeId ? "var(--m-gold)" : "var(--m-tabhover)", color: cafeId ? "var(--m-goldink)" : "var(--m-sub)", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: cafeId ? "pointer" : "default", whiteSpace: "nowrap" }}>{busy === "boards" ? "불러오는 중…" : "게시판 불러오기"}</button>
        </div>
      </div>

      {/* ③ 키워드 + AI */}
      <div style={card}>
        <label style={stepLabel}>③ 키워드 → AI 글 생성</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--m-sub)", fontSize: 13 }}>글 길이:</span>
          {[
            { v: 500, l: "짧게", d: "약 500자" },
            { v: 1000, l: "보통", d: "약 1000자" },
            { v: 1800, l: "길게", d: "약 1800자" },
            { v: 2600, l: "아주 길게", d: "약 2600자" },
          ].map((o) => (
            <button
              key={o.v}
              className="moca-w-btn"
              onClick={() => setLengthChars(o.v)}
              title={o.d}
              style={{
                padding: "7px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                background: lengthChars === o.v ? "var(--m-gold)" : "var(--m-tabhover)",
                color: lengthChars === o.v ? "var(--m-goldink)" : "var(--m-text)",
                border: "1px solid var(--m-line2)",
              }}
            >{o.l}</button>
          ))}
          <span style={{ color: "var(--m-dim)", fontSize: 12 }}>목표 약 {lengthChars}자</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 초보 캠핑 준비물 추천" onKeyDown={(e) => e.key === "Enter" && genAI()} />
          <button className="moca-w-btn" disabled={busy === "ai"} onClick={genAI} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "0 20px", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "ai" ? "생성 중…" : "✨ AI 글 생성"}</button>
        </div>
        <input className="moca-in" style={{ ...inputStyle, marginBottom: 8, fontWeight: 700 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (AI 생성 후 편집 가능)" />
        <label style={{ ...labelStyle, marginTop: 4 }}>본문 <span style={{ color: "var(--m-dim)" }}>· 이미지는 이 본문 안에서 끝나요</span></label>
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 200, resize: "vertical", lineHeight: 1.6 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="본문 (AI 생성 후 편집 가능)" />
        <label style={{ ...labelStyle, marginTop: 10 }}>❓ 자주 묻는 질문(FAQ) <span style={{ color: "var(--m-dim)" }}>· 검색노출용, 맨 마지막(이미지 아래)에 들어가요</span></label>
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.6 }} value={faq} onChange={(e) => setFaq(e.target.value)} placeholder="자주 묻는 질문 Q&A (AI가 자동 생성, 편집 가능)" />
        <label style={{ ...labelStyle, marginTop: 10 }}>#️⃣ 해시태그 <span style={{ color: "var(--m-dim)" }}>· 글 맨 끝, 네이버 검색 노출용(키워드 5~6회는 본문에 자동 반영)</span></label>
        <input className="moca-in" style={{ ...inputStyle }} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#키워드 #관련어1 #관련어2 (AI 자동 생성, 편집 가능)" />
      </div>

      {/* 💬 글쓴이 인사말 (저장) */}
      <div style={card}>
        <label style={stepLabel}>💬 글쓴이 인사말 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 한 번 저장하면 모든 글 맨 위에 자동 삽입</span></label>
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 70, resize: "vertical", marginBottom: 8 }} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="예: 안녕하세요! 오늘도 유용한 정보 들고 왔어요 😊" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="moca-w-btn" onClick={saveGreeting} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 인사말 저장</button>
          {savedGreeting && <span style={{ color: "var(--m-log-success)", fontSize: 12 }}>✅ 저장됨</span>}
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--m-sub)", cursor: "pointer" }}>
            <input type="checkbox" checked={useGreeting} onChange={(e) => setUseGreeting(e.target.checked)} style={{ width: "auto" }} /> 이 글에 인사말 넣기
          </label>
        </div>
      </div>

      {/* 🔗 링크 (온파트너 + 내 링크) */}
      <div style={card}>
        <label style={stepLabel}>🔗 링크 삽입 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 본문에 자연스럽게 들어가요</span></label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 12px", background: "var(--m-input)", borderRadius: 8, border: "1px solid var(--m-line2)" }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 700 }}>온파트너 <span style={{ color: "var(--m-log-success)", fontSize: 11 }}>· 항상 포함</span></div>
            <div style={{ color: "var(--m-dim)", fontSize: 11 }}>{ONPARTNER.url}</div>
          </div>
        </div>
        <label style={labelStyle}>내 링크 (일반 사이트)</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="링크 이름 (예: 내 블로그)" />
          <input className="moca-in" style={{ ...inputStyle, flex: 2 }} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="moca-w-btn" onClick={saveLink} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 링크 저장</button>
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--m-sub)", cursor: "pointer" }}>
            <input type="checkbox" checked={useLink} onChange={(e) => setUseLink(e.target.checked)} style={{ width: "auto" }} /> 이 글에 내 링크 넣기
          </label>
        </div>
      </div>

      {/* ④ 이미지(플로우) 설정 */}
      <div style={card}>
        <label style={stepLabel}>④ 🌈 이미지 자동 생성 (플로우)</label>
        <p style={{ color: "var(--m-sub)", fontSize: 12, margin: "0 0 10px", lineHeight: 1.5 }}>
          발행할 때 플로우(구글 무료)로 이미지를 만들어 본문에 넣어요. 계정 토큰이 소진되면 다음 플로우 계정으로 자동 전환돼요.
          <b style={{ color: "var(--m-gold)" }}> (0장이면 이미지 없이 글만 발행)</b>
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--m-sub)", fontSize: 13 }}>이미지 장수:</span>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="moca-w-btn"
              onClick={() => setImgCount(n)}
              style={{
                width: 42, height: 42, borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer",
                background: imgCount === n ? "var(--m-gold)" : "var(--m-tabhover)",
                color: imgCount === n ? "var(--m-goldink)" : "var(--m-text)",
                border: "1px solid var(--m-line2)",
              }}
            >{n}</button>
          ))}
          <span style={{ color: "var(--m-dim)", fontSize: 12.5 }}>
            {imgCount === 0 ? "글만 발행" : `${imgCount}장 생성`}
          </span>
        </div>
      </div>

      {/* 발행 모드 토글 */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--m-text)", cursor: "pointer", fontWeight: 700 }}>
          <input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} style={{ width: "auto" }} />
          🧪 임시등록으로 테스트 (실제 공개 안 함)
        </label>
        <span style={{ color: "var(--m-dim)", fontSize: 12 }}>
          {draftOnly ? "체크 해제하면 실제로 카페에 공개 발행돼요" : "⚠️ 실제 공개 발행 모드"}
        </span>
      </div>

      {/* 발행 */}
      <button className="moca-w-btn" disabled={busy === "publish"} onClick={publish} style={{ width: "100%", background: draftOnly ? "var(--m-tabhover)" : "var(--m-gold)", color: draftOnly ? "var(--m-text)" : "var(--m-goldink)", border: draftOnly ? "1px solid var(--m-line2)" : "none", borderRadius: 10, padding: "15px", fontSize: 16, fontWeight: 800, cursor: busy === "publish" ? "default" : "pointer", opacity: busy === "publish" ? 0.6 : 1 }}>
        {busy === "publish" ? "발행 중…" : draftOnly ? `🧪 임시등록 테스트${imgCount ? ` (이미지 ${imgCount}장)` : ""}` : `🚀 카페에 발행${imgCount ? ` (이미지 ${imgCount}장)` : ""}`}
      </button>
      <p style={{ color: "var(--m-dim)", fontSize: 11.5, textAlign: "center", marginTop: 8 }}>위는 단일 글(편집 후 1건) 발행. 아래는 여러 키워드 자동 순차 발행.</p>

      {/* 🔁 순차 발행 (여러 키워드 자동 + 제어 4개) */}
      <div style={{ ...card, marginTop: 20, border: "1px solid var(--m-gold)" }}>
        <label style={stepLabel}>🔁 순차 발행 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 키워드 여러 개를 한 줄에 하나씩 → 자동으로 AI 글 생성 + 발행 반복</span></label>
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 90, resize: "vertical", marginBottom: 10, fontFamily: "monospace" }} value={seqKeywords} onChange={(e) => setSeqKeywords(e.target.value)} placeholder={"과일 손질하는 법\n제철 채소 보관법\n생선 비린내 제거"} disabled={runState !== "idle"} />

        {/* ⏰ 예약 + 텀(간격) */}
        <div style={{ padding: "10px 12px", background: "var(--m-input)", borderRadius: 8, marginBottom: 10, border: "1px solid var(--m-line2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: useSchedule ? 8 : 0, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--m-text)", cursor: "pointer", fontWeight: 700 }}>
              <input type="checkbox" checked={useSchedule} onChange={(e) => setUseSchedule(e.target.checked)} style={{ width: "auto" }} disabled={runState !== "idle"} /> ⏰ 예약 발행
            </label>
            {useSchedule && (
              <input type="datetime-local" className="moca-in" style={{ ...inputStyle, width: "auto", flex: 1, minWidth: 180 }} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} disabled={runState !== "idle"} />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--m-text)", fontWeight: 700 }}>⏳ 글 간격</span>
            <input type="number" className="moca-in" style={{ ...inputStyle, width: 70 }} value={termMin} min={1} onChange={(e) => setTermMin(Math.max(1, Number(e.target.value) || 1))} disabled={runState !== "idle"} />
            <span style={{ fontSize: 13, color: "var(--m-sub)" }}>분</span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--m-sub)", cursor: "pointer" }}>
              <input type="checkbox" checked={termRand} onChange={(e) => setTermRand(e.target.checked)} style={{ width: "auto" }} disabled={runState !== "idle"} /> ±랜덤(사람처럼)
            </label>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--m-log-success)" }}>💡 간격을 둘수록 안전해요(권장 30분+)</span>
          </div>
        </div>

        {runState !== "idle" && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--m-input)", borderRadius: 8, fontSize: 13, color: "var(--m-text)" }}>
            {runState === "running" ? "▶ 진행 중" : "⏸ 정지됨"} · {seqProg.idx}/{seqProg.total} · ✅{seqProg.ok} ❌{seqProg.fail}
            {waitInfo && <span style={{ color: "var(--m-log-progress)", marginLeft: 8 }}>· {waitInfo}</span>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="moca-w-btn" disabled={runState !== "idle"} onClick={() => runSeq(0)}
            style={{ gridColumn: "1/3", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 9, padding: "13px", fontSize: 15, fontWeight: 800, cursor: runState !== "idle" ? "default" : "pointer", opacity: runState !== "idle" ? 0.5 : 1 }}>
            ▶ 발행 시작
          </button>
          <button className="moca-w-btn" disabled={runState !== "running"} onClick={() => { pauseRef.current = true; log.push("⏸ 정지 요청 — 현재 글 끝나면 멈춰요", "warn"); }}
            style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: runState !== "running" ? "default" : "pointer", opacity: runState !== "running" ? 0.5 : 1 }}>
            ⏸ 정지
          </button>
          <button className="moca-w-btn" disabled={runState !== "paused"} onClick={() => runSeq(resumeIdxRef.current)}
            style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: runState !== "paused" ? "default" : "pointer", opacity: runState !== "paused" ? 0.5 : 1 }}>
            ⏭ 이어가기
          </button>
          <button className="moca-w-btn" disabled={runState === "idle"} onClick={() => { stopRef.current = true; pauseRef.current = false; abortRef.current?.abort(); botFetch(`${BOT_BASE}/api/cafe/cancel`, { method: "POST" }).catch(() => {}); setRunState("idle"); setWaitInfo(""); log.push("🛑 즉시 취소됨 (봇 크롬도 종료)", "error"); }}
            style={{ gridColumn: "1/3", background: runState === "idle" ? "var(--m-tabhover)" : "var(--m-log-error)", color: runState === "idle" ? "var(--m-sub)" : "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: runState === "idle" ? "default" : "pointer" }}>
            🛑 취소 (즉시)
          </button>
        </div>
        <p style={{ color: "var(--m-dim)", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
          위의 글 길이·이미지 장수·인사말·링크·임시등록 설정을 그대로 써요. 정지=현재 글 끝나고 멈춤(이어가기 가능), 취소=완전 중단.
        </p>
      </div>
    </div>
  );
}
