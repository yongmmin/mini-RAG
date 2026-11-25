// chunkMarkdown 동작을 고정하는 테스트. Node 내장 test runner만 쓴다 (추가 패키지 없음).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CHARS, chunkMarkdown } from "./chunk.ts";

// 본문 = 머리말 첫 줄을 뗀 나머지. 길이 검사는 본문 기준이다.
const bodyOf = (text: string) => text.slice(text.indexOf("\n") + 1);

test("## 제목마다 조각 하나, text 앞에 '문서 제목 > 소제목' 머리말", () => {
  const md = "# 안내\n\n## 예약\n\n예약 본문\n\n## 취소\n\n취소 본문\n";
  assert.deepEqual(chunkMarkdown("a.md", md), [
    { id: "a.md#0", source: "a.md", heading: "예약", text: "안내 > 예약\n예약 본문" },
    { id: "a.md#1", source: "a.md", heading: "취소", text: "안내 > 취소\n취소 본문" },
  ]);
});

test("첫 ## 이전 본문은 heading = 문서 제목인 조각으로 남긴다", () => {
  const chunks = chunkMarkdown("a.md", "# 안내\n\n소개 글\n\n## 예약\n\n예약 본문\n");
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0], { id: "a.md#0", source: "a.md", heading: "안내", text: "안내 > 안내\n소개 글" });
  assert.equal(chunks[1]?.heading, "예약");
});

test("본문이 빈 섹션은 조각을 만들지 않는다", () => {
  const chunks = chunkMarkdown("a.md", "# 안내\n\n## 빈 섹션\n\n   \n\n## 예약\n\n예약 본문\n");
  assert.deepEqual(
    chunks.map((c) => [c.id, c.heading]),
    [["a.md#0", "예약"]],
  );
});

test("MAX_CHARS를 넘는 섹션은 문단 단위로 묶어 MAX_CHARS 이하 조각 여러 개로 나뉘고, 모두 같은 머리말", () => {
  const paragraph = "가".repeat(300);
  const body = [paragraph, paragraph, paragraph, paragraph].join("\n\n"); // 1206자
  const chunks = chunkMarkdown("a.md", `# 안내\n\n## 예약\n\n${body}\n`);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.text.startsWith("안내 > 예약\n"));
    assert.equal(chunk.heading, "예약");
    assert.ok(bodyOf(chunk.text).length <= MAX_CHARS);
  }
  // 문단 2개(300+2+300=602)씩 묶이고 내용 유실 없음
  assert.deepEqual(chunks.map((c) => c.id), ["a.md#0", "a.md#1"]);
  assert.equal(chunks.map((c) => bodyOf(c.text)).join("\n\n"), body);
});

test("MAX_CHARS보다 긴 문단 하나는 자르지 않고 한 조각으로 둔다", () => {
  const huge = "나".repeat(MAX_CHARS + 100);
  const chunks = chunkMarkdown("a.md", `# 안내\n\n## 긴 섹션\n\n짧은 문단\n\n${huge}\n`);
  assert.deepEqual(chunks.map((c) => bodyOf(c.text)), ["짧은 문단", huge]);
});

test("# 제목이 없으면 파일명(source)을 문서 제목으로 쓴다", () => {
  const chunks = chunkMarkdown("notes.md", "## 메모\n\n본문\n");
  assert.equal(chunks[0]?.text, "notes.md > 메모\n본문");
});
