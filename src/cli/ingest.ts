// npm run ingest: docs/*.md 읽기 → 조각으로 자르기 → embedding(숫자 배열) → index.json 저장. 인자 해석·출력·종료 코드만 맡는다.
// --dry-run 이면 자르기까지만 하고 잘린 조각을 눈으로 확인한다 (Ollama 호출 없음, 파일 저장 없음).
// 기본은 증분 색인(Phase 9): 이전 index.json에서 내용이 같은 조각의 벡터를 재사용한다. --full 이면 전부 다시 embedding.
import { EMBED_MODEL } from "../config.ts";
import { describeError } from "../errors.ts";
import { buildIndex, chunkDocuments, type IndexStats } from "../ingest/indexer.ts";
import { loadDocuments } from "../ingest/load.ts";
import { readIndexFile, writeIndex } from "../store/json-store.ts";
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
  const previous = process.argv.includes("--full") ? undefined : readPrevious();
  let result: { index: IndexFile; stats: IndexStats };
  try {
    result = await buildIndex(docs, {
      previous,
      onProgress: (done, total) => console.log(`embedding ${done}/${total}`),
    });
  } catch (err) {
    // 여기서 끝내므로 아래 writeIndex에 닿지 않는다 → 기존 index.json은 그대로 남는다.
    console.error(describeError(err)); // IndexError(조각 0개 등)는 메시지 그대로, Ollama 에러는 원인 + 해결 명령
    process.exit(1);
  }

  // 모든 배치가 성공한 뒤 한 번만 저장. 재사용한 조각도 포함해 통째로 다시 쓴다 (지워진 조각은 여기서 빠진다).
  const { index, stats } = result;
  writeIndex(index);

  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`재사용 ${stats.reused} · 새로 embedding ${stats.embedded} · 삭제 ${stats.removed}`);
  console.log(`\n${index.chunks.length}개 조각, ${index.dimensions}차원, ${seconds}초 → index.json`);
}

// 이전 index.json: 재사용할 벡터의 출처. 없거나 깨졌거나 모델이 다르면 전부 다시 embedding한다 (이유를 한 줄 알린다).
function readPrevious(): IndexFile | undefined {
  let previous: IndexFile | undefined;
  try {
    previous = readIndexFile();
    if (previous && !Array.isArray(previous.chunks)) throw new Error("chunks가 없다"); // JSON은 맞는데 모양이 다른 파일
  } catch {
    console.log("index.json을 읽을 수 없다 → 전부 다시 embedding");
    return undefined;
  }
  if (previous && previous.embedModel !== EMBED_MODEL) {
    console.log(`embedding 모델이 바뀌었다 (${previous.embedModel} → ${EMBED_MODEL}) → 전부 다시 embedding`);
  }
  return previous;
}

await main();
