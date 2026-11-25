// 답 생성의 순수 부분만 테스트한다: 자료(context) 번호 붙이기, messages 구성. 네트워크 호출 없음 (LLM을 부르지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "./search.ts";
import { SYSTEM_PROMPT, buildContext, buildMessages } from "./ask.ts";

// 테스트용 검색 결과: text는 실제 색인처럼 "문서 제목 > 소제목" 머리말로 시작한다.
function fakeResult(id: string, text: string): SearchResult {
  return { score: 0.5, chunk: { id, source: `${id}.md`, heading: id, text, embedding: [] } };
}

const results = [
  fakeResult("a", "관측 예약 > 예약 취소\n관측 시작 1시간 전까지 취소할 수 있다."),
  fakeResult("b", "계정 > 로그인\n5번 틀리면 잠긴다."),
];

test("buildContext: 조각마다 [1], [2] 번호를 붙이고 본문을 그대로 넣는다", () => {
  const context = buildContext(results);
  assert.equal(
    context,
    "[1] 관측 예약 > 예약 취소\n관측 시작 1시간 전까지 취소할 수 있다.\n\n[2] 계정 > 로그인\n5번 틀리면 잠긴다.",
  );
});

test("buildMessages: system 메시지에 PLAN의 3규칙이 들어 있다", () => {
  const [system] = buildMessages("질문", results);
  assert.equal(system.role, "system");
  assert.equal(system.content, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /\[자료\]만/); // 규칙 1: 자료만 근거
  assert.match(SYSTEM_PROMPT, /문장마다/); // 규칙 2: 문장마다 [n]
  assert.match(SYSTEM_PROMPT, /\[n\]/);
  assert.ok(SYSTEM_PROMPT.includes("문서에서 찾을 수 없습니다")); // 규칙 3: 정확한 거절 문구
});

test("buildMessages: user 메시지에 [자료], 모든 조각, [질문], 질문 원문이 들어 있다", () => {
  const question = "예약을 언제까지 취소할 수 있어?";
  const [, user] = buildMessages(question, results);
  assert.equal(user.role, "user");
  assert.equal(user.content, `[자료]\n${buildContext(results)}\n\n[질문]\n${question}`);
  for (const { chunk } of results) assert.ok(String(user.content).includes(chunk.text));
});
