// 색인 만들기: docs/*.md 읽기 → 조각으로 자르기 → embedding(숫자 배열) → index.json 저장.
// --dry-run 이면 자르기까지만 하고 잘린 조각을 눈으로 확인한다 (Ollama 호출 없음, 파일 저장 없음).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APIConnectionError } from "openai";
import { chunkMarkdown, type ChunkDraft } from "./chunk.ts";
import { EMBED_MODEL, embed } from "./llm.ts";

// 이 파일(src/ingest.ts) 기준으로 한 단계 위 = 프로젝트 루트. 어느 폴더에서 실행해도 같은 docs/를 읽는다.
const DOCS_DIR = join(import.meta.dirname, "..", "docs");
const INDEX_PATH = join(import.meta.dirname, "..", "index.json");

// 한 번의 HTTP 요청에 보낼 조각 수. 14조각이면 8 + 6 = 요청 2번.
const BATCH_SIZE = 8;

// index.json 한 조각 = Phase 2 조각(id, source, heading, text) + 그 text의 벡터. Phase 4가 import type 으로 쓴다.
export type IndexedChunk = ChunkDraft & { embedding: number[] };
export type IndexFile = {
  embedModel: string; // 검색할 때 질문도 같은 모델로 바꿔야 하므로 기록해 둔다
  dimensions: number; // 벡터 길이 (bge-m3 = 1024)
  createdAt: string; // ISO 시각
  chunks: IndexedChunk[];
};

// docs/ 안의 *.md 파일을 이름순으로 읽어 전부 조각으로 자른다. 파일 이름 → 문자열 → 조각 배열.
function loadChunks(): ChunkDraft[] {
  const files = readdirSync(DOCS_DIR).filter((name) => name.endsWith(".md")).sort();
  return files.flatMap((file) => chunkMarkdown(file, readFileSync(join(DOCS_DIR, file), "utf8")));
}

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

// 조각들을 BATCH_SIZE씩 Ollama에 보내 벡터를 받고, 조각 옆에 붙인다. 조각 배열 → HTTP → 숫자 배열 → 조각+벡터 배열.
async function embedChunks(chunks: ChunkDraft[]): Promise<IndexedChunk[]> {
  const indexed: IndexedChunk[] = [];
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const vectors = await embed(batch.map((chunk) => chunk.text)); // 머리말 포함 text를 그대로 보낸다
    batch.forEach((chunk, i) => indexed.push({ ...chunk, embedding: vectors[i] }));
    console.log(`embedding ${indexed.length}/${chunks.length}`);
  }
  return indexed;
}

// Ollama 에러 → "원인 + 해결 명령" 문장 (PLAN §6.5). 네트워크 없이 테스트할 수 있게 순수 함수로 둔다.
export function explainError(err: unknown): string {
  const cause = (err as { cause?: { code?: string } })?.cause;
  if (err instanceof APIConnectionError || cause?.code === "ECONNREFUSED") {
    return `Ollama에 연결할 수 없다 (서버가 꺼져 있음). 실행: ollama serve`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if ((err as { status?: number })?.status === 404 || /not found/i.test(message)) {
    return `embedding 모델 '${EMBED_MODEL}'이 없다. 설치: ollama pull ${EMBED_MODEL}`;
  }
  return `embedding 실패: ${message}`;
}

async function main(): Promise<void> {
  const chunks = loadChunks();
  if (process.argv.includes("--dry-run")) {
    printChunks(chunks);
    return;
  }

  const startedAt = performance.now();
  let indexed: IndexedChunk[];
  try {
    indexed = await embedChunks(chunks);
  } catch (err) {
    // 여기서 끝내므로 아래 writeFileSync에 닿지 않는다 → 기존 index.json은 그대로 남는다.
    console.error(explainError(err));
    process.exit(1);
  }

  const index: IndexFile = {
    embedModel: EMBED_MODEL,
    dimensions: indexed[0].embedding.length, // 하드코딩하지 않고 실제 받은 벡터 길이를 적는다
    createdAt: new Date().toISOString(),
    chunks: indexed,
  };
  // 모든 배치가 성공한 뒤 한 번만 저장. 들여쓰기 2칸 = 사람이 열어 볼 수 있게.
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n${indexed.length}개 조각, ${index.dimensions}차원, ${seconds}초 → index.json`);
}

// 직접 실행(npm run ingest)할 때만 main을 돈다. 테스트가 explainError를 import할 때는 색인이 돌지 않게 한다.
if (import.meta.filename === process.argv[1]) await main();
