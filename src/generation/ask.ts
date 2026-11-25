// 답 생성: 질문 → search()로 관련 조각 찾기 → prompt.ts로 messages 만들기 → chat()으로 LLM에 보내기 → 답 문자열.
// 데이터 흐름: 질문 → SearchResult[] → messages(system, user) → POST /v1/chat/completions → 답 문자열.
import { TOP_K } from "../config.ts";
import { ChatError } from "../errors.ts";
import { chat } from "../llm.ts";
import { search } from "../retrieval/search.ts";
import type { SearchResult } from "../types.ts";
import { buildMessages } from "./prompt.ts";

// CLI와 Phase 7(eval)이 재사용하는 진입점. process.exit 하지 않고 에러는 throw 한다.
export async function ask(
  question: string,
  { topK = TOP_K }: { topK?: number } = {},
): Promise<{ results: SearchResult[]; answer: string }> {
  const results = await search(question, { topK }); // 1단계 검색: 에러는 그대로 위로 (IndexError 또는 embedding 에러)

  // 2단계 생성: 에러를 ChatError로 감싸 "생성 단계에서 났다"는 표시를 남긴다 (원래 에러는 cause에).
  try {
    return { results, answer: await chat(buildMessages(question, results)) };
  } catch (err) {
    throw new ChatError("답 생성 실패", { cause: err });
  }
}
