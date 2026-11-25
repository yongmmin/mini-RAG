// 벡터 검색: 질문 벡터와 조각 벡터가 가리키는 방향이 얼마나 같은지(cosine similarity)로 순위를 매긴다.
// 데이터 흐름: 질문 벡터 → (조각 벡터마다 cosine) → 점수 내림차순 → 상위 topK. (순수 함수: 파일·네트워크 없음)
import type { IndexedChunk, SearchResult } from "../types.ts";

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

// 질문 벡터와 모든 조각을 비교해 점수를 매기고, 높은 순으로 topK개만 남긴다.
export function rankByVector(queryVector: number[], chunks: IndexedChunk[], topK: number): SearchResult[] {
  return chunks
    .map((chunk) => ({ score: cosine(queryVector, chunk.embedding), chunk }))
    .sort((a, b) => b.score - a.score) // 내림차순: 가장 가까운 조각이 맨 앞
    .slice(0, topK);
}
