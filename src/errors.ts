// 에러 한 곳: 단계별 에러 종류(IndexError, ChatError)와 에러 → "원인 + 해결 명령" 안내 문장.
// 에러를 던지는 쪽(store, generation)과 안내를 출력하는 쪽(cli)이 모두 여기서 가져온다.
import { APIConnectionError } from "openai";
import { CHAT_MODEL, EMBED_MODEL } from "./config.ts";

// 색인 문제(파일 없음/모델 불일치) 전용 에러. Ollama 에러와 구분해 메시지를 그대로 보여주기 위해 따로 둔다.
export class IndexError extends Error {}

// 생성 단계(LLM 호출)에서 난 에러. 검색 단계 에러(embedding 모델)와 구분해야 안내에 맞는 모델 이름을 보여줄 수 있다.
export class ChatError extends Error {}

// Ollama 에러 → "원인 + 해결 명령" 문장 (PLAN §6.5). 네트워크 없이 테스트할 수 있게 순수 함수로 둔다.
// model: 요청에 쓴 모델. 기본은 embedding 모델, 답 생성 단계에서는 CHAT_MODEL을 넘긴다.
export function explainError(err: unknown, model = EMBED_MODEL): string {
  const cause = (err as { cause?: { code?: string } })?.cause;
  if (err instanceof APIConnectionError || cause?.code === "ECONNREFUSED") {
    return `Ollama에 연결할 수 없다 (서버가 꺼져 있음). 실행: ollama serve`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if ((err as { status?: number })?.status === 404 || /not found/i.test(message)) {
    return `모델 '${model}'이 없다. 설치: ollama pull ${model}`;
  }
  return `모델 '${model}' 요청 실패: ${message}`;
}

// 에러가 난 단계에 맞는 안내: 색인 문제 → 메시지 그대로 / 생성 단계 → CHAT_MODEL 기준 / 그 외(검색 단계) → embedding 모델 기준.
// ask와 eval이 같은 안내를 쓴다.
export function describeError(err: unknown): string {
  if (err instanceof IndexError) return err.message;
  if (err instanceof ChatError) return explainError(err.cause, CHAT_MODEL);
  return explainError(err);
}
