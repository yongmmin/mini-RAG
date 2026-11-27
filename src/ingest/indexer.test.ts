// 증분 색인의 "무엇을 다시 embedding할까" 판단(planIndex)을 고정하는 테스트. Ollama 호출 없음.
// 이전 색인은 손으로 만든 가짜 벡터를 쓴다: 재사용됐는지는 벡터가 아니라 toEmbed에 빠졌는지로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMBED_MODEL } from "../config.ts";
import { IndexError } from "../errors.ts";
import type { IndexFile } from "../types.ts";
import { buildIndex, chunkDocuments, contentHash, planIndex } from "./indexer.ts";

const DOC = "# 안내\n\n## 예약\n\n예약 본문\n\n## 취소\n\n취소 본문\n\n## 관측\n\n관측 본문\n";

// docs → 이미 색인된 상태. 모든 조각에 hash와 가짜 벡터를 붙인다.
function indexOf(text: string, embedModel = EMBED_MODEL): IndexFile {
  const chunks = chunkDocuments([{ source: "a.md", text }]).map((draft, i) => ({
    ...draft,
    hash: contentHash(draft.text),
    embedding: [i],
  }));
  return { embedModel, dimensions: 1, createdAt: "", chunks };
}
const planFor = (text: string, previous?: IndexFile) => planIndex(chunkDocuments([{ source: "a.md", text }]), previous);
const headingsToEmbed = (plan: ReturnType<typeof planIndex>) => plan.toEmbed.map((chunk) => chunk.heading);

test("contentHash: 같은 글은 같은 값, 한 글자만 달라도 다른 값", () => {
  assert.equal(contentHash("예약 본문"), contentHash("예약 본문"));
  assert.notEqual(contentHash("예약 본문"), contentHash("예약 본문."));
});

test("이전 색인이 없으면(처음 또는 --full) 전부 embedding", () => {
  const plan = planFor(DOC);
  assert.deepEqual(headingsToEmbed(plan), ["예약", "취소", "관측"]);
  assert.equal(plan.removed, 0);
});

test("문서가 그대로면 embedding 0개", () => {
  const plan = planFor(DOC, indexOf(DOC));
  assert.equal(plan.toEmbed.length, 0);
  assert.equal(plan.removed, 0);
});

test("한 섹션의 문장 하나를 고치면 그 조각만 embedding, 옛 내용은 삭제 1", () => {
  const plan = planFor(DOC.replace("취소 본문", "취소 본문 수정"), indexOf(DOC));
  assert.deepEqual(headingsToEmbed(plan), ["취소"]);
  assert.equal(plan.removed, 1);
});

test("맨 앞에 섹션을 넣으면 id는 전부 밀리지만 embedding은 새 섹션 하나뿐 (위치가 아니라 내용으로 비교)", () => {
  const plan = planFor(DOC.replace("## 예약", "## 공지\n\n공지 본문\n\n## 예약"), indexOf(DOC));
  assert.deepEqual(headingsToEmbed(plan), ["공지"]);
  assert.equal(plan.chunks.find((chunk) => chunk.heading === "예약")?.id, "a.md#1"); // 원래 a.md#0
  assert.equal(plan.removed, 0);
});

test("섹션을 지우면 embedding 0개, 삭제 1", () => {
  const plan = planFor(DOC.replace("## 취소\n\n취소 본문\n\n", ""), indexOf(DOC));
  assert.equal(plan.toEmbed.length, 0);
  assert.equal(plan.chunks.length, 2);
  assert.equal(plan.removed, 1);
});

test("이전 색인의 embedding 모델이 다르면 하나도 재사용하지 않는다", () => {
  const plan = planFor(DOC, indexOf(DOC, "other-model"));
  assert.equal(plan.toEmbed.length, 3);
});

test("hash가 없는 옛 색인(Phase 9 이전)도 저장된 text로 계산해 재사용한다", () => {
  const old = indexOf(DOC);
  for (const chunk of old.chunks) delete chunk.hash;
  assert.equal(planFor(DOC, old).toEmbed.length, 0);
});

test("buildIndex: 조각이 0개면 Ollama를 부르기 전에 IndexError", async () => {
  await assert.rejects(buildIndex([]), (err: Error) => err instanceof IndexError && /docs\//.test(err.message));
});
