// Ollama 클라이언트 + 모델 설정. 모델 이름은 이 파일 한 곳에서만 정의한다.
import OpenAI from "openai";

// Ollama는 레포 안이 아니라 내 컴퓨터에서 따로 떠 있는 HTTP 서버다. 코드는 이 주소로 요청만 보낸다.
export const OLLAMA_URL = "http://localhost:11434";

// 환경 변수가 있으면 그것을, 없으면 기본 모델을 쓴다. (예: CHAT_MODEL=qwen3:4b npm run check)
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gemma3:4b";
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "bge-m3";

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
