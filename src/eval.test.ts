// 채점의 순수 부분만 테스트한다: 검색 적중(isHit), 거절 판정(isRefusal). 네트워크 호출 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "./search.ts";
import { isHit, isRefusal } from "./eval.ts";

// 테스트용 검색 결과: 채점에 쓰는 source·heading만 의미 있고 나머지는 자리 채움.
function fakeResult(id: string, source: string, heading: string): SearchResult {
  return { score: 0.5, chunk: { id, source, heading, text: `${heading}\nbody`, embedding: [] } };
}

const results = [
  fakeResult("observation.md#0", "observation.md", "예약 취소"),
  fakeResult("observation.md#1", "observation.md", "예약 변경"),
  fakeResult("account.md#0", "account.md", "로그인 잠금"),
];

test("isHit: 출처와 소제목이 모두 맞는 조각이 상위에 있으면 hit (1위가 아니어도)", () => {
  assert.equal(isHit(results, { expectedSource: "account.md", expectedHeading: "로그인 잠금" }), true);
});

test("isHit: expectedHeading이 없으면 출처만 맞아도 hit", () => {
  assert.equal(isHit(results, { expectedSource: "account.md" }), true);
});

test("isHit: 출처는 맞지만 소제목이 다르면 miss, 출처가 없으면 miss", () => {
  assert.equal(isHit(results, { expectedSource: "observation.md", expectedHeading: "시간창 제한" }), false);
  assert.equal(isHit(results, { expectedSource: "glossary.md" }), false);
});

test("isHit: 한 섹션이 여러 조각으로 나뉘어도 그중 하나만 들어오면 hit", () => {
  // "관측 예약 방법"은 2조각(#0, #1)으로 나뉜다. 뒷조각 하나만 top-3에 있어도 맞힌 것으로 본다.
  const split = [fakeResult("observation.md#1", "observation.md", "관측 예약 방법"), ...results.slice(1)];
  assert.equal(isHit(split, { expectedSource: "observation.md", expectedHeading: "관측 예약 방법" }), true);
});

test("isRefusal: 정해진 거절 문구 그대로면 거절", () => {
  assert.equal(isRefusal("문서에서 찾을 수 없습니다"), true);
});

test("isRefusal: 끝에 마침표가 붙어도 거절 (gemma3가 가끔 붙인다)", () => {
  assert.equal(isRefusal("문서에서 찾을 수 없습니다."), true);
});

test("isRefusal: 다른 말로 거절하거나 답을 하면 거절이 아니다", () => {
  assert.equal(isRefusal("제공된 자료에는 결제 방법에 대한 정보가 없습니다 [1, 2, 3]."), false);
  assert.equal(isRefusal("관측 시작 1시간 전까지 취소할 수 있습니다 [1]."), false);
});
