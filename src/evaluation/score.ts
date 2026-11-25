// 채점: 검색 결과가 기대한 출처를 맞혔나(isHit), 답이 거절 문구인가(isRefusal). 순수 함수만 둔다.
import { REFUSAL_PHRASE, TOP_K } from "../config.ts";
import type { SearchResult } from "../types.ts";

// 상위 k개 중 하나라도 기대 출처와 같고, (소제목을 적었다면) 소제목도 같으면 적중. k=1이면 hit@1, k=3이면 hit@3.
// 한 섹션이 여러 조각으로 나뉘어도(예: "관측 예약 방법") 조각 하나만 들어오면 적중으로 본다.
export function isHit(
  results: SearchResult[],
  expected: { expectedSource: string; expectedHeading?: string },
  k = TOP_K,
): boolean {
  return results.slice(0, k).some(
    ({ chunk }) =>
      chunk.source === expected.expectedSource &&
      (expected.expectedHeading === undefined || chunk.heading === expected.expectedHeading),
  );
}

// 완전 일치가 아니라 "포함": gemma3는 문구 끝에 마침표를 붙이기도 한다.
export function isRefusal(answer: string): boolean {
  return answer.includes(REFUSAL_PHRASE);
}
