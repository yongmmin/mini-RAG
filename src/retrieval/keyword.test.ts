// 키워드 검색의 순수 부분만 테스트한다: bigram 토큰화, BM25 점수. 네트워크·파일 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bm25Scores, tokenize } from "./keyword.ts";

test("tokenize: 띄어쓰기·문장부호로 나눈 뒤 글자 2개씩 겹쳐 자른다", () => {
  assert.deepEqual(tokenize("예약을 취소!"), ["예약", "약을", "취소"]);
});

test("tokenize: 소문자로 바꾸고, 하이픈·콜론도 경계로 본다", () => {
  assert.deepEqual(tokenize("OBS-1234"), ["ob", "bs", "12", "23", "34"]);
  assert.deepEqual(tokenize("UTC 02:00"), ["ut", "tc", "02", "00"]);
});

test("tokenize: 1글자 토막은 그대로 남긴다", () => {
  assert.deepEqual(tokenize("a 위성"), ["a", "위성"]);
});

test("tokenize: 조사가 달라도 앞쪽 bigram은 같다 (예약을 / 예약은)", () => {
  assert.equal(tokenize("예약을")[0], tokenize("예약은")[0]);
});

// 아래 테스트의 본문은 2글자 단어로만 써서 "단어 = 토큰"이 되게 했다 (계산을 눈으로 따라가기 쉽게).
test("bm25Scores: 질문 토큰이 하나도 없는 조각은 0", () => {
  const scores = bm25Scores(["취소"], [{ text: "예약 취소" }, { text: "예약 변경" }, { text: "예약 방법" }]);
  assert.ok(scores[0] > 0);
  assert.equal(scores[1], 0);
  assert.equal(scores[2], 0);
});

test("bm25Scores: 드문 단어(IDF 큼)가 맞은 조각이 흔한 단어가 맞은 조각보다 높다", () => {
  // "예약"은 2조각에, "취소"는 1조각에만 있다 → "취소"가 더 드물다.
  const [common, rare] = bm25Scores(["예약", "취소"], [{ text: "예약 변경" }, { text: "취소 변경" }, { text: "예약 방법" }]);
  assert.ok(rare > common, `${rare} > ${common}`);
});

test("bm25Scores: 같은 단어가 여러 번 나오면 점수가 오르지만 2배까지는 아니다 (TF 포화)", () => {
  const [once, twice] = bm25Scores(["취소"], [{ text: "취소 변경" }, { text: "취소 취소" }, { text: "예약 방법" }]);
  assert.ok(twice > once, `${twice} > ${once}`);
  assert.ok(twice < once * 2, `${twice} < ${once} × 2`);
});

test("bm25Scores: 단어 횟수가 같으면 짧은 조각이 더 높다 (길이 보정)", () => {
  const [short, long] = bm25Scores(["취소"], [{ text: "취소 방법" }, { text: "취소 방법 변경 안내 시간 제한" }]);
  assert.ok(short > long, `${short} > ${long}`);
});
