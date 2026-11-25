// 하이브리드 검색의 순수 부분만 테스트한다: RRF 합치기. 네트워크 호출 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IndexedChunk } from "../types.ts";
import { rrf } from "./hybrid.ts";

// 부동소수점은 1.0000000002 처럼 나올 수 있어 "거의 같음"으로 비교한다.
function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
}

// 테스트용 조각: id만 의미 있고 나머지는 자리 채움.
function fakeChunk(id: string): IndexedChunk {
  return { id, source: `${id}.md`, heading: id, text: `${id}\nbody`, embedding: [] };
}

test("rrf: 점수가 아니라 순위로 합친다 — 두 목록 모두 위쪽인 조각이 1위", () => {
  // 점수 단위가 달라도(cosine 0.7 / BM25 5.0) 순위만 쓰므로 상관없다.
  const a = fakeChunk("a");
  const b = fakeChunk("b");
  const c = fakeChunk("c");
  const vector = [a, b, c].map((chunk) => ({ score: 0.7, chunk }));
  const keyword = [c, a].map((chunk) => ({ score: 5, chunk }));
  const fused = rrf([vector, keyword]);
  // a: 1/(60+1) + 1/(60+2), c: 1/(60+3) + 1/(60+1), b: 1/(60+2) (한 목록에만 있어도 남는다)
  assert.deepEqual(
    fused.map((r) => r.chunk.id),
    ["a", "c", "b"],
  );
  assertClose(fused[0].score, 1 / 61 + 1 / 62);
  assertClose(fused[2].score, 1 / 62);
});
