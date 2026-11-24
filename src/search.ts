// 검색: 질문을 색인과 같은 embedding 모델로 벡터로 바꾸고, index.json의 모든 조각과 cosine similarity를 비교해 가까운 순으로 돌려준다.
// 데이터 흐름: 질문 문자열 → embed() → 질문 벡터 → (조각 벡터마다 cosine) → 점수 내림차순 → 상위 topK.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { explainError, type IndexFile, type IndexedChunk } from "./ingest.ts";
import { EMBED_MODEL, embed } from "./llm.ts";

// ingest.ts와 같은 방식: 이 파일 기준 한 단계 위 = 프로젝트 루트의 index.json.
const INDEX_PATH = join(import.meta.dirname, "..", "index.json");

export type SearchResult = { score: number; chunk: IndexedChunk };

// 색인 문제(파일 없음/모델 불일치) 전용 에러. Ollama 에러와 구분해 메시지를 그대로 보여주기 위해 따로 둔다.
export class IndexError extends Error {}

// 두 벡터가 가리키는 "방향"이 얼마나 같은지: 같은 방향 1, 직각 0, 정반대 -1.
export function cosine(a: number[], b: number[]): number {
  let dot = 0; // 같은 자리끼리 곱해 더한 값 = 두 벡터가 겹치는 정도
  let normA = 0; // a의 각 성분 제곱합 → 나중에 √ 하면 a의 길이
  let normB = 0; // b의 각 성분 제곱합 → 나중에 √ 하면 b의 길이
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // 길이로 나눠 "얼마나 긴가"는 지우고 "어느 쪽을 가리키나"만 남긴다. (긴 문서라고 점수가 커지지 않게)
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 질문 벡터와 모든 조각을 비교해 점수를 매기고, 높은 순으로 topK개만 남긴다. (순수 함수: 파일·네트워크 없음)
export function rankChunks(queryVector: number[], chunks: IndexedChunk[], topK: number): SearchResult[] {
  return chunks
    .map((chunk) => ({ score: cosine(queryVector, chunk.embedding), chunk }))
    .sort((a, b) => b.score - a.score) // 내림차순: 가장 가까운 조각이 맨 앞
    .slice(0, topK);
}

// 안전장치: 다른 모델로 만든 벡터끼리는 좌표계가 달라 비교 자체가 의미 없다. 색인 모델 ≠ 현재 모델이면 멈춘다.
export function checkEmbedModel(indexModel: string, currentModel: string): void {
  if (indexModel !== currentModel) {
    throw new IndexError(
      `index.json은 '${indexModel}'로 만들었는데 현재 EMBED_MODEL은 '${currentModel}'이다. 재색인 필요: npm run ingest`,
    );
  }
}

// index.json을 읽고 모델이 맞는지 확인한다. 문제가 있으면 throw (종료는 호출한 쪽이 결정한다).
export function loadIndex(path = INDEX_PATH): IndexFile {
  if (!existsSync(path)) {
    throw new IndexError(`index.json이 없다. 먼저 색인을 만든다: npm run ingest`);
  }
  const index = JSON.parse(readFileSync(path, "utf8")) as IndexFile;
  checkEmbedModel(index.embedModel, EMBED_MODEL);
  return index;
}

// Phase 5(ask.ts)가 재사용하는 진입점. process.exit 하지 않고 에러는 throw 한다.
export async function search(question: string, topK = 3): Promise<SearchResult[]> {
  // 모델 검사를 embedding 호출 "전에" 한다: 어차피 비교할 수 없는 질문 벡터를 Ollama에 요청하지 않도록.
  const index = loadIndex();
  const [queryVector] = await embed([question]); // 조각과 같은 모델로 질문도 벡터로 바꾼다
  return rankChunks(queryVector, index.chunks, topK);
}

// 결과 한 건 = 순위, 점수, 출처 > 소제목, 본문 앞부분 한 줄.
function printResults(results: SearchResult[]): void {
  results.forEach(({ score, chunk }, i) => {
    const body = chunk.text.slice(chunk.text.indexOf("\n") + 1); // 머리말 첫 줄을 뗀 본문 (ingest의 printChunks와 같은 방식)
    const preview = body.replace(/\s+/g, " ").slice(0, 60); // 줄바꿈을 공백으로 바꿔 한 줄에 보이게
    console.log(`${i + 1}. ${score.toFixed(3)}  ${chunk.source} > ${chunk.heading}`);
    console.log(`   ${preview}…`);
  });
  console.log(`\n질문 embedding 모델: ${EMBED_MODEL}`);
}

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error(`사용법: npm run search "질문"`);
    process.exit(1);
  }

  try {
    printResults(await search(question));
  } catch (err) {
    // 색인 문제는 메시지 그대로, Ollama 문제는 explainError로 원인+해결 명령을 보여준다.
    console.error(err instanceof IndexError ? err.message : explainError(err));
    process.exit(1);
  }
}

// 직접 실행(npm run search)할 때만 main을 돈다. 테스트나 ask.ts가 import할 때는 돌지 않는다.
if (import.meta.filename === process.argv[1]) await main();
