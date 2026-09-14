// 📜 MOCA LogConsole — 골든시드 발행로그(twLogArr/twShot/창보기/복사/크게보기)를 React로 이식.
// 테리 1순위: "로그는 엄청 자세히 다 나와야 돼, 세세한 부분까지."
//  - text 로그(색상·시간·[태그]) + shot(단계별 스크린샷 캡처) 혼합
//  - 🪟 창보기 토글(ON=실제 크롬 창 관찰 / OFF=백그라운드+캡처 로그)
//  - 📄 복사 · 🔍 크게보기 모달 · 개별 캡처 확대 · 자동 하단 스크롤
import { useEffect, useRef, useState } from "react";
import type { UseLog, LogColor, LogEntry } from "../lib/useLog";

const COLORS: Record<LogColor, string> = {
  sys: "#c8a27a",
  info: "#e8dccb",
  progress: "#ffcf6b",
  success: "#7dd88f",
  warn: "#ffb84d",
  error: "#ff7a7a",
};

function ts(t: number) {
  return new Date(t).toLocaleTimeString("ko-KR", { hour12: false });
}

interface Props {
  log: UseLog;
  title?: string;
  /** 창보기 토글값. undefined면 토글 버튼 숨김 */
  showWindow?: boolean;
  onToggleWindow?: (v: boolean) => void;
}

export default function LogConsole({ log, title = "실시간 로그", showWindow, onToggleWindow }: Props) {
  const { entries, clear, copyText } = log;
  const bodyRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const [big, setBig] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    const el = big ? bigRef.current : bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll, big]);

  async function doCopy() {
    const ok = await copyText();
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // 바닥 근처면 자동스크롤 유지, 위로 올려 읽으면 멈춤
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  const renderEntry = (e: LogEntry) => {
    const time = <span style={{ color: "#6f5b45", marginRight: 8, flexShrink: 0 }}>{ts(e.t)}</span>;
    const tag = e.tag ? (
      <span style={{ color: "#c8a27a", background: "#3a2a1a", borderRadius: 5, padding: "0 6px", marginRight: 6, fontSize: 11, flexShrink: 0 }}>
        {e.tag}
      </span>
    ) : null;
    if (e.type === "shot") {
      return (
        <div key={e.id} style={{ display: "flex", alignItems: "flex-start", padding: "4px 0", gap: 2 }}>
          {time}
          {tag}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ color: "#c8a27a" }}>📸 {e.caption ?? "화면 캡처"}</span>
            {e.dataUrl && (
              <img
                src={e.dataUrl}
                alt={e.caption ?? "캡처"}
                onClick={() => setZoom(e.dataUrl!)}
                style={{ maxWidth: 260, width: "100%", borderRadius: 8, border: "1px solid #3a2a1a", cursor: "zoom-in" }}
              />
            )}
          </div>
        </div>
      );
    }
    return (
      <div key={e.id} style={{ display: "flex", alignItems: "flex-start", padding: "2px 0" }}>
        {time}
        {tag}
        <span style={{ color: COLORS[e.color], whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.msg}</span>
      </div>
    );
  };

  const Btn = ({ onClick, children, title: t, active }: { onClick: () => void; children: React.ReactNode; title?: string; active?: boolean }) => (
    <button
      className="moca-logbtn"
      onClick={onClick}
      title={t}
      style={{
        background: active ? "#c8a27a" : "#2a1d12",
        color: active ? "#16110d" : "#e8dccb",
        border: "1px solid #4a3524",
        borderRadius: 8,
        padding: "7px 11px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );

  const header = (inModal: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid #3a2a1a" }}>
      <b style={{ color: "#f4efe4", fontSize: 14, marginRight: "auto" }}>
        📜 {title} <span style={{ color: "#6f5b45", fontWeight: 600, fontSize: 12 }}>· {entries.length}줄</span>
      </b>
      {onToggleWindow !== undefined && (
        <Btn onClick={() => onToggleWindow(!showWindow)} active={showWindow} title="ON=실제 크롬 창으로 진행을 직접 봄 / OFF=백그라운드+캡처 로그">
          🪟 창보기 {showWindow ? "ON" : "OFF"}
        </Btn>
      )}
      <Btn onClick={doCopy} title="로그 텍스트 전체 복사">{copied ? "✅ 복사됨" : "📄 복사"}</Btn>
      {!inModal && <Btn onClick={() => setBig(true)} title="로그를 전체화면으로 크게 봄(캡처 포함)">🔍 크게보기</Btn>}
      <Btn onClick={clear} title="로그 지우기">🗑️</Btn>
      {inModal && <Btn onClick={() => setBig(false)} title="닫기">✕ 닫기</Btn>}
    </div>
  );

  const emptyState = (
    <div style={{ color: "#6f5b45", textAlign: "center", padding: 20, fontSize: 13, lineHeight: 1.6 }}>
      계정 선택 → 글 생성 → ▶ 시작하기<br />
      여기에 진행 로그가 <b style={{ color: "#c8a27a" }}>실시간·세세히</b> 떠요 (단계·계정·카페·캡처).
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1b130d", border: "1px solid #3a2a1a", borderRadius: 12, overflow: "hidden" }}>
      <style>{`.moca-logbtn:hover{filter:brightness(1.25)} .moca-logbtn:active{transform:scale(.94)}`}</style>
      {header(false)}
      <div
        ref={bodyRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: "auto", padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.55 }}
      >
        {entries.length === 0 ? emptyState : entries.map(renderEntry)}
      </div>

      {/* 🔍 크게보기 모달 */}
      {big && (
        <div
          onClick={() => setBig(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 1000, display: "flex", padding: "3vh 3vw" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ margin: "auto", width: "100%", maxWidth: 900, height: "94vh", display: "flex", flexDirection: "column", background: "#1b130d", border: "1px solid #4a3524", borderRadius: 14, overflow: "hidden" }}
          >
            {header(true)}
            <div
              ref={bigRef}
              onScroll={onScroll}
              style={{ flex: 1, overflowY: "auto", padding: "10px 16px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, lineHeight: 1.6 }}
            >
              {entries.length === 0 ? emptyState : entries.map(renderEntry)}
            </div>
          </div>
        </div>
      )}

      {/* 개별 캡처 확대 */}
      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 1100, display: "flex", padding: "4vh 4vw", cursor: "zoom-out" }}>
          <img src={zoom} alt="캡처 확대" style={{ margin: "auto", maxWidth: "100%", maxHeight: "92vh", borderRadius: 10, border: "1px solid #4a3524" }} />
        </div>
      )}
    </div>
  );
}
