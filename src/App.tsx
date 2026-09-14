// MOCA (Marketing On CAfe) — 네이버 카페 자동화 앱
// ⚠️ 퍼블리와 무관한 독립 앱. UI는 카페 전용으로 새로 만든다(퍼블리 UI 이식 금지).
// 지금은 스캐폴딩 골격. STEP1(글쓰기·발행)부터 로그인·대시보드·관리자 UI를 새로 구현.

export default function App() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 30%, #2a1d12 0%, #16110d 70%)",
        color: "#f5ede4",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        gap: 14,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 68 }}>☕</div>
      <h1 style={{ fontSize: 44, letterSpacing: 6, color: "#c8a27a", fontWeight: 800 }}>MOCA</h1>
      <p style={{ opacity: 0.85, fontSize: 15 }}>Marketing On CAfe · 네이버 카페 자동화</p>
      <p style={{ marginTop: 10, fontSize: 12, opacity: 0.45 }}>
        스캐폴딩 완료 — 카페 전용 UI 준비 중 (STEP1 글쓰기·발행)
      </p>
    </div>
  );
}
