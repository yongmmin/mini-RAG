// 검색 진입점: 질문 → 색인 읽기 → (필요하면) 질문 embedding → 고른 방식(mode)으로 순위 → 상위 topK.
// 방식은 vector(cosine, 기본) / keyword(BM25, embedding 없음) / hybrid(두 순위를 RRF로 합침) 셋이고, 아래 RANKERS 표에서 고른다.
// 확장 자리: reranker 같은 새 방식은 types.ts의 SearchMode에 이름을 더하고 RANKERS 표에 한 줄을 더한다 (search()는 그대로).
import { TOP_K } from "../config.ts";
import { embed } from "../llm.ts";
import { readIndex } from "../store/json-store.ts";
import type { IndexedChunk, SearchMode, SearchResult } from "../types.ts";
import { rankHybrid } from "./hybrid.ts";
import { rankByKeyword } from "./keyword.ts";
import { rankByVector } from "./vector.ts";

// 순위 함수가 받는 질문: 원문 text + 질문 벡터(needsVector인 방식에만 들어 있다).
type Query = { text: string; vector?: number[] };

// 방식 하나 = "질문 벡터가 필요한가" + 순위 함수. needsVector가 false면 search()가 Ollama를 부르지 않는다.
type Ranker = {
  needsVector: boolean;
  rank: (query: Query, chunks: IndexedChunk[], topK: number) => SearchResult[];
};

// 방식 이름 → 순위 함수 표. Record<SearchMode, …>라서 SearchMode에 이름을 더하고 여기를 빠뜨리면 tsc가 알려 준다.
// vector!: needsVector가 true인 방식에는 search()·eval이 항상 벡터를 넣어 준다.
export const RANKERS: Record<SearchMode, Ranker> = {
  vector: { needsVector: true, rank: (query, chunks, topK) => rankByVector(query.vector!, chunks, topK) },
  keyword: { needsVector: false, rank: (query, chunks, topK) => rankByKeyword(query.text, chunks, topK) },
  hybrid: { needsVector: true, rank: (query, chunks, topK) => rankHybrid(query.vector!, query.text, chunks, topK) },
};

// 표에 적힌 순서 그대로의 방식 목록 (사용법 안내, eval 표의 열 순서).
export const SEARCH_MODES = Object.keys(RANKERS) as SearchMode[];

// ask()와 CLI가 재사용하는 진입점. process.exit 하지 않고 에러는 throw 한다.
// mode 기본값은 vector: ask()처럼 방식을 넘기지 않는 호출은 Phase 7까지와 똑같이 동작한다.
export async function search(
  question: string,
  { topK = TOP_K, mode = "vector" }: { topK?: number; mode?: SearchMode } = {},
): Promise<SearchResult[]> {
  // 모델 검사를 embedding 호출 "전에" 한다: 어차피 비교할 수 없는 질문 벡터를 Ollama에 요청하지 않도록.
  const index = readIndex();
  const ranker = RANKERS[mode];
  // 키워드만 쓰면 Ollama를 부르지 않는다. 나머지는 조각과 같은 모델로 질문도 벡터로 바꾼다.
  const vector = ranker.needsVector ? (await embed([question]))[0] : undefined;
  return ranker.rank({ text: question, vector }, index.chunks, topK);
}
