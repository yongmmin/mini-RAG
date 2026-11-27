// 색인 만들기: 원본 문서들 → 조각으로 자르기 → embedding(숫자 배열) → IndexFile. 저장은 하지 않는다 (store/가 맡는다).
// Phase 9 증분 색인: 이전 색인을 받으면, 내용(text)이 그대로인 조각은 그 벡터를 재사용하고 바뀐 조각만 Ollama에 보낸다.
import { createHash } from "node:crypto";
import { BATCH_SIZE, EMBED_MODEL } from "../config.ts";
import { IndexError } from "../errors.ts";
import { embed } from "../llm.ts";
import type { ChunkDraft, IndexFile, IndexedChunk, SourceDocument } from "../types.ts";
import { chunkMarkdown } from "./chunk.ts";

type HashedChunk = ChunkDraft & { hash: string };
type Progress = (done: number, total: number) => void;

// 몇 개를 재사용하고, 몇 개를 새로 embedding하고, 이전 색인의 몇 개가 사라졌나. cli가 출력한다.
export type IndexStats = { reused: number; embedded: number; removed: number };

// 문서마다 조각으로 잘라 한 배열로 잇는다. 문서 순서 = 조각 순서. (Ollama 호출 없음: --dry-run도 이것만 쓴다)
export function chunkDocuments(docs: SourceDocument[]): ChunkDraft[] {
  return docs.flatMap((doc) => chunkMarkdown(doc.source, doc.text));
}

// 조각 내용의 지문. embedding에 들어가는 text(머리말 포함) 그대로를 hash한다 → 글자 하나만 바뀌어도 다른 값.
// 위치 id("observation.md#2")는 앞에 섹션이 끼면 밀리므로 비교 기준이 될 수 없다. 내용으로 비교한다.
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// 순수 함수(Ollama 호출 없음): 새 조각들과 이전 색인을 비교해 무엇을 재사용하고 무엇을 embedding할지 정한다.
// 같은 (text, 모델) → 같은 벡터. 그래서 이전 색인의 모델이 지금 EMBED_MODEL과 다르면 아무것도 재사용하지 않는다.
export function planIndex(drafts: ChunkDraft[], previous?: IndexFile) {
  const reusable = new Map<string, number[]>(); // hash → 이전 벡터
  if (previous && previous.embedModel === EMBED_MODEL) {
    // Phase 9 이전에 만든 index.json에는 hash가 없다 → 저장된 text로 계산하면 같은 값이 나온다.
    for (const chunk of previous.chunks) reusable.set(chunk.hash ?? contentHash(chunk.text), chunk.embedding);
  }
  const chunks: HashedChunk[] = drafts.map((draft) => ({ ...draft, hash: contentHash(draft.text) }));
  const current = new Set(chunks.map((chunk) => chunk.hash));
  return {
    chunks, // 새 조각 전부 (순서 = 자른 순서)
    reusable,
    toEmbed: chunks.filter((chunk) => !reusable.has(chunk.hash)),
    removed: [...reusable.keys()].filter((hash) => !current.has(hash)).length, // 이전에 있었는데 이제 없는 내용
  };
}

// 조각들을 BATCH_SIZE씩 Ollama에 보내 벡터를 받는다. 조각 배열 → HTTP → 숫자 배열 → hash별 벡터.
// onProgress(끝난 수, 전체 수): 배치마다 한 번. 출력은 호출한 쪽(cli)이 정한다.
async function embedChunks(chunks: HashedChunk[], onProgress?: Progress): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const batchVectors = await embed(batch.map((chunk) => chunk.text)); // 머리말 포함 text를 그대로 보낸다
    batch.forEach((chunk, i) => vectors.set(chunk.hash, batchVectors[i]));
    onProgress?.(Math.min(start + BATCH_SIZE, chunks.length), chunks.length);
  }
  return vectors;
}

// 문서들 → index.json에 들어갈 내용 전체 + 통계. previous가 없으면(처음 또는 --full) 전부 embedding.
// embedding 하나라도 실패하면 throw (아무것도 돌려주지 않는다).
export async function buildIndex(
  docs: SourceDocument[],
  { previous, onProgress }: { previous?: IndexFile; onProgress?: Progress } = {},
): Promise<{ index: IndexFile; stats: IndexStats }> {
  const drafts = chunkDocuments(docs);
  if (drafts.length === 0) {
    // 막지 않으면 아래 chunks[0]이 없어 TypeError가 나고, cli가 그것을 "모델 요청 실패"로 잘못 안내한다 → 먼저 막는다.
    throw new IndexError("docs/에서 자를 조각이 하나도 없다. docs/에 .md 파일이 있는지 확인한다");
  }
  const plan = planIndex(drafts, previous);
  const fresh = await embedChunks(plan.toEmbed, onProgress);
  const chunks: IndexedChunk[] = plan.chunks.map((chunk) => ({
    ...chunk,
    embedding: fresh.get(chunk.hash) ?? plan.reusable.get(chunk.hash)!,
  }));
  return {
    index: {
      embedModel: EMBED_MODEL,
      dimensions: chunks[0].embedding.length, // 하드코딩하지 않고 실제 벡터 길이를 적는다
      createdAt: new Date().toISOString(),
      chunks,
    },
    stats: { reused: plan.chunks.length - plan.toEmbed.length, embedded: plan.toEmbed.length, removed: plan.removed },
  };
}
