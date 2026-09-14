// 🤖 Gemini 텍스트 생성 — 프론트에서 직접 호출(봇 불필요). 관리자가 API 키 입력(localStorage).
// 모델 순서(확정): 2.5-flash 우선 → MAX_TOKENS면 다음 모델 fallback. 2.5는 thinkingBudget:0.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];

export function getGeminiKey(): string {
  return localStorage.getItem("moca_gemini_key") || "";
}
export function setGeminiKey(k: string): void {
  localStorage.setItem("moca_gemini_key", k.trim());
}

export async function generateText(prompt: string, onLog?: (m: string) => void): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error("Gemini API 키가 없어요 (글쓰기 상단에서 입력해 주세요)");
  let lastErr = "";
  for (const model of MODELS) {
    try {
      const generationConfig: any = { maxOutputTokens: 8192, temperature: 0.9 };
      if (model.startsWith("gemini-2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      onLog?.(`AI 요청: ${model}`);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
      });
      if (!r.ok) {
        lastErr = `${model} HTTP ${r.status}`;
        onLog?.(`${model} 실패(${r.status}) → 다음 모델`);
        continue;
      }
      const j = await r.json();
      const cand = j?.candidates?.[0];
      const text: string = (cand?.content?.parts || []).map((p: any) => p.text || "").join("");
      if (text && cand?.finishReason === "MAX_TOKENS") {
        onLog?.(`${model} 응답 잘림(MAX_TOKENS) → 다음 모델`);
        continue;
      }
      if (text) { onLog?.(`AI 생성 완료 (${model}, ${text.length}자)`); return text; }
      lastErr = `${model} 빈 응답`;
    } catch (e: any) {
      lastErr = `${model}: ${e?.message || e}`;
      onLog?.(`${model} 오류 → 다음 모델`);
    }
  }
  throw new Error("AI 글 생성 실패(모든 모델): " + lastErr);
}

// 카페 글: 제목 + 본문을 한 번에 생성(JSON). 실패 시 통짜 텍스트 fallback.
// lengthChars: 본문 목표 글자수(대략). 기본 1000.
export async function generateCafePost(keyword: string, cafeName: string, boardName: string, lengthChars = 1000, onLog?: (m: string) => void): Promise<{ title: string; content: string }> {
  const lo = Math.max(200, Math.round(lengthChars * 0.8));
  const hi = Math.round(lengthChars * 1.2);
  const prompt = `너는 네이버 카페 '${cafeName}'의 '${boardName}' 게시판에 자연스럽게 글을 쓰는 실제 회원이야.
주제(키워드): "${keyword}"

조건:
- 광고/홍보 티가 나지 않게, 실제 경험담처럼 자연스럽고 친근한 말투(반말 아님, 카페 회원 톤)
- 제목은 클릭하고 싶게, 낚시 아닌 진짜 정보형
- 본문은 ${lo}~${hi}자(목표 약 ${lengthChars}자), 문단 구분(빈 줄), 이모지 적당히
- 카페 규정을 존중하는 건전한 내용

반드시 아래 JSON 형식으로만 답해(다른 말 금지):
{"title":"제목","content":"본문"}`;
  const raw = await generateText(prompt, onLog);
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (j.title && j.content) return { title: String(j.title), content: String(j.content) };
    }
  } catch { /* fallback */ }
  // JSON 파싱 실패 → 첫 줄 제목, 나머지 본문
  const lines = raw.trim().split("\n").filter(Boolean);
  return { title: (lines[0] || keyword).replace(/^#+\s*/, "").slice(0, 60), content: lines.slice(1).join("\n") || raw };
}
