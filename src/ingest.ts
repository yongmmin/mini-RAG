// 색인 만들기: docs/*.md 읽기 → 조각으로 자르기 → (Phase 3) embedding → index.json 저장.
// 지금(Phase 2)은 자르기까지만 하고, --dry-run 으로 잘린 조각을 눈으로 확인한다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chunkMarkdown, type ChunkDraft } from "./chunk.ts";

// 이 파일(src/ingest.ts) 기준으로 한 단계 위 = 프로젝트 루트. 어느 폴더에서 실행해도 같은 docs/를 읽는다.
const DOCS_DIR = join(import.meta.dirname, "..", "docs");

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

function main(): void {
  if (!process.argv.includes("--dry-run")) {
    console.log("embedding 단계는 Phase 3에서 구현한다. 지금은 잘린 조각만 확인할 수 있다:");
    console.log("  npm run ingest -- --dry-run");
    process.exit(1);
  }
  printChunks(loadChunks());
}

main();
