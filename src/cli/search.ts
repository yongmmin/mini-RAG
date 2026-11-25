// npm run search: 질문 하나로 검색해 상위 조각을 보여 준다. 인자 해석·출력·종료 코드만 맡고, 검색은 retrieval/search.ts가 한다.
// 사용: npm run search "질문"  또는  npm run search -- --mode vector|keyword|hybrid "질문"
import { parseArgs } from "node:util";
import { EMBED_MODEL, TOP_K } from "../config.ts";
import { IndexError, explainError } from "../errors.ts";
import { SEARCH_MODES, search } from "../retrieval/search.ts";
import type { SearchMode, SearchResult } from "../types.ts";

// 방식마다 점수 이름. 점수 단위가 방식마다 달라 결과 맨 위에 적는다.
const SCORE_NAME: Record<SearchMode, string> = { vector: "cosine", keyword: "BM25", hybrid: "RRF" };

// 결과 한 건 = 순위, 점수, 출처 > 소제목, 본문 앞부분 한 줄. 점수 단위가 방식마다 달라 맨 위에 방식을 적는다.
function printResults(results: SearchResult[], mode: SearchMode): void {
  console.log(`검색 방식: ${mode} (점수 = ${SCORE_NAME[mode]})`);
  if (results.length === 0) console.log("(결과 없음: 질문과 겹치는 토큰이 있는 조각이 없다)");
  results.forEach(({ score, chunk }, i) => {
    const body = chunk.text.slice(chunk.text.indexOf("\n") + 1); // 머리말 첫 줄을 뗀 본문 (cli/ingest.ts의 printChunks와 같은 방식)
    const preview = body.replace(/\s+/g, " ").slice(0, 60); // 줄바꿈을 공백으로 바꿔 한 줄에 보이게
    console.log(`${i + 1}. ${score.toFixed(mode === "hybrid" ? 4 : 3)}  ${chunk.source} > ${chunk.heading}`); // RRF는 값이 작아 넷째 자리까지
    console.log(`   ${preview}…`);
  });
  if (mode !== "keyword") console.log(`\n질문 embedding 모델: ${EMBED_MODEL}`);
}

async function main(): Promise<void> {
  const usage = `사용법: npm run search "질문"  또는  npm run search -- --mode ${SEARCH_MODES.join("|")} "질문"`;
  let mode: SearchMode;
  let question: string;
  try {
    // --mode 옵션과 나머지(질문)를 나눈다. 모르는 옵션이면 throw.
    const { values, positionals } = parseArgs({ options: { mode: { type: "string", default: "vector" } }, allowPositionals: true });
    mode = values.mode as SearchMode;
    question = positionals.join(" ").trim();
  } catch {
    console.error(usage);
    process.exit(1);
  }
  if (!question || !SEARCH_MODES.includes(mode)) {
    console.error(usage);
    process.exit(1);
  }

  try {
    printResults(await search(question, { topK: TOP_K, mode }), mode);
  } catch (err) {
    // 색인 문제는 메시지 그대로, Ollama 문제는 explainError로 원인+해결 명령을 보여준다.
    console.error(err instanceof IndexError ? err.message : explainError(err));
    process.exit(1);
  }
}

await main();
