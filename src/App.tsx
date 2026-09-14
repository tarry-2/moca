// MOCA (Marketing On CAfe) — 네이버 카페 자동화 (관리자 전용)
// ⚠️ 퍼블리와 무관한 독립 앱. UI는 카페 전용 새 디자인(커피톤). 퍼블리 UI 이식 금지.
// 하이브리드 레이아웃: PC=3분할 콘솔형(탭|작업|로그), 모바일=세로 스택(로그 하단).
import { useState } from "react";
import LogConsole from "./components/LogConsole";
import { useLog } from "./lib/useLog";

// 임시 관리자 게이트. TODO(STEP1): Supabase moca_admins 테이블 인증으로 교체.
const ADMIN_PW = "moca2026";

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem("moca_admin") === "1");
  if (!authed)
    return (
      <AdminLogin
        onOk={() => {
          localStorage.setItem("moca_admin", "1");
          setAuthed(true);
        }}
      />
    );
  return (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem("moca_admin");
        setAuthed(false);
      }}
    />
  );
}

/* ───────────── 관리자 로그인 게이트 ───────────── */
function AdminLogin({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  function submit() {
    if (pw === ADMIN_PW) onOk();
    else setErr("비밀번호가 틀렸어요");
  }
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 30%, #2a1d12 0%, #16110d 70%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`.moca-in:focus{outline:none;border-color:#c8a27a} .moca-primary:hover{filter:brightness(1.1)} .moca-primary:active{transform:scale(.97)}`}</style>
      <div style={{ width: "min(92vw, 380px)", background: "#221912", border: "1px solid #3a2a1a", borderRadius: 18, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 56 }}>☕</div>
        <h1 style={{ color: "#c8a27a", fontSize: 34, letterSpacing: 5, margin: "6px 0 2px", fontWeight: 800 }}>MOCA</h1>
        <p style={{ color: "#9a856b", fontSize: 12.5, marginBottom: 22 }}>Marketing On CAfe · 관리자</p>
        <input
          className="moca-in"
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="관리자 비밀번호"
          style={{ width: "100%", padding: "14px 16px", fontSize: 16, borderRadius: 10, border: "1px solid #4a3524", background: "#16110d", color: "#f4efe4", marginBottom: 10 }}
        />
        {err && <div style={{ color: "#ff7a7a", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button className="moca-primary" onClick={submit} style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 800, borderRadius: 10, border: "none", background: "#c8a27a", color: "#16110d", cursor: "pointer" }}>
          로그인
        </button>
      </div>
    </div>
  );
}

/* ───────────── 대시보드 (하이브리드 셸) ───────────── */
const TABS = [
  { k: "write", ico: "📝", label: "글쓰기·발행" },
  { k: "accounts", ico: "👤", label: "카페 계정" },
  { k: "manage", ico: "🛡️", label: "내 카페 관리" },
  { k: "activity", ico: "💬", label: "활동·등업" },
  { k: "promo", ico: "📢", label: "홍보" },
  { k: "inflow", ico: "📈", label: "유입·조회수" },
];

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const log = useLog();
  const [showWindow, setShowWindow] = useState(false);
  const [tab, setTab] = useState("write");

  // 데모: 로그 색상·태그·단계·경고/실패 흐름 시연 (실제 봇 연결 전 동작 확인용)
  function demoLog() {
    const acc = "chn25724";
    log.push("━━━━━ 데모 발행 시작 ━━━━━", "sys", acc);
    log.push("네이버 로그인 세션 복원 중…", "progress", acc);
    setTimeout(() => log.push("로그인 성공", "success", acc), 400);
    setTimeout(() => log.push("카페 '○○맘카페' 자유게시판으로 이동", "info", "○○맘카페"), 800);
    setTimeout(() => log.push("AI 제목 생성 완료 (gemini-2.5-flash, 1.2s)", "info"), 1200);
    setTimeout(() => log.push("AI 본문 생성 완료 (1,842자)", "info"), 1600);
    setTimeout(() => log.push("⚠️ 이미지 크레딧 소진 → 다음 계정(slot 1)으로 전환", "warn"), 2000);
    setTimeout(() => log.push("발행 실패: 등업 필요(이 카페는 '정회원'부터 글쓰기)", "error", "○○맘카페"), 2400);
  }

  return (
    <div className="moca-shell" style={{ height: "100vh", background: "#16110d", color: "#f4efe4", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        .moca-tab:hover{background:#2a1d12}
        .moca-tab.on{background:#2a1d12;border-left:3px solid #c8a27a}
        .moca-body{display:grid;grid-template-columns:180px 1fr 380px;flex:1;min-height:0}
        .moca-logwrap{padding:12px;min-height:0}
        .moca-ghost:hover{filter:brightness(1.2)} .moca-ghost:active{transform:scale(.96)}
        @media(max-width:900px){
          .moca-body{display:flex;flex-direction:column}
          .moca-tabs{flex-direction:row!important;overflow-x:auto;border-right:none!important;border-bottom:1px solid #3a2a1a}
          .moca-tab{border-left:none!important;white-space:nowrap}
          .moca-logwrap{height:44vh}
        }
      `}</style>

      {/* 상단바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #3a2a1a", background: "#1b130d" }}>
        <b style={{ color: "#c8a27a", fontSize: 18, letterSpacing: 2 }}>☕ MOCA</b>
        <span style={{ color: "#6f5b45", fontSize: 12 }}>네이버 카페 자동화 · 관리자</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7dd88f" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7dd88f", display: "inline-block" }} />봇 대기
        </span>
        <button className="moca-ghost" onClick={onLogout} style={{ background: "#2a1d12", color: "#e8dccb", border: "1px solid #4a3524", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          로그아웃
        </button>
      </div>

      {/* 본문 3분할 */}
      <div className="moca-body">
        {/* 탭 */}
        <div className="moca-tabs" style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #3a2a1a", background: "#1b130d", padding: "8px 0" }}>
          {TABS.map((t) => (
            <div key={t.k} className={"moca-tab" + (tab === t.k ? " on" : "")} onClick={() => setTab(t.k)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: tab === t.k ? "#f4efe4" : "#9a856b" }}>
              <span style={{ fontSize: 17 }}>{t.ico}</span>
              {t.label}
            </div>
          ))}
        </div>

        {/* 작업 영역 */}
        <div style={{ padding: 20, overflowY: "auto" }}>
          <h2 style={{ color: "#f4efe4", fontSize: 20, marginBottom: 6 }}>
            {TABS.find((t) => t.k === tab)?.ico} {TABS.find((t) => t.k === tab)?.label}
          </h2>
          <p style={{ color: "#9a856b", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
            {tab === "write"
              ? "카페·게시판을 고르고 AI가 글을 써서 자동 발행해요. 진행은 오른쪽 로그에 세세히 떠요."
              : "이 기능은 준비 중이에요 (STEP 로드맵 순서대로 구현)."}
          </p>
          {tab === "write" && (
            <button className="moca-ghost" onClick={demoLog} style={{ background: "#c8a27a", color: "#16110d", border: "none", borderRadius: 10, padding: "13px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
              ▶ 로그 데모 실행 (동작 확인용)
            </button>
          )}
        </div>

        {/* 로그 */}
        <div className="moca-logwrap">
          <LogConsole log={log} title="실시간 로그" showWindow={showWindow} onToggleWindow={setShowWindow} />
        </div>
      </div>
    </div>
  );
}
