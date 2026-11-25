// 하이브리드 검색: vector와 keyword 두 순위 목록을 RRF로 하나로 합친다. (순수 함수: 파일·네트워크 없음)
import { HYBRID_POOL, RRF_K } from "../config.ts";
import type { IndexedChunk, SearchResult } from "../types.ts";
import { rankByKeyword } from "./keyword.ts";
import { rankByVector } from "./vector.ts";

// RRF(Reciprocal Rank Fusion): 여러 순위 목록을 "점수"가 아니라 "순위"로 합친다. cosine 0.7과 BM25 5.0은 단위가 달라 더할 수 없기 때문.
// 조각마다 점수 = Σ 1/(k + 순위), 순위는 1부터. 여러 목록에서 위쪽에 있을수록 커진다. 한 목록에만 있어도 그 몫만큼 남는다.
// k(기본 RRF_K = 60)는 1위와 2위의 차이를 줄여, 한 방식의 1위가 혼자 결과를 결정하지 못하게 한다.
export function rrf(rankings: SearchResult[][], k = RRF_K): SearchResult[] {
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

// 하이브리드 방식: vector·keyword 각각 상위 HYBRID_POOL개 후보를 뽑아 RRF로 합치고 topK개. 질문 벡터는 호출한 쪽이 한 번 만들어 넘긴다.
export function rankHybrid(queryVector: number[], question: string, chunks: IndexedChunk[], topK: number): SearchResult[] {
  const vector = rankByVector(queryVector, chunks, HYBRID_POOL);
  const keyword = rankByKeyword(question, chunks, HYBRID_POOL);
  return rrf([vector, keyword]).slice(0, topK);
}
