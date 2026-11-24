// 검색의 순수 부분만 테스트한다: cosine 계산, 순위/topK, 모델 불일치 안내. 네트워크 호출 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IndexedChunk } from "./ingest.ts";
import { checkEmbedModel, cosine, loadIndex, rankChunks } from "./search.ts";

// 부동소수점은 1.0000000002 처럼 나올 수 있어 "거의 같음"으로 비교한다.
function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
}

test("cosine: 같은 방향 = 1 (길이가 달라도)", () => {
  assertClose(cosine([1, 2, 3], [2, 4, 6]), 1);
});

test("cosine: 직교 = 0", () => {
  assertClose(cosine([1, 0], [0, 5]), 0);
});

test("cosine: 반대 방향 = -1", () => {
  assertClose(cosine([1, 2], [-1, -2]), -1);
});

// 테스트용 조각: 벡터만 의미 있고 나머지는 자리 채움.
function fakeChunk(id: string, embedding: number[]): IndexedChunk {
  return { id, source: `${id}.md`, heading: id, text: `${id}\nbody`, embedding };
}

test("rankChunks: 점수 높은 순으로 정렬하고 topK개만 남긴다", () => {
  const chunks = [fakeChunk("far", [0, 1]), fakeChunk("best", [1, 0]), fakeChunk("mid", [1, 1])];
  const ranked = rankChunks([1, 0], chunks, 2);
  assert.deepEqual(
    ranked.map((r) => r.chunk.id),
    ["best", "mid"],
  );
  assertClose(ranked[0].score, 1);
  assert.ok(ranked[0].score > ranked[1].score);
});

test("checkEmbedModel: 같은 모델이면 통과", () => {
  assert.doesNotThrow(() => checkEmbedModel("bge-m3", "bge-m3"));
});

test("checkEmbedModel: 다른 모델이면 두 이름과 npm run ingest 안내", () => {
  assert.throws(
    () => checkEmbedModel("bge-m3", "other"),
    (err: Error) => /bge-m3/.test(err.message) && /other/.test(err.message) && /npm run ingest/.test(err.message),
  );
});

test("loadIndex: index.json이 없으면 npm run ingest 먼저 안내", () => {
  assert.throws(() => loadIndex("/nonexistent/index.json"), /npm run ingest/);
});
