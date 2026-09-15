// 📝 카페 글쓰기·발행 — 계정선택 → 카페선택 → 게시판선택 → 키워드 → AI글 → 발행
// 카페 목록/게시판은 봇 필요(데스크톱 앱). AI 글 생성은 웹에서도 됨(Gemini 직접).
import { useState, useRef } from "react";
import { botFetch, BOT_BASE, BotEventStream } from "../lib/botApi";
import { getGeminiKeys, setGeminiKeys, generateCafePost } from "../lib/gemini";
import { listFlowAccounts } from "../lib/flowAccounts";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeBoard { menuId: string; name: string; type: string; }
// 온파트너 상품(제휴 링크) — partner.yuanfnb.com/api/product-card 응답
interface OnPartnerProduct { id: string | null; name: string; image: string; price: number | null; available: boolean; partnerUrl: string; shopUrl: string; }
interface OnPartnerItem { product: OnPartnerProduct; banner: string; }
const MAX_ONPARTNER = 3;

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
  // 🔑 Gemini 키 여러 개: 위 키부터 쓰다가 사용량 소진되면 다음 키로 자동 전환
  const [keyInputs, setKeyInputs] = useState<string[]>(() => { const ks = getGeminiKeys(); return ks.length ? ks : [""]; });
  const [keySaved, setKeySaved] = useState(getGeminiKeys().length > 0);
  const [keyOpen, setKeyOpen] = useState(getGeminiKeys().length === 0); // 키 없으면 펼침, 있으면 접힘
  const [showKey, setShowKey] = useState(false); // 🔑 키 미리보기(눈) 토글
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
  const [draftOnly, setDraftOnly] = useState(false); // 기본 = 실제 발행(등록). 체크하면 임시등록(테스트)
  // 🔒 공개 설정(발행 시 봇이 카페 글쓰기 옵션 자동 세팅). 기본=복사·저장 방지 + 자동출처 남기기
  const PUB_DEFAULT = { allowComment: true, allowScrap: true, allowCopy: false, autoSource: true, ccl: false };
  const [pubOpts, setPubOpts] = useState<typeof PUB_DEFAULT>(() => { try { return { ...PUB_DEFAULT, ...JSON.parse(localStorage.getItem("moca_pub_opts") || "{}") }; } catch { return PUB_DEFAULT; } });
  function setPub(key: keyof typeof PUB_DEFAULT, v: boolean) { setPubOpts((prev) => { const n = { ...prev, [key]: v }; localStorage.setItem("moca_pub_opts", JSON.stringify(n)); return n; }); }
  // 🤝 온파트너 = "상품 링크"(홈링크 아님). 상품링크 입력→조회(미리보기)→추가(최대 3개). 발행 시 본문 이미지 사이에 상품카드(OG 썸네일) 분산 삽입.
  const [onPartnerItems, setOnPartnerItems] = useState<OnPartnerItem[]>(() => { try { return JSON.parse(localStorage.getItem("moca_onpartner_items") || "[]"); } catch { return []; } });
  const [onPartnerLink, setOnPartnerLink] = useState("");       // 입력 중인 상품 링크
  const [onPartnerPreview, setOnPartnerPreview] = useState<OnPartnerItem | null>(null); // 조회한 상품(아직 추가 전)
  const [onPartnerLoading, setOnPartnerLoading] = useState(false);
  const [onPartnerError, setOnPartnerError] = useState("");

  // ── 🔁 순차 발행(여러 키워드 자동) + 제어 4개(발행시작/정지/이어가기/취소) ──
  const [seqKeywords, setSeqKeywords] = useState("");
  const [runState, setRunState] = useState<"idle" | "running" | "paused">("idle");
  const [seqProg, setSeqProg] = useState({ idx: 0, total: 0, ok: 0, fail: 0 });
  const stopRef = useRef(false);   // 취소
  const pauseRef = useRef(false);  // 정지
  const resumeIdxRef = useRef(0);  // 이어가기 시작 인덱스
  const streamRef = useRef<BotEventStream | null>(null); // 진행 중 발행 SSE 스트림(정지/취소 시 close)
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
    const clean = keyInputs.map((k) => k.trim()).filter(Boolean);
    setGeminiKeys(clean);
    setKeyInputs(clean.length ? clean : [""]);
    setKeySaved(clean.length > 0);
    if (clean.length) setKeyOpen(false); // 저장되면 접기
    log.push(clean.length ? `Gemini API 키 ${clean.length}개 저장됨${clean.length > 1 ? " (위 키부터 쓰다 소진되면 다음 키로 자동 전환)" : ""}` : "Gemini 키 비움", "info");
  }
  function updateKey(i: number, v: string) { setKeyInputs((prev) => prev.map((k, idx) => (idx === i ? v : k))); }
  function addKey() { setKeyInputs((prev) => (prev.length >= 5 ? prev : [...prev, ""])); }
  function removeKey(i: number) { setKeyInputs((prev) => { const n = prev.filter((_, idx) => idx !== i); return n.length ? n : [""]; }); }
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

  // 🤝 온파트너 상품 목록 영속(앱 껐다 켜도 유지)
  function persistOnPartner(items: OnPartnerItem[]) {
    setOnPartnerItems(items);
    localStorage.setItem("moca_onpartner_items", JSON.stringify(items));
  }
  // ① 조회 — 상품 링크로 정보 불러와 미리보기(onPartnerPreview)만 채운다. 목록엔 아직 안 담김.
  async function loadOnPartnerProduct() {
    const link = onPartnerLink.trim();
    if (!link) { setOnPartnerError("온파트너 상품 링크를 입력해주세요."); return; }
    if (onPartnerItems.length >= MAX_ONPARTNER) { setOnPartnerError(`상품은 최대 ${MAX_ONPARTNER}개까지 넣을 수 있어요.`); return; }
    setOnPartnerLoading(true); setOnPartnerError(""); setOnPartnerPreview(null);
    log.push(`온파트너 상품 조회 중… ${link}`, "progress");
    try {
      const response = await fetch(`https://partner.yuanfnb.com/api/product-card?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!data.ok || !data.product) throw new Error(data.error === "invalid_partner_link" ? "온파트너 상품 링크가 아니에요(내 추천 링크를 넣어주세요)." : (data.error || "상품 정보를 불러오지 못했어요."));
      const prod = data.product as OnPartnerProduct;
      if (onPartnerItems.some((it) => it.product.partnerUrl === prod.partnerUrl)) { setOnPartnerError("이미 추가된 상품이에요."); return; }
      // 서버가 만든 가로 배너(온파트너 /api/banner) — 미리보기·향후 배너 삽입용
      const codeM = prod.partnerUrl.match(/\/r\/([a-z0-9-]+)/i);
      const banner = codeM ? `https://partner.yuanfnb.com/api/banner?code=${codeM[1]}` : "";
      setOnPartnerPreview({ product: prod, banner });
      log.push(`상품 조회 성공: ${prod.name}${prod.price ? ` (${prod.price.toLocaleString()}원)` : ""}`, "success");
    } catch (e: any) {
      const msg = e?.name === "TimeoutError" ? "상품 확인 시간이 초과됐어요. 다시 시도해주세요." : (e?.message || "상품 정보를 불러오지 못했어요.");
      setOnPartnerError(msg); log.push(`온파트너 조회 실패: ${msg}`, "error");
    } finally { setOnPartnerLoading(false); }
  }
  // ② 추가 — 미리보기 상품을 목록에 담는다(최대 3개).
  function addOnPartnerProduct() {
    if (!onPartnerPreview) return;
    if (onPartnerItems.length >= MAX_ONPARTNER) { setOnPartnerError(`상품은 최대 ${MAX_ONPARTNER}개까지 넣을 수 있어요.`); return; }
    if (onPartnerItems.some((it) => it.product.partnerUrl === onPartnerPreview.product.partnerUrl)) { setOnPartnerError("이미 추가된 상품이에요."); return; }
    persistOnPartner([...onPartnerItems, onPartnerPreview]);
    log.push(`온파트너 상품 추가: ${onPartnerPreview.product.name} (총 ${onPartnerItems.length + 1}개)`, "success");
    setOnPartnerPreview(null); setOnPartnerLink(""); setOnPartnerError("");
  }
  function removeOnPartnerProduct(partnerUrl: string) {
    persistOnPartner(onPartnerItems.filter((it) => it.product.partnerUrl !== partnerUrl));
  }
  // 발행에 넣을 온파트너 상품(봇엔 name·partnerUrl만 필요). 조회만 하고 추가(💾) 안 한 미리보기도 포함(퍼블리 안전장치).
  function buildOnPartnerProducts(): { name: string; partnerUrl: string; banner: string }[] {
    const src = onPartnerItems.length > 0 ? onPartnerItems : (onPartnerPreview ? [onPartnerPreview] : []);
    return src.filter((it) => it.product.available && it.product.partnerUrl).map((it) => ({ name: it.product.name, partnerUrl: it.product.partnerUrl, banner: it.banner }));
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
    // 내 링크(일반 사이트)는 links로, 온파트너는 상품카드(onPartnerProducts)로 분리 전달
    const links = useLink && linkUrl.trim() ? [{ name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim() }] : [];
    const onPartnerProducts = buildOnPartnerProducts();
    if (onPartnerProducts.length) log.push(`온파트너 상품 ${onPartnerProducts.length}개 삽입: ${onPartnerProducts.map((p) => p.name).join(", ")}`, "info", cafeName);
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
    const ok = await runPublishStream({ userId: accId, cafeId, cafeUrl: cafes.find(c => c.cafeId === cafeId)?.url, menuId, title, greeting: useGreeting ? savedGreeting : "", body, links, onPartnerProducts, faq, hashtags, imgCount, imgPrompts, flowSlots, draftOnly, publishOptions: pubOpts, showWindow: showWindowState });
    void ok;
    setBusy(null);
  }

  // 🔴 발행 1건을 SSE로 실행 — 봇의 onLog/onShot을 실시간으로 받아 화면 로그/캡처에 즉시 반영(발행 끝나야 오던 것 개선).
  //    done 이벤트에서 성공 여부로 resolve. 정지/취소는 streamRef.current.close()로 스트림을 끊는다.
  function runPublishStream(payload: object): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (okv: boolean) => { if (settled) return; settled = true; streamRef.current = null; resolve(okv); };
      const es = new BotEventStream(`${BOT_BASE}/api/cafe/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      streamRef.current = es;
      es.onmessage = (ev) => {
        let d: any; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.type === "log") {
          const m = String(d.msg || "");
          const type = m.includes("⚠️") ? "warn" : (m.includes("실패") || m.includes("오류") || m.includes("❌")) ? "error" : (m.includes("🎉") || m.includes("✅")) ? "success" : "info";
          log.push(m, type, cafeName);
        } else if (d.type === "shot") {
          log.shot(d.caption, d.dataUrl, cafeName);
        } else if (d.type === "done") {
          if (d.success) log.push(`✅ 발행 완료: ${d.url}`, "success", cafeName);
          else log.push(`발행 실패: ${d.error || "?"}`, "error", cafeName);
          es.close(); finish(!!d.success);
        }
      };
      es.onerror = () => { log.push("봇 연결 오류 (데스크톱 앱에서 실행 필요)", "error", cafeName); finish(false); };
      es.onclose = () => finish(false);
    });
  }

  // 발행 1건 요청(순차 발행에서 재사용). 성공 여부 반환.
  async function sendOnePublish(kw: string, post: { title: string; body: string; faq: string; hashtags: string }): Promise<boolean> {
    const links = useLink && linkUrl.trim() ? [{ name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim() }] : [];
    const onPartnerProducts = buildOnPartnerProducts();
    let flowSlots: number[] = [];
    let imgPrompts: string[] = [];
    if (imgCount > 0) {
      const fa = await listFlowAccounts().catch(() => []);
      flowSlots = fa.filter(a => a.connected).map(a => a.slot ?? 0);
      imgPrompts = buildImgPrompts(imgCount, kw);
    }
    return runPublishStream({ userId: accId, cafeId, cafeUrl: cafes.find(c => c.cafeId === cafeId)?.url, menuId, title: post.title, greeting: useGreeting ? savedGreeting : "", body: post.body, links, onPartnerProducts, faq: post.faq, hashtags: post.hashtags, imgCount, imgPrompts, flowSlots, draftOnly, publishOptions: pubOpts, showWindow: showWindowState });
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
        // 정지로 이 글이 중단된 경우 → 실패로 안 세고, 이 글(i)부터 이어가게
        if (pauseRef.current) { resumeIdxRef.current = i; log.push(`⏸ 정지됨 — ${i + 1}번째 글 중단(이어가기로 이 글부터 다시)`, "warn", cafeName); setRunState("paused"); setWaitInfo(""); return; }
        if (success) ok++; else fail++;
      } catch (e: any) {
        if (pauseRef.current) { resumeIdxRef.current = i; log.push(`⏸ 정지됨 — ${i + 1}번째에서 멈춤`, "warn", cafeName); setRunState("paused"); setWaitInfo(""); return; }
        fail++; log.push(`[${i + 1}] 생성 실패: ${e?.message || e}`, "error", cafeName);
      }
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
              ? <span style={{ color: "var(--m-log-success)", fontSize: 12, fontWeight: 600 }}>· ✅ {getGeminiKeys().length}개 설정됨</span>
              : <span style={{ color: "var(--m-log-warn)", fontSize: 12, fontWeight: 600 }}>· ⚠️ 미설정</span>}
          </span>
          <span style={{ marginLeft: "auto", color: "var(--m-sub)", fontSize: 13 }}>{keyOpen ? "▲ 접기" : "▼ 펴기"}</span>
        </div>
        {keyOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--m-sub)", fontSize: 12, margin: "0 0 8px", lineHeight: 1.5 }}>AI 글 생성에 필요해요. 브라우저에만 저장되고 서버로 안 보내요. <b style={{ color: "var(--m-sub)" }}>키를 여러 개 넣으면 위 키부터 쓰다가 사용량이 소진되면 아래 키로 자동 전환</b>돼요.</p>
            {keyInputs.map((k, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <span style={{ color: "var(--m-dim)", fontSize: 12, fontWeight: 700, width: 44, flexShrink: 0 }}>키 {i + 1}</span>
                <div style={{ position: "relative", flex: 1 }}>
                  <input className="moca-in" style={{ ...inputStyle, paddingRight: 42 }} type={showKey ? "text" : "password"} value={k} onChange={(e) => updateKey(i, e.target.value)} placeholder={i === 0 ? "AIza... (메인 키)" : "AIza... (예비 키)"} />
                  <button type="button" onClick={() => setShowKey((v) => !v)} title={showKey ? "숨기기" : "보기"}
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: "4px 6px", lineHeight: 1 }}>
                    {showKey ? "🙈" : "👁️"}
                  </button>
                </div>
                {keyInputs.length > 1 && (
                  <button type="button" onClick={() => removeKey(i)} title="이 키 삭제"
                    style={{ background: "transparent", color: "var(--m-log-error)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>🗑️</button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              {keyInputs.length < 5 && (
                <button className="moca-w-btn" onClick={addKey} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>➕ 키 추가</button>
              )}
              <button className="moca-w-btn" onClick={saveKey} style={{ marginLeft: "auto", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>💾 저장</button>
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

        {/* 🤝 온파트너 = 상품 링크 (홈링크 아님). 조회 → 미리보기 → 추가(최대 3개). 발행 시 본문 이미지 사이에 상품카드로 분산 삽입 */}
        <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--m-input)", borderRadius: 10, border: "1px solid var(--m-line2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 17 }}>🤝</span>
            <div style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 800 }}>온파트너 상품 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 11 }}>· 내 추천 상품 링크 (최대 {MAX_ONPARTNER}개)</span></div>
          </div>
          <p style={{ color: "var(--m-dim)", fontSize: 11, margin: "0 0 8px", lineHeight: 1.5 }}>
            온파트너 <b style={{ color: "var(--m-sub)" }}>상품 추천 링크</b>(partner.yuanfnb.com/r/…)를 넣고 조회하면, 발행 시 본문 이미지 사이에 <b style={{ color: "var(--m-sub)" }}>상품 카드(썸네일+가격)</b>로 자동 삽입돼 판매 수익으로 이어져요. 글 맨 위엔 제휴 안내 문구가 붙어요.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={onPartnerLink} onChange={(e) => { setOnPartnerLink(e.target.value); setOnPartnerError(""); }} placeholder="온파트너 상품 링크 붙여넣기 (https://partner.yuanfnb.com/r/…)"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); loadOnPartnerProduct(); } }} disabled={onPartnerItems.length >= MAX_ONPARTNER} />
            <button className="moca-w-btn" onClick={loadOnPartnerProduct} disabled={onPartnerLoading || onPartnerItems.length >= MAX_ONPARTNER}
              style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 800, cursor: onPartnerLoading ? "wait" : "pointer", whiteSpace: "nowrap", opacity: onPartnerItems.length >= MAX_ONPARTNER ? 0.5 : 1 }}>
              {onPartnerLoading ? "조회 중…" : "🔍 조회"}
            </button>
          </div>
          {onPartnerError && <div style={{ color: "var(--m-log-error)", fontSize: 12, marginBottom: 8 }}>⚠️ {onPartnerError}</div>}

          {/* 미리보기(조회했으나 아직 추가 전) */}
          {onPartnerPreview && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 8, background: "var(--m-panel)", borderRadius: 8, border: "1px dashed var(--m-gold)" }}>
              {onPartnerPreview.product.image && <img src={onPartnerPreview.product.image} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--m-text)", fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{onPartnerPreview.product.name}</div>
                <div style={{ color: "var(--m-dim)", fontSize: 11 }}>{onPartnerPreview.product.price ? `${onPartnerPreview.product.price.toLocaleString()}원` : ""} {onPartnerPreview.product.available ? "" : "· ⚠️ 품절/판매불가"}</div>
              </div>
              <button className="moca-w-btn" onClick={addOnPartnerProduct} disabled={!onPartnerPreview.product.available}
                style={{ background: "var(--m-log-success)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", opacity: onPartnerPreview.product.available ? 1 : 0.5 }}>➕ 추가</button>
            </div>
          )}

          {/* 추가된 상품 목록 */}
          {onPartnerItems.map((it) => (
            <div key={it.product.partnerUrl} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 6, background: "var(--m-panel)", borderRadius: 8, border: "1px solid var(--m-line)" }}>
              {it.product.image && <img src={it.product.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--m-text)", fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.product.name}</div>
                <div style={{ color: "var(--m-dim)", fontSize: 11 }}>{it.product.price ? `${it.product.price.toLocaleString()}원` : ""}</div>
              </div>
              <button className="moca-w-btn" onClick={() => removeOnPartnerProduct(it.product.partnerUrl)}
                style={{ background: "transparent", color: "var(--m-log-error)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>🗑️ 삭제</button>
            </div>
          ))}
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

      {/* 🔒 공개 설정 (발행 시 봇이 카페 글쓰기 옵션 자동 세팅) */}
      <div style={card}>
        <label style={stepLabel}>🔒 공개 설정 <span style={{ color: "var(--m-dim)", fontWeight: 400, fontSize: 12 }}>· 발행할 때 이 상태로 자동 세팅돼요</span></label>
        {([
          ["allowComment", "댓글 허용", "다른 회원이 댓글을 달 수 있어요(소통·활성도)"],
          ["allowScrap", "카페·블로그 스크랩 허용", "출처를 달고 퍼가기 가능 → 홍보 확산에 유리"],
          ["allowCopy", "복사·저장 허용", "끄면 본문 드래그 복사를 막아요(자동복사 방지)"],
          ["autoSource", "자동출처 사용", "복사돼도 원문 출처가 자동으로 붙어요(내 카페 유입)"],
          ["ccl", "CCL 사용", "저작물 이용 조건(크리에이티브 커먼즈) 표시. 마케팅 글엔 보통 불필요"],
        ] as [keyof typeof PUB_DEFAULT, string, string][]).map(([key, label, desc]) => (
          <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer", borderBottom: "1px solid var(--m-line)" }}>
            <input type="checkbox" checked={pubOpts[key]} onChange={(e) => setPub(key, e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--m-text)", fontSize: 13, fontWeight: 700 }}>{label} <span style={{ color: pubOpts[key] ? "var(--m-log-success)" : "var(--m-dim)", fontSize: 11, fontWeight: 600 }}>{pubOpts[key] ? "· 켜짐" : "· 꺼짐"}</span></div>
              <div style={{ color: "var(--m-dim)", fontSize: 11.5, lineHeight: 1.4 }}>{desc}</div>
            </div>
          </label>
        ))}
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
          <button className="moca-w-btn" disabled={runState !== "running"} onClick={() => { pauseRef.current = true; streamRef.current?.close(); botFetch(`${BOT_BASE}/api/cafe/cancel`, { method: "POST" }).catch(() => {}); log.push("⏸ 정지 — 진행 중 글 중단(이어가기로 이 글부터 다시)", "warn"); }}
            style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: runState !== "running" ? "default" : "pointer", opacity: runState !== "running" ? 0.5 : 1 }}>
            ⏸ 정지
          </button>
          <button className="moca-w-btn" disabled={runState !== "paused"} onClick={() => runSeq(resumeIdxRef.current)}
            style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: runState !== "paused" ? "default" : "pointer", opacity: runState !== "paused" ? 0.5 : 1 }}>
            ⏭ 이어가기
          </button>
          <button className="moca-w-btn" disabled={runState === "idle"} onClick={() => { stopRef.current = true; pauseRef.current = false; streamRef.current?.close(); botFetch(`${BOT_BASE}/api/cafe/cancel`, { method: "POST" }).catch(() => {}); setRunState("idle"); setWaitInfo(""); log.push("🛑 즉시 취소됨 (봇 크롬도 종료)", "error"); }}
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
