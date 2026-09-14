// MOCA (Marketing On CAfe) — 네이버 카페 자동화 (관리자 전용)
// ⚠️ 퍼블리와 무관한 독립 앱. UI는 카페 전용 새 디자인(커피톤). 퍼블리 UI 이식 금지.
// 하이브리드 레이아웃: PC=3분할 콘솔형(탭|작업|로그), 모바일=세로 스택(로그 하단).
// 테마: 다크/라이트 CSS 변수 토글(로그인·대시보드·로그콘솔 전부 연동).
import { useEffect, useState } from "react";
import LogConsole from "./components/LogConsole";
import AccountsTab from "./components/AccountsTab";
import WriteTab from "./components/WriteTab";
import PasswordInput from "./components/PasswordInput";
import { useLog } from "./lib/useLog";

// 임시 관리자 게이트. TODO(STEP1): Supabase moca_admins 테이블 인증으로 교체.
const ADMIN_PW = "moca2026";
type Theme = "dark" | "light";

const THEME_CSS = `
.moca-dark{
  --m-bg:#16110d; --m-grad:radial-gradient(circle at 50% 30%,#2a1d12,#16110d 70%);
  --m-panel:#221912; --m-tabbar:#1b130d; --m-input:#120d08;
  --m-line:#3a2a1a; --m-line2:#4a3524;
  --m-text:#f4efe4; --m-sub:#9a856b; --m-dim:#6f5b45;
  --m-gold:#c8a27a; --m-goldink:#16110d; --m-tabhover:#2a1d12;
  --m-console:#1b130d; --m-tagbg:#3a2a1a;
  --m-log-sys:#c8a27a; --m-log-info:#e8dccb; --m-log-progress:#ffcf6b;
  --m-log-success:#7dd88f; --m-log-warn:#ffb84d; --m-log-error:#ff7a7a;
}
.moca-light{
  --m-bg:#efe6d8; --m-grad:radial-gradient(circle at 50% 30%,#fff8ec,#e6d8c2 70%);
  --m-panel:#fffdf9; --m-tabbar:#f6efe3; --m-input:#fffdf9;
  --m-line:#ddcdb5; --m-line2:#cbb593;
  --m-text:#2a1d12; --m-sub:#8a7355; --m-dim:#a89373;
  --m-gold:#a5764a; --m-goldink:#fffdf9; --m-tabhover:#ece0cd;
  --m-console:#fbf6ec; --m-tagbg:#ece0cd;
  --m-log-sys:#8a5a2c; --m-log-info:#3d2c1a; --m-log-progress:#b8791f;
  --m-log-success:#2f9d54; --m-log-warn:#c07d18; --m-log-error:#d0453d;
}
.moca-primary:hover{filter:brightness(1.08)} .moca-primary:active{transform:scale(.97)}
.moca-ghost:hover{filter:brightness(1.15)} .moca-ghost:active{transform:scale(.96)}
.moca-in:focus{outline:none;border-color:var(--m-gold)}
`;

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("moca_theme") as Theme) || "dark");
  const [authed, setAuthed] = useState(() => localStorage.getItem("moca_admin") === "1");

  useEffect(() => {
    localStorage.setItem("moca_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className={theme === "light" ? "moca-light" : "moca-dark"} style={{ minHeight: "100vh", background: "var(--m-bg)" }}>
      <style>{THEME_CSS}</style>
      {!authed ? (
        <AdminLogin
          theme={theme}
          onToggleTheme={toggleTheme}
          onOk={() => {
            localStorage.setItem("moca_admin", "1");
            setAuthed(true);
          }}
        />
      ) : (
        <Dashboard
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => {
            localStorage.removeItem("moca_admin");
            setAuthed(false);
          }}
        />
      )}
    </div>
  );
}

/* 다크/라이트 토글 버튼 */
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      className="moca-ghost"
      onClick={onToggle}
      title={theme === "dark" ? "라이트 모드로" : "다크 모드로"}
      style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "6px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
    >
      {theme === "dark" ? "☀️ 라이트" : "🌙 다크"}
    </button>
  );
}

