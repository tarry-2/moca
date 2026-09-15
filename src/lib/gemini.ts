// 🤖 Gemini 텍스트 생성 — 프론트에서 직접 호출(봇 불필요). 관리자가 API 키 입력(localStorage).
// 모델 순서(확정): 2.5-flash 우선 → MAX_TOKENS면 다음 모델 fallback. 2.5는 thinkingBudget:0.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];

// 🔑 키 여러 개 지원: 위 키부터 모델 순서대로 쓰다가 그 키의 모든 모델이 사용량 소진(429)되면 다음 키로 자동 전환.
export function getGeminiKeys(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem("moca_gemini_keys") || "[]");
    if (Array.isArray(arr) && arr.length) return arr.map((s: any) => String(s).trim()).filter(Boolean);
  } catch { /* fall through */ }
  const single = (localStorage.getItem("moca_gemini_key") || "").trim();
  return single ? [single] : [];
}
export function setGeminiKeys(keys: string[]): void {
  const clean = keys.map((k) => k.trim()).filter(Boolean);
  localStorage.setItem("moca_gemini_keys", JSON.stringify(clean));
  localStorage.setItem("moca_gemini_key", clean[0] || ""); // 하위호환(단일 키 경로)
}
// 하위호환 단일 키 API (첫 번째 키)
export function getGeminiKey(): string { return getGeminiKeys()[0] || ""; }
export function setGeminiKey(k: string): void { setGeminiKeys(k.trim() ? [k.trim()] : []); }

export async function generateText(prompt: string, onLog?: (m: string) => void): Promise<string> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("Gemini API 키가 없어요 (글쓰기 상단에서 입력해 주세요)");
  let lastErr = "";
  for (let ki = 0; ki < keys.length; ki++) {
    const key = keys[ki];
    const tag = keys.length > 1 ? `[키 ${ki + 1}/${keys.length}] ` : "";
    for (const model of MODELS) {
      try {
        const generationConfig: any = { maxOutputTokens: 8192, temperature: 0.9 };
        if (model.startsWith("gemini-2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
        onLog?.(`${tag}AI 요청: ${model}`);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
        });
        if (r.status === 429) { // 사용량 소진(rate/quota) — 이 모델 건너뛰고, 다 소진되면 아래에서 다음 키로
          lastErr = `${tag}${model} 사용량 소진(429)`;
          onLog?.(`${tag}${model} 사용량 소진(429) → 다음 모델`);
          continue;
        }
        if (!r.ok) {
          lastErr = `${tag}${model} HTTP ${r.status}`;
          onLog?.(`${tag}${model} 실패(${r.status}) → 다음 모델`);
          continue;
        }
        const j = await r.json();
        const cand = j?.candidates?.[0];
        const text: string = (cand?.content?.parts || []).map((p: any) => p.text || "").join("");
        if (text && cand?.finishReason === "MAX_TOKENS") {
          onLog?.(`${tag}${model} 응답 잘림(MAX_TOKENS) → 다음 모델`);
          continue;
        }
        if (text) { onLog?.(`${tag}AI 생성 완료 (${model}, ${text.length}자)`); return text; }
        lastErr = `${tag}${model} 빈 응답`;
      } catch (e: any) {
        lastErr = `${tag}${model}: ${e?.message || e}`;
        onLog?.(`${tag}${model} 오류 → 다음 모델`);
      }
    }
    // 이 키의 모든 모델 소진/실패 → 다음 키로
    if (ki < keys.length - 1) onLog?.(`${tag}전체 모델 소진 → 다음 키(${ki + 2}/${keys.length})로 전환`);
  }
  throw new Error("AI 글 생성 실패(모든 키·모델): " + lastErr);
}

// 카페 글: 제목 + 본문(body) + FAQ(질문형식)를 분리 생성(JSON).
//  ★검색순위(AEO) 양식: 도입부 핵심요약 → 본문(번호목록·항목:값) → 맨 끝 FAQ(자주 묻는 질문).
//  ★이미지는 body(본문) 안에서 끝나야 함 → FAQ는 body와 분리해 이미지 뒤(질문 아래)로 안 내려가게.
// lengthChars: 본문 목표 글자수(대략, FAQ 제외). 기본 1000.
const YEAR = new Date().getFullYear();
export interface CafePost { title: string; body: string; faq: string; hashtags: string; imagePrompts: string[]; content: string }

