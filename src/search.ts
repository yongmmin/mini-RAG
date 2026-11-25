// 검색: 질문을 색인과 같은 embedding 모델로 벡터로 바꾸고, index.json의 모든 조각과 cosine similarity를 비교해 가까운 순으로 돌려준다.
// 데이터 흐름: 질문 문자열 → embed() → 질문 벡터 → (조각 벡터마다 cosine) → 점수 내림차순 → 상위 topK.
// Phase 8: 방식(mode)을 고를 수 있다 — vector(위 흐름, 기본) / keyword(BM25, keyword.ts) / hybrid(두 순위를 RRF로 합침).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { explainError, type IndexFile, type IndexedChunk } from "./ingest.ts";
import { bm25Scores, tokenize } from "./keyword.ts";
import { EMBED_MODEL, embed } from "./llm.ts";

// ingest.ts와 같은 방식: 이 파일 기준 한 단계 위 = 프로젝트 루트의 index.json.
const INDEX_PATH = join(import.meta.dirname, "..", "index.json");

// score는 방식마다 단위가 다르다: vector = cosine(-1~1), keyword = BM25(0 이상, 상한 없음), hybrid = RRF(작은 양수).
export type SearchResult = { score: number; chunk: IndexedChunk };

export type SearchMode = "vector" | "keyword" | "hybrid";
const MODES: SearchMode[] = ["vector", "keyword", "hybrid"];

// hybrid가 합치기 전에 각 방식에서 가져오는 후보 수. 조각이 14개뿐이라 10이면 거의 전부를 본다.
const HYBRID_CANDIDATES = 10;

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

// 키워드 방식: 질문을 bigram으로 자르고 조각마다 BM25 점수를 매겨 높은 순으로 topK개. (순수 함수: embedding 호출 없음)
export function rankKeyword(question: string, chunks: IndexedChunk[], topK: number): SearchResult[] {
  const scores = bm25Scores(tokenize(question), chunks);
  return chunks
    .map((chunk, i) => ({ score: scores[i], chunk }))
    .filter((r) => r.score > 0) // 겹치는 토큰이 하나도 없는 조각은 "키워드로는 못 찾음" → 순위에 넣지 않는다
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// RRF(Reciprocal Rank Fusion): 여러 순위 목록을 "점수"가 아니라 "순위"로 합친다. cosine 0.7과 BM25 5.0은 단위가 달라 더할 수 없기 때문.
// 조각마다 점수 = Σ 1/(k + 순위), 순위는 1부터. 여러 목록에서 위쪽에 있을수록 커진다. 한 목록에만 있어도 그 몫만큼 남는다.
// k(기본 60)는 1위와 2위의 차이를 줄여, 한 방식의 1위가 혼자 결과를 결정하지 못하게 한다. (순수 함수)
export function rrf(rankings: SearchResult[][], k = 60): SearchResult[] {
  const fused = new Map<string, SearchResult>(); // 조각 id → 합친 결과
  for (const ranking of rankings) {
    ranking.forEach(({ chunk }, i) => {
      const entry = fused.get(chunk.id) ?? { score: 0, chunk };
      entry.score += 1 / (k + i + 1); // i는 0부터라 순위 = i + 1
      fused.set(chunk.id, entry);
    });
  }
  // 점수가 같으면 먼저 넣은 목록(rankings[0])에 먼저 나온 조각이 앞선다 (sort는 순서를 유지한다). 예: A 1위·B 2위 = B 1위·A 2위.
  return [...fused.values()].sort((a, b) => b.score - a.score);
}

// 하이브리드 방식: vector·keyword 각각 상위 후보를 뽑아 RRF로 합치고 topK개. 질문 벡터는 호출한 쪽이 한 번 만들어 넘긴다. (순수 함수)
export function rankHybrid(queryVector: number[], question: string, chunks: IndexedChunk[], topK: number): SearchResult[] {
  const vector = rankChunks(queryVector, chunks, HYBRID_CANDIDATES);
  const keyword = rankKeyword(question, chunks, HYBRID_CANDIDATES);
  return rrf([vector, keyword]).slice(0, topK);
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
// mode 기본값은 vector: ask.ts처럼 방식을 넘기지 않는 호출은 Phase 7까지와 똑같이 동작한다.
export async function search(question: string, topK = 3, mode: SearchMode = "vector"): Promise<SearchResult[]> {
  // 모델 검사를 embedding 호출 "전에" 한다: 어차피 비교할 수 없는 질문 벡터를 Ollama에 요청하지 않도록.
  const index = loadIndex();
  if (mode === "keyword") return rankKeyword(question, index.chunks, topK); // 키워드만 쓰면 Ollama를 부르지 않는다
  const [queryVector] = await embed([question]); // 조각과 같은 모델로 질문도 벡터로 바꾼다
  if (mode === "hybrid") return rankHybrid(queryVector, question, index.chunks, topK);
  return rankChunks(queryVector, index.chunks, topK);
}

// 결과 한 건 = 순위, 점수, 출처 > 소제목, 본문 앞부분 한 줄. 점수 단위가 방식마다 달라 맨 위에 방식을 적는다.
function printResults(results: SearchResult[], mode: SearchMode): void {
  console.log(`검색 방식: ${mode} (점수 = ${{ vector: "cosine", keyword: "BM25", hybrid: "RRF" }[mode]})`);
  if (results.length === 0) console.log("(결과 없음: 질문과 겹치는 토큰이 있는 조각이 없다)");
  results.forEach(({ score, chunk }, i) => {
    const body = chunk.text.slice(chunk.text.indexOf("\n") + 1); // 머리말 첫 줄을 뗀 본문 (ingest의 printChunks와 같은 방식)
    const preview = body.replace(/\s+/g, " ").slice(0, 60); // 줄바꿈을 공백으로 바꿔 한 줄에 보이게
    console.log(`${i + 1}. ${score.toFixed(mode === "hybrid" ? 4 : 3)}  ${chunk.source} > ${chunk.heading}`); // RRF는 값이 작아 넷째 자리까지
    console.log(`   ${preview}…`);
  });
  if (mode !== "keyword") console.log(`\n질문 embedding 모델: ${EMBED_MODEL}`);
}

async function main(): Promise<void> {
  const usage = `사용법: npm run search "질문"  또는  npm run search -- --mode ${MODES.join("|")} "질문"`;
  let mode: SearchMode;
  let question: string;
  try {
    // --mode 옵션과 나머지(질문)를 나눈다. 모르는 옵션이면 throw.
    const { values, positionals } = parseArgs({ options: { mode: { type: "string", default: "vector" } }, allowPositionals: true });
    mode = values.mode as SearchMode;
    question = positionals.join(" ").trim();
  } catch {
    console.error(usage);
    process.exit(1);
  }
  if (!question || !MODES.includes(mode)) {
    console.error(usage);
    process.exit(1);
  }

  try {
    printResults(await search(question, 3, mode), mode);
  } catch (err) {
    // 색인 문제는 메시지 그대로, Ollama 문제는 explainError로 원인+해결 명령을 보여준다.
    console.error(err instanceof IndexError ? err.message : explainError(err));
    process.exit(1);
  }
}

// 직접 실행(npm run search)할 때만 main을 돈다. 테스트나 ask.ts가 import할 때는 돌지 않는다.
if (import.meta.filename === process.argv[1]) await main();
