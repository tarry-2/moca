// 📝 카페 글쓰기·발행 — 계정선택 → 카페선택 → 게시판선택 → 키워드 → AI글 → 발행
// 카페 목록/게시판은 봇 필요(데스크톱 앱). AI 글 생성은 웹에서도 됨(Gemini 직접).
import { useState } from "react";
import { botFetch, BOT_BASE } from "../lib/botApi";
import { getGeminiKey, setGeminiKey, generateCafePost } from "../lib/gemini";
import type { UseLog } from "../lib/useLog";

interface MyCafe { cafeId: string; name: string; url: string; }
interface CafeBoard { menuId: string; name: string; type: string; }

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: "1px solid var(--m-line2)", background: "var(--m-input)", color: "var(--m-text)",
};
const card: React.CSSProperties = { background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 16, marginBottom: 14 };
const stepLabel: React.CSSProperties = { color: "var(--m-text)", fontSize: 14, fontWeight: 800, marginBottom: 10, display: "block" };

interface Props {
  selected: Set<string>;
  log: UseLog;
}

export default function WriteTab({ selected, log }: Props) {
  const [keyInput, setKeyInput] = useState(getGeminiKey());
  const [keySaved, setKeySaved] = useState(!!getGeminiKey());
  const [keyOpen, setKeyOpen] = useState(!getGeminiKey()); // 키 없으면 펼침, 있으면 접힘
  const [cafes, setCafes] = useState<MyCafe[]>([]);
  const [cafeId, setCafeId] = useState("");
  const [boards, setBoards] = useState<CafeBoard[]>([]);
  const [menuId, setMenuId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const accId = [...selected][0];
  const cafeName = cafes.find((c) => c.cafeId === cafeId)?.name || "";
  const boardName = boards.find((b) => b.menuId === menuId)?.name || "";

  function saveKey() {
    setGeminiKey(keyInput);
    setKeySaved(!!keyInput.trim());
    if (keyInput.trim()) setKeyOpen(false); // 저장되면 접기
    log.push("Gemini API 키 저장됨", "info");
  }

  async function loadCafes() {
    if (!accId) { log.push("먼저 '카페 계정' 탭에서 계정을 선택하세요", "warn"); return; }
    setBusy("cafes");
    log.push("내 카페 목록 불러오는 중… (봇)", "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/my/${accId}`);
      const d = await res.json();
      if (d.cafes?.length) { setCafes(d.cafes); log.push(`카페 ${d.cafes.length}개 불러옴`, "success"); }
      else log.push(`카페 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} (데스크톱 앱에서 실행 필요)`, "error");
    } finally { setBusy(null); }
  }

  async function loadBoards() {
    if (!accId || !cafeId) { log.push("계정과 카페를 먼저 선택하세요", "warn"); return; }
    setBusy("boards");
    log.push(`게시판 목록 불러오는 중… (${cafeName})`, "progress");
    try {
      const res = await botFetch(`${BOT_BASE}/api/cafe/boards`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: accId, cafeId }),
      });
      const d = await res.json();
      if (d.boards?.length) { setBoards(d.boards); log.push(`게시판 ${d.boards.length}개 불러옴`, "success"); }
      else log.push(`게시판 없음/실패: ${d.error || "빈 목록"}`, d.error ? "error" : "warn");
    } catch (e: any) {
      log.push(`봇 연결 실패: ${e?.message || e} (데스크톱 앱에서 실행 필요)`, "error");
    } finally { setBusy(null); }
  }

  async function genAI() {
    if (!keyword.trim()) { log.push("키워드를 입력하세요", "warn"); return; }
    setBusy("ai");
    log.push(`━━ AI 글 생성: "${keyword}" ━━`, "sys");
    try {
      const r = await generateCafePost(keyword, cafeName || "카페", boardName || "게시판", (m) => log.push(m, "progress"));
      setTitle(r.title);
      setContent(r.content);
      log.push(`제목: ${r.title}`, "success");
    } catch (e: any) {
      log.push(`AI 생성 실패: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  }

  function publish() {
    if (!accId || !cafeId || !menuId || !title.trim() || !content.trim()) {
      log.push("계정·카페·게시판·제목·본문을 모두 채워주세요", "warn");
      return;
    }
    // TODO(STEP1): publishCafe 봇 함수 연결(에디터 조작 + showWindow/onShot). 실계정 검증 필요.
    log.push(`🚀 발행 준비: [${cafeName}] ${boardName} · "${title}" — 발행봇(publishCafe) 구현 예정`, "warn", cafeName);
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
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={cafeId} onChange={(e) => { setCafeId(e.target.value); setBoards([]); setMenuId(""); }}>
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
          <select className="moca-in" style={{ ...inputStyle, flex: 1 }} value={menuId} onChange={(e) => setMenuId(e.target.value)}>
            <option value="">{boards.length ? "게시판을 선택하세요" : "카페 선택 후 불러오기 →"}</option>
            {boards.map((b) => <option key={b.menuId} value={b.menuId}>{b.name}</option>)}
          </select>
          <button className="moca-w-btn" disabled={busy === "boards" || !cafeId} onClick={loadBoards} style={{ background: cafeId ? "var(--m-gold)" : "var(--m-tabhover)", color: cafeId ? "var(--m-goldink)" : "var(--m-sub)", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: cafeId ? "pointer" : "default", whiteSpace: "nowrap" }}>{busy === "boards" ? "불러오는 중…" : "게시판 불러오기"}</button>
        </div>
      </div>

      {/* ③ 키워드 + AI */}
      <div style={card}>
        <label style={stepLabel}>③ 키워드 → AI 글 생성</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="moca-in" style={{ ...inputStyle, flex: 1 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 초보 캠핑 준비물 추천" onKeyDown={(e) => e.key === "Enter" && genAI()} />
          <button className="moca-w-btn" disabled={busy === "ai"} onClick={genAI} style={{ background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 8, padding: "0 20px", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === "ai" ? "생성 중…" : "✨ AI 글 생성"}</button>
        </div>
        <input className="moca-in" style={{ ...inputStyle, marginBottom: 8, fontWeight: 700 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (AI 생성 후 편집 가능)" />
        <textarea className="moca-in" style={{ ...inputStyle, minHeight: 220, resize: "vertical", lineHeight: 1.6 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="본문 (AI 생성 후 편집 가능)" />
      </div>

      {/* 발행 */}
      <button className="moca-w-btn" onClick={publish} style={{ width: "100%", background: "var(--m-gold)", color: "var(--m-goldink)", border: "none", borderRadius: 10, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
        🚀 카페에 발행
      </button>
      <p style={{ color: "var(--m-dim)", fontSize: 11.5, textAlign: "center", marginTop: 8 }}>발행봇(에디터 조작 + 창보기/캡처)은 실계정 검증과 함께 연결 예정</p>
    </div>
  );
}