/* ───────────── 관리자 로그인 게이트 ───────────── */
function AdminLogin({ onOk, theme, onToggleTheme }: { onOk: () => void; theme: Theme; onToggleTheme: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  function submit() {
    if (pw === ADMIN_PW) onOk();
    else setErr("비밀번호가 틀렸어요");
  }
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--m-grad)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", position: "relative" }}>
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div style={{ width: "min(92vw, 380px)", background: "var(--m-panel)", border: "1px solid var(--m-line)", borderRadius: 18, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 56 }}>☕</div>
        <h1 style={{ color: "var(--m-gold)", fontSize: 34, letterSpacing: 5, margin: "6px 0 2px", fontWeight: 800 }}>MOCA</h1>
        <p style={{ color: "var(--m-sub)", fontSize: 12.5, marginBottom: 22 }}>Marketing On CAfe · 관리자</p>
        <div style={{ marginBottom: 10 }}>
          <PasswordInput
            value={pw}
            onChange={(v) => { setPw(v); setErr(""); }}
            onEnter={submit}
            placeholder="관리자 비밀번호"
            autoFocus
            style={{ padding: "14px 40px 14px 16px", fontSize: 16, borderRadius: 10 }}
          />
        </div>
        {err && <div style={{ color: "var(--m-log-error)", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button className="moca-primary" onClick={submit} style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 800, borderRadius: 10, border: "none", background: "var(--m-gold)", color: "var(--m-goldink)", cursor: "pointer" }}>
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

function Dashboard({ onLogout, theme, onToggleTheme }: { onLogout: () => void; theme: Theme; onToggleTheme: () => void }) {
  const log = useLog();
  const [showWindow, setShowWindow] = useState(false);
  const [tab, setTab] = useState("write");
  const [selectedAccs, setSelectedAccs] = useState<Set<string>>(new Set());
  const toggleAcc = (id: string) =>
    setSelectedAccs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div style={{ height: "100vh", background: "var(--m-bg)", color: "var(--m-text)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        .moca-tab:hover{background:var(--m-tabhover)}
        .moca-tab.on{background:var(--m-tabhover);border-left:3px solid var(--m-gold)}
        .moca-body{display:grid;grid-template-columns:180px 1fr 380px;flex:1;min-height:0}
        .moca-logwrap{padding:12px;min-height:0}
        @media(max-width:900px){
          .moca-body{display:flex;flex-direction:column}
          .moca-tabs{flex-direction:row!important;overflow-x:auto;border-right:none!important;border-bottom:1px solid var(--m-line)}
          .moca-tab{border-left:none!important;white-space:nowrap}
          .moca-logwrap{height:44vh}
        }
      `}</style>

      {/* 상단바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--m-line)", background: "var(--m-tabbar)" }}>
        <b style={{ color: "var(--m-gold)", fontSize: 18, letterSpacing: 2 }}>☕ MOCA</b>
        <span style={{ color: "var(--m-dim)", fontSize: 12 }}>네이버 카페 자동화 · 관리자</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--m-log-success)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--m-log-success)", display: "inline-block" }} />봇 대기
        </span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button className="moca-ghost" onClick={onLogout} style={{ background: "var(--m-tabhover)", color: "var(--m-text)", border: "1px solid var(--m-line2)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          로그아웃
        </button>
      </div>

      {/* 본문 3분할 */}
      <div className="moca-body">
        <div className="moca-tabs" style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--m-line)", background: "var(--m-tabbar)", padding: "8px 0" }}>
          {TABS.map((t) => (
            <div key={t.k} className={"moca-tab" + (tab === t.k ? " on" : "")} onClick={() => setTab(t.k)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: tab === t.k ? "var(--m-text)" : "var(--m-sub)" }}>
              <span style={{ fontSize: 17 }}>{t.ico}</span>
              {t.label}
            </div>
          ))}
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          <h2 style={{ color: "var(--m-text)", fontSize: 20, marginBottom: 6 }}>
            {TABS.find((t) => t.k === tab)?.ico} {TABS.find((t) => t.k === tab)?.label}
          </h2>
          {tab === "accounts" ? (
            <AccountsTab selected={selectedAccs} onToggle={toggleAcc} log={log} />
          ) : tab === "write" ? (
            <WriteTab selected={selectedAccs} log={log} showWindow={showWindow} />
          ) : (
            <p style={{ color: "var(--m-sub)", fontSize: 13, lineHeight: 1.6 }}>이 기능은 준비 중이에요 (STEP 로드맵 순서대로 구현).</p>
          )}
        </div>

        <div className="moca-logwrap">
          <LogConsole log={log} title="실시간 로그" showWindow={showWindow} onToggleWindow={setShowWindow} />
        </div>
      </div>
    </div>
  );
}
