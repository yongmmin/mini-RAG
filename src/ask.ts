// 답 생성: 질문 → search()로 관련 조각 찾기 → 조각에 [1][2][3] 번호를 붙여 [자료]로 만들기 → system 규칙 + [자료] + 질문을 LLM에 보내기.
// 데이터 흐름: 질문 → SearchResult[] → context 문자열 → messages(system, user) → POST /v1/chat/completions → 답 문자열.
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { explainError } from "./ingest.ts";
import { CHAT_MODEL, llm } from "./llm.ts";
import { IndexError, search, type SearchResult } from "./search.ts";

// system 메시지 = 모델이 지켜야 할 규칙. 답의 근거를 [자료]로 묶어 두어 환각(지어내기)을 줄이는 것이 목적.
// Phase 6에서 규칙을 빼 보며 비교하고, Phase 7은 거절 문구 "문서에서 찾을 수 없습니다"가 나왔는지 본다.
// 규칙 안에 실제 문서 내용을 예시로 쓰지 않는다 — 모델이 자료 대신 예시를 베껴 답할 수 있다.
export const SYSTEM_PROMPT = `너는 문서 기반 질의응답 도우미다. 다음 규칙을 반드시 지켜라.
1. 주어진 [자료]만 근거로 답한다. 자료에 없는 지식이나 추측을 더하지 않는다.
2. 문장마다 끝에 근거가 된 자료 번호 [n]을 붙인다.
3. [자료]에 답이 없으면 다른 말 없이 "문서에서 찾을 수 없습니다"라고만 답한다.`;

// 생성 단계(LLM 호출)에서 난 에러. 검색 단계 에러(embedding 모델)와 구분해야 안내에 맞는 모델 이름을 보여줄 수 있다.
class ChatError extends Error {}

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

// Phase 7(eval)이 재사용하는 진입점. process.exit 하지 않고 에러는 throw 한다.
export async function ask(question: string, topK = 3): Promise<{ results: SearchResult[]; answer: string }> {
  const results = await search(question, topK); // 1단계 검색: 에러는 그대로 위로 (IndexError 또는 embedding 에러)

  // 2단계 생성: 에러를 ChatError로 감싸 "생성 단계에서 났다"는 표시를 남긴다 (원래 에러는 cause에).
  try {
    const response = await llm.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0, // 무작위성 없이 가장 확률 높은 답 → 같은 질문엔 같은 답 (비교·관찰하기 쉽게)
      messages: buildMessages(question, results),
    });
    // 응답: { choices: [{ message: { role: "assistant", content } }] }. 첫 번째 답만 쓴다.
    return { results, answer: response.choices[0]?.message.content?.trim() ?? "" };
  } catch (err) {
    throw new ChatError("답 생성 실패", { cause: err });
  }
}

// 출력 순서: 검색된 조각(디버깅용: 무엇을 근거로 줬나) → 답변 → 출처(답의 [n]이 가리키는 조각).
function printAnswer(results: SearchResult[], answer: string): void {
  console.log("검색된 조각");
  results.forEach(({ score, chunk }, i) => {
    console.log(`${i + 1}. ${score.toFixed(3)}  ${chunk.source} > ${chunk.heading}`);
  });
  console.log("\n답변");
  console.log(answer);
  console.log("\n출처");
  results.forEach(({ chunk }, i) => console.log(`[${i + 1}] ${chunk.source} > ${chunk.heading}`));
}

// 에러가 난 단계에 맞는 안내: 색인 문제 → 메시지 그대로 / 생성 단계 → CHAT_MODEL 기준 / 그 외(검색 단계) → embedding 모델 기준.
function describeError(err: unknown): string {
  if (err instanceof IndexError) return err.message;
  if (err instanceof ChatError) return explainError(err.cause, CHAT_MODEL);
  return explainError(err);
}

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error(`사용법: npm run ask "질문"`);
    process.exit(1);
  }

  try {
    const { results, answer } = await ask(question);
    printAnswer(results, answer);
  } catch (err) {
    console.error(describeError(err));
    process.exit(1);
  }
}

// 직접 실행(npm run ask)할 때만 main을 돈다. 테스트나 Phase 7이 import할 때는 돌지 않는다.
if (import.meta.filename === process.argv[1]) await main();
