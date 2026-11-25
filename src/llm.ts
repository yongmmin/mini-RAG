// Ollama 클라이언트: embed()와 chat() 두 함수로만 모델을 부른다. 모델 이름·주소는 config.ts에 있다.
// 확장 자리: 다른 모델 서버(OpenAI, vLLM 등)로 바꿀 때 이 파일만 고친다.
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CHAT_MODEL, EMBED_MODEL, OLLAMA_URL } from "./config.ts";

// Ollama가 OpenAI와 같은 모양의 API(/v1)를 제공하므로 openai SDK를 그대로 쓴다. 요청은 OpenAI가 아니라 로컬 Ollama로 간다.
export const llm = new OpenAI({
  baseURL: `${OLLAMA_URL}/v1`,
  // Ollama는 키를 검사하지 않는다. SDK가 키 없이는 생성되지 않아서 아무 문자열이나 넣어 둔다.
  apiKey: "ollama",
});

// 문장 여러 개 → 숫자 배열(벡터) 여러 개. ingest(문서 조각)와 search(질문)가 같은 모델로 바꿔야 비교할 수 있다.
export async function embed(texts: string[]): Promise<number[][]> {
  // 문자열 배열을 HTTP POST /v1/embeddings 한 번으로 보낸다. 응답: { data: [{ index, embedding: number[] }] }
  const response = await llm.embeddings.create({ model: EMBED_MODEL, input: texts });
  // index = 입력 배열에서의 위치. 응답 순서를 믿지 않고 index로 정렬해 texts[i] ↔ 벡터[i]를 맞춘다.
  return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

// messages → 답 문자열. HTTP POST /v1/chat/completions 한 번.
export async function chat(messages: ChatCompletionMessageParam[]): Promise<string> {
  const response = await llm.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0, // 무작위성 없이 가장 확률 높은 답 → 같은 질문엔 같은 답 (비교·관찰하기 쉽게)
    messages,
  });
  // 응답: { choices: [{ message: { role: "assistant", content } }] }. 첫 번째 답만 쓴다.
  return response.choices[0]?.message.content?.trim() ?? "";
}
