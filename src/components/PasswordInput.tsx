// 👁️ 비밀번호 입력 (미리보기 토글) — 모든 비번/키 칸에 공용 사용.
import { useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

export default function PasswordInput({ value, onChange, placeholder, onEnter, style, autoFocus }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", flex: style?.flex as any, width: style?.width }}>
      <input
        className="moca-in"
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 40px 10px 12px",
          fontSize: 14,
          borderRadius: 8,
          border: "1px solid var(--m-line2)",
          background: "var(--m-input)",
          color: "var(--m-text)",
          ...style,
          paddingRight: 40,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        title={show ? "숨기기" : "미리보기"}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          padding: 4,
          lineHeight: 1,
          opacity: 0.75,
        }}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
