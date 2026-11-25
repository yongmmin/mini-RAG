// Ollama 에러 → 안내 메시지 변환만 테스트한다. 네트워크 호출 없음 (에러 객체를 직접 만든다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { APIConnectionError, NotFoundError } from "openai";
import { EMBED_MODEL } from "./config.ts";
import { explainError } from "./errors.ts";

test("연결 실패(Ollama 꺼짐) → ollama serve 안내", () => {
  const err = new APIConnectionError({ message: "Connection error." });
  assert.match(explainError(err), /ollama serve/);
});

test("cause.code가 ECONNREFUSED인 에러도 연결 실패로 본다", () => {
  const err = new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
  assert.match(explainError(err), /ollama serve/);
});

test("404 모델 없음 → ollama pull <EMBED_MODEL> 안내", () => {
  const err = new NotFoundError(404, undefined, `model "${EMBED_MODEL}" not found`, new Headers());
  assert.match(explainError(err), new RegExp(`ollama pull ${EMBED_MODEL}`));
});

test("그 외 에러 → 원문 메시지를 그대로 보여 준다", () => {
  assert.match(explainError(new Error("something odd")), /something odd/);
});

test("두 번째 인자로 모델 이름을 주면 그 모델의 pull 안내 (생성 모델용)", () => {
  const err = new NotFoundError(404, undefined, `model "nope" not found`, new Headers());
  assert.match(explainError(err, "nope"), /ollama pull nope/);
});
