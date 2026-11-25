// 색인 만들기: 원본 문서들 → 조각으로 자르기 → embedding(숫자 배열) → IndexFile. 저장은 하지 않는다 (store/가 맡는다).
// 확장 자리: 증분 색인(바뀐 문서만 다시 embedding)은 이 파일에서 문서·조각을 골라 보내는 부분을 바꾼다.
import { BATCH_SIZE, EMBED_MODEL } from "../config.ts";
import { embed } from "../llm.ts";
import type { ChunkDraft, IndexFile, IndexedChunk, SourceDocument } from "../types.ts";
import { chunkMarkdown } from "./chunk.ts";

// 문서마다 조각으로 잘라 한 배열로 잇는다. 문서 순서 = 조각 순서. (Ollama 호출 없음: --dry-run도 이것만 쓴다)
export function chunkDocuments(docs: SourceDocument[]): ChunkDraft[] {
  return docs.flatMap((doc) => chunkMarkdown(doc.source, doc.text));
}

// 조각들을 BATCH_SIZE씩 Ollama에 보내 벡터를 받고, 조각 옆에 붙인다. 조각 배열 → HTTP → 숫자 배열 → 조각+벡터 배열.
// onProgress(끝난 수, 전체 수): 배치마다 한 번. 출력은 호출한 쪽(cli)이 정한다.
async function embedChunks(chunks: ChunkDraft[], onProgress?: (done: number, total: number) => void): Promise<IndexedChunk[]> {
  const indexed: IndexedChunk[] = [];
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const vectors = await embed(batch.map((chunk) => chunk.text)); // 머리말 포함 text를 그대로 보낸다
    batch.forEach((chunk, i) => indexed.push({ ...chunk, embedding: vectors[i] }));
    onProgress?.(indexed.length, chunks.length);
  }
  return indexed;
}

// 문서들 → index.json에 들어갈 내용 전체. embedding 하나라도 실패하면 throw (아무것도 돌려주지 않는다).
export async function buildIndex(docs: SourceDocument[], onProgress?: (done: number, total: number) => void): Promise<IndexFile> {
  const indexed = await embedChunks(chunkDocuments(docs), onProgress);
  return {
    embedModel: EMBED_MODEL,
    dimensions: indexed[0].embedding.length, // 하드코딩하지 않고 실제 받은 벡터 길이를 적는다
    createdAt: new Date().toISOString(),
    chunks: indexed,
  };
}
