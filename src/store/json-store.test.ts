// 저장소의 안전장치만 테스트한다: 모델 불일치 안내, index.json 없음 안내. 네트워크 호출 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmbedModel, readIndex } from "./json-store.ts";

test("checkEmbedModel: 같은 모델이면 통과", () => {
  assert.doesNotThrow(() => checkEmbedModel("bge-m3", "bge-m3"));
});

test("checkEmbedModel: 다른 모델이면 두 이름과 npm run ingest 안내", () => {
  assert.throws(
    () => checkEmbedModel("bge-m3", "other"),
    (err: Error) => /bge-m3/.test(err.message) && /other/.test(err.message) && /npm run ingest/.test(err.message),
  );
});

test("readIndex: index.json이 없으면 npm run ingest 먼저 안내", () => {
  assert.throws(() => readIndex("/nonexistent/index.json"), /npm run ingest/);
});
