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

// 카페 글: 제목 + 본문(body) + FAQ(질문형식)를 분리 생성(JSON).
//  ★검색순위(AEO) 양식: 도입부 핵심요약 → 본문(번호목록·항목:값) → 맨 끝 FAQ(자주 묻는 질문).
//  ★이미지는 body(본문) 안에서 끝나야 함 → FAQ는 body와 분리해 이미지 뒤(질문 아래)로 안 내려가게.
// lengthChars: 본문 목표 글자수(대략, FAQ 제외). 기본 1000.
const YEAR = new Date().getFullYear();
export interface CafePost { title: string; body: string; faq: string; content: string }

export async function generateCafePost(keyword: string, cafeName: string, boardName: string, lengthChars = 1000, onLog?: (m: string) => void): Promise<CafePost> {
  const lo = Math.max(200, Math.round(lengthChars * 0.8));
  const hi = Math.round(lengthChars * 1.2);
  const prompt = `너는 네이버 카페 '${cafeName}'의 '${boardName}' 게시판에 자연스럽게 글을 쓰는 실제 회원이야.
주제(키워드): "${keyword}"

[글 작성 규칙 — 네이버 검색·AI 노출(AEO)에 유리하게, 반드시 지킬 것]
1) 제목: 사람들이 검색창에 실제로 칠 형태(무엇/어떻게/추천/방법/후기). 낚시 감탄사 금지. 년도 넣으면 올해 ${YEAR}년만.
2) 본문(body) 맨 처음: 인사말·서론 없이 "핵심 요약" 2~3문장부터(질문의 답을 먼저).
3) 본문 중간(30~70% 지점)에 번호 목록(① ② ③ 최소 3개) 또는 "항목: 값"(예: 가격: 1만원) 실용정보 블록을 최소 1개.
4) 각 소제목 아래 첫 문장은 결론부터(두괄식). 광고 티 없이 실제 경험담 톤(반말 아님).
5) 본문(body)은 ${lo}~${hi}자(목표 약 ${lengthChars}자), 문단은 빈 줄로 구분, 이모지 적당히. ★본문은 여기서 완결(질문 없이 마무리 인사로 끝).
6) FAQ(faq): 본문과 별개로, "자주 묻는 질문" Q&A 4개. Q는 사람들이 실제 검색할 질문, A는 핵심부터 1~2문장.
   형식: "자주 묻는 질문\nQ1. ...\nA1. ...\nQ2. ...\nA2. ...\nQ3. ...\nA3. ...\nQ4. ...\nA4. ..."

반드시 아래 JSON 형식으로만 답해(다른 말·마크다운 금지):
{"title":"제목","body":"본문(질문 없이 마무리)","faq":"자주 묻는 질문\\nQ1. ...\\nA1. ..."}`;
  const raw = await generateText(prompt, onLog);
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (j.title && j.body) {
        const title = String(j.title);
        const body = String(j.body).trim();
        const faq = String(j.faq || "").trim();
        return { title, body, faq, content: faq ? `${body}\n\n${faq}` : body };
      }
    }
  } catch { /* fallback */ }
  // JSON 파싱 실패 → 첫 줄 제목, 나머지 본문(FAQ 없음)
  const lines = raw.trim().split("\n").filter(Boolean);
  const title = (lines[0] || keyword).replace(/^#+\s*/, "").slice(0, 60);
  const body = lines.slice(1).join("\n") || raw;
  return { title, body, faq: "", content: body };
}
