// npm run ingest: docs/*.md 읽기 → 조각으로 자르기 → embedding(숫자 배열) → index.json 저장. 인자 해석·출력·종료 코드만 맡는다.
// --dry-run 이면 자르기까지만 하고 잘린 조각을 눈으로 확인한다 (Ollama 호출 없음, 파일 저장 없음).
import { explainError } from "../errors.ts";
import { buildIndex, chunkDocuments } from "../ingest/indexer.ts";
import { loadDocuments } from "../ingest/load.ts";
import { writeIndex } from "../store/json-store.ts";
import type { ChunkDraft, IndexFile } from "../types.ts";

// 조각마다 한 줄: id | 머리말(문서 제목 > 소제목) | 본문 글자 수 | 본문 앞부분. 마지막에 총계와 파일별 개수.
function printChunks(chunks: ChunkDraft[]): void {
  const countBySource = new Map<string, number>();
  for (const chunk of chunks) {
    const header = chunk.text.slice(0, chunk.text.indexOf("\n")); // embedding 모델이 받는 바로 그 첫 줄
    const body = chunk.text.slice(chunk.text.indexOf("\n") + 1); // 머리말 첫 줄을 뗀 본문
    const preview = body.replace(/\s+/g, " ").slice(0, 50); // 줄바꿈을 공백으로 바꿔 한 줄에 보이게
    console.log(`${chunk.id.padEnd(18)} ${header}  (${body.length}자)  ${preview}…`);
    countBySource.set(chunk.source, (countBySource.get(chunk.source) ?? 0) + 1);
  }
  const perFile = [...countBySource].map(([source, count]) => `${source} ${count}`).join(", ");
  console.log(`\n총 ${chunks.length}개 조각 (${perFile})`);
}

async function main(): Promise<void> {
  const docs = loadDocuments();
  if (process.argv.includes("--dry-run")) {
    printChunks(chunkDocuments(docs));
    return;
  }

  const startedAt = performance.now();
  let index: IndexFile;
  try {
    index = await buildIndex(docs, (done, total) => console.log(`embedding ${done}/${total}`));
  } catch (err) {
    // 여기서 끝내므로 아래 writeIndex에 닿지 않는다 → 기존 index.json은 그대로 남는다.
    console.error(explainError(err));
    process.exit(1);
  }

  // 모든 배치가 성공한 뒤 한 번만 저장.
  writeIndex(index);

  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n${index.chunks.length}개 조각, ${index.dimensions}차원, ${seconds}초 → index.json`);
}

await main();