export async function generateCafePost(keyword: string, cafeName: string, boardName: string, lengthChars = 1000, onLog?: (m: string) => void): Promise<CafePost> {
  const lo = Math.max(200, Math.round(lengthChars * 0.8));
  const hi = Math.round(lengthChars * 1.2);
  const prompt = `너는 네이버 카페 '${cafeName}'의 '${boardName}' 게시판에 자연스럽게 글을 쓰는 실제 회원이야.
주제(키워드): "${keyword}"

[글 작성 규칙 — 네이버 검색·AI 노출(AEO)에 유리하게, 반드시 지킬 것]
1) 제목 — ★핵심 키워드 "${keyword}"를 반드시 포함하되(검색 노출), 아래 [네이버 홈판/인기글 제목 공식] 중 1~2개를 자연스럽게 섞어 클릭을 유도할 것. 년도 넣으면 올해 ${YEAR}년만. 25자 안팎.
   [네이버 홈판/인기글 제목 공식 — 실제 노출 글 분석]
   ① 따옴표 인용: 핵심 표현을 '작은따옴표'로 (예: '이거 진짜였네')
   ② 감정·감탄: "정말 미치겠다", "이건 좀 너무했네요" 같은 생생한 반응(과한 낚시·허위 금지)
   ③ 숫자 충격/구체: 가격·개수·퍼센트를 구체적으로 (예: 2억→6천, 3가지)
   ④ 궁금증+말줄임(…): 결정적 정보를 끝에서 살짝 자르기 (예: "…이유는 따로 있었어요")
   ⑤ 질문형: "…알고 계셨나요?", "왜 …일까요?"
   과장·허위·클릭베이트(내용과 다른 낚시)는 금지 — 본문에 실제로 있는 내용으로만 후킹.
2) ★★네이버 검색 상위노출 핵심: 핵심 키워드 "${keyword}"를 제목에 1회 + 본문에 자연스럽게 **정확히 5~6회** 반복(억지스럽지 않게 문맥에 녹여서). 너무 많거나 적으면 안 됨.
3) 본문(body) 맨 처음: 인사말·서론 없이 "핵심 요약" 2~3문장부터(질문의 답을 먼저).
4) 본문 중간(30~70% 지점)에 번호 목록(① ② ③ 최소 3개) 또는 "항목: 값"(예: 가격: 1만원) 실용정보 블록을 최소 1개.
5) 각 소제목 아래 첫 문장은 결론부터(두괄식). 광고 티 없이 실제 경험담 톤(반말 아님).
6) 본문(body)은 목표 약 ${lengthChars}자(${lo}~${hi}자 범위 준수, ${hi}자를 크게 넘기지 말 것). 단, 글자수 맞추려고 문장을 중간에 끊지 말고 반드시 자연스럽게 완결할 것. 문단은 빈 줄로 구분, 이모지 적당히. ★본문은 여기서 완결(질문 없이 마무리 인사로 끝).
7) FAQ(faq): 본문과 별개로, "자주 묻는 질문" Q&A 4개. Q는 사람들이 실제 검색할 질문, A는 핵심부터 1~2문장.
   형식: "자주 묻는 질문\nQ1. ...\nA1. ...\nQ2. ...\nA2. ...\nQ3. ...\nA3. ...\nQ4. ...\nA4. ..."
8) hashtags: 핵심 키워드 "${keyword}" 포함, 관련 검색어 기반 해시태그 5~8개. 형식: "#키워드1 #키워드2 #키워드3 ..."
9) imagePrompts: 이 글에 어울리는 이미지 생성용 프롬프트 5개. ★반드시 영어로만(한글 절대 금지 — 이미지 AI가 한글을 못 받고 깨짐). 사람·글자 없이 사물/음식/풍경 위주. 각 프롬프트 끝에 "no text, no letters, no people" 포함. 예: "fresh fish neatly arranged on ice, bright natural lighting, food photography, no text, no letters, no people"

★★본문·FAQ에 마크다운 기호 절대 쓰지 말 것: ## 제목, **굵게**, * 목록 금지. 소제목은 그냥 텍스트로(이모지 붙여도 됨), 문단은 빈 줄로 구분.

반드시 아래 JSON 형식으로만 답해(다른 말·마크다운 금지):
{"title":"제목(키워드 포함)","body":"본문(키워드 5~6회, 마크다운 기호 없이, 질문 없이 마무리)","faq":"자주 묻는 질문\\nQ1. ...\\nA1. ...","hashtags":"#${keyword.replace(/\s/g, "")} #관련어1 #관련어2","imagePrompts":["english image prompt 1, no text, no people","english image prompt 2, no text, no people"]}`;
  let raw = await generateText(prompt, onLog);
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim(); // 코드펜스 제거(파싱 실패 방지)
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (j.title && j.body) {
        const title = String(j.title);
        const body = String(j.body).trim();
        const faq = String(j.faq || "").trim();
        const hashtags = String(j.hashtags || "").trim();
        // 이미지 프롬프트(영어) — Flow는 한글 못 받아 깨짐. 영어만 통과.
        const imagePrompts = Array.isArray(j.imagePrompts)
          ? j.imagePrompts.map((s: any) => String(s)).filter((s: string) => s.trim() && !/[가-힣]/.test(s))
          : [];
        // 키워드 반복 횟수 검증 로그(제목+본문)
        const kwCount = (title + body).split(keyword).length - 1;
        onLog?.(`키워드 "${keyword}" ${kwCount}회 포함 (목표 5~6회), 이미지 프롬프트(영문) ${imagePrompts.length}개`);
        const content = [body, faq, hashtags].filter(s => s && s.trim()).join("\n\n");
        return { title, body, faq, hashtags, imagePrompts, content };
      }
    }
  } catch { /* fallback */ }
  // JSON 파싱 실패 → 첫 줄 제목, 나머지 본문(FAQ 없음)
  const lines = raw.trim().split("\n").filter(Boolean);
  const title = (lines[0] || keyword).replace(/^#+\s*/, "").slice(0, 60);
  const body = lines.slice(1).join("\n") || raw;
  return { title, body, faq: "", hashtags: "", imagePrompts: [], content: body };
}
