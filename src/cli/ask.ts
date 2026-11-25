// npm run ask: 질문 하나에 문서 기반 답을 받는다. 인자 해석·출력·종료 코드만 맡고, 답 생성은 generation/ask.ts가 한다.
import { describeError } from "../errors.ts";
import { ask } from "../generation/ask.ts";
import type { SearchResult } from "../types.ts";

// 출력 순서: 검색된 조각(디버깅용: 무엇을 근거로 줬나) → 답변 → 출처(답의 [n]이 가리키는 조각).
function printAnswer(results: SearchResult[], answer: string): void {
  console.log("검색된 조각");
  results.forEach(({ score, chunk }, i) => {
    console.log(`${i + 1}. ${score.toFixed(3)}  ${chunk.source} > ${chunk.heading}`);
  });
  console.log("\n답변");
  console.log(answer);
  console.log("\n출처");
  results.forEach(({ chunk }, i) => console.log(`[${i + 1}] ${chunk.source} > ${chunk.heading}`));
}

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error(`사용법: npm run ask "질문"`);
    process.exit(1);
  }

  try {
    const { results, answer } = await ask(question);
    printAnswer(results, answer);
  } catch (err) {
    console.error(describeError(err));
    process.exit(1);
  }
}

await main();
