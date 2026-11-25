// 프롬프트 만들기: 검색된 조각에 [1][2][3] 번호를 붙여 [자료]로 만들고, system 규칙 + [자료] + 질문을 messages로 묶는다.
// 데이터 흐름: SearchResult[] → context 문자열 → messages(system, user). 순수 함수만 둔다 (네트워크 없음).
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { REFUSAL_PHRASE } from "../config.ts";
import type { SearchResult } from "../types.ts";

// system 메시지 = 모델이 지켜야 할 규칙. 답의 근거를 [자료]로 묶어 두어 환각(지어내기)을 줄이는 것이 목적.
// Phase 6에서 규칙을 빼 보며 비교하고, Phase 7은 거절 문구 "문서에서 찾을 수 없습니다"(config.ts REFUSAL_PHRASE)가 나왔는지 본다.
// 규칙 안에 실제 문서 내용을 예시로 쓰지 않는다 — 모델이 자료 대신 예시를 베껴 답할 수 있다.
export const SYSTEM_PROMPT = `너는 문서 기반 질의응답 도우미다. 다음 규칙을 반드시 지켜라.
1. 주어진 [자료]만 근거로 답한다. 자료에 없는 지식이나 추측을 더하지 않는다.
2. 문장마다 끝에 근거가 된 자료 번호 [n]을 붙인다.
3. [자료]에 답이 없으면 다른 말 없이 "${REFUSAL_PHRASE}"라고만 답한다.`;

// 검색 결과 → "[1] 문서 제목 > 소제목\n본문" 블록들을 빈 줄로 이은 문자열. 번호 = 답변의 [n]이 가리킬 대상.
export function buildContext(results: SearchResult[]): string {
  return results.map(({ chunk }, i) => `[${i + 1}] ${chunk.text}`).join("\n\n");
}

// LLM에 보낼 messages. 순수 함수 (네트워크 없음) → 무엇이 모델에 들어가는지 테스트로 확인할 수 있다.
export function buildMessages(question: string, results: SearchResult[]): ChatCompletionMessageParam[] {
  return [
    // system: 규칙만. 대화 내내 지켜야 할 "역할과 제약"을 담는 자리.
    { role: "system", content: SYSTEM_PROMPT },
    // user: 이번 질문에 쓸 [자료](번호 붙은 조각) + 질문 원문. 규칙 1·2가 말하는 [자료]와 [n]이 바로 이것.
    { role: "user", content: `[자료]\n${buildContext(results)}\n\n[질문]\n${question}` },
  ];
}
