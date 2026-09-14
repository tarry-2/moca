// 📜 MOCA 로그 상태 훅 — 골든시드 twLogArr 방식을 React로 이식.
// 로그는 "엄청 자세히 다" 나와야 한다(테리 원칙): 단계·계정·카페·성공/실패·사유까지.
// text 로그 + shot(단계별 스크린샷 캡처) 혼합. 창보기 OFF여도 shot으로 진행을 눈으로 본다.
import { useCallback, useRef, useState } from "react";

export type LogColor = "sys" | "info" | "progress" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  t: number; // epoch ms
  type: "text" | "shot";
  msg?: string; // type=text
  caption?: string; // type=shot 캡션
  dataUrl?: string; // type=shot 이미지(data:image/jpeg;base64,...)
  color: LogColor;
  tag?: string; // [계정] [카페] 등 구분 태그
}

export interface UseLog {
  entries: LogEntry[];
  push: (msg: string, color?: LogColor, tag?: string) => void;
  shot: (caption: string, dataUrl: string, tag?: string) => void;
  clear: () => void;
  copyText: () => Promise<boolean>;
}

const MAX = 2000; // 너무 길면 앞부분 버림(메모리 보호)

export function useLog(): UseLog {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seq = useRef(0);

  const push = useCallback((msg: string, color: LogColor = "info", tag?: string) => {
    setEntries((prev) => {
      const next = [...prev, { id: ++seq.current, t: Date.now(), type: "text" as const, msg, color, tag }];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }, []);

  const shot = useCallback((caption: string, dataUrl: string, tag?: string) => {
    setEntries((prev) => {
      const next = [...prev, { id: ++seq.current, t: Date.now(), type: "shot" as const, caption, dataUrl, color: "sys" as const, tag }];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const copyText = useCallback(async () => {
    const text = entries
      .map((e) => {
        const ts = new Date(e.t).toLocaleTimeString("ko-KR", { hour12: false });
        const tag = e.tag ? `[${e.tag}] ` : "";
        return e.type === "shot" ? `${ts}  ${tag}📸 ${e.caption ?? "캡처"}` : `${ts}  ${tag}${e.msg ?? ""}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [entries]);

  return { entries, push, shot, clear, copyText };
}
