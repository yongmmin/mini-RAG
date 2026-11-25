// npm run eval: 평가를 돌려 문항별 표와 방식별 점수를 출력한다. 표 모양·종료 코드만 맡고, 채점은 evaluation/run.ts가 한다.
import { TOP_K } from "../config.ts";
import { describeError } from "../errors.ts";
import { loadQuestions, runEval, type EvalRow, type EvalSummary } from "../evaluation/run.ts";
import { SEARCH_MODES } from "../retrieval/search.ts";
import type { SearchMode, SearchResult } from "../types.ts";

// 0.75 → "75%"
function percent(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

// 1위 조각 한 줄: "0.745 관측 예약 방법" (keyword는 겹치는 토큰이 없으면 결과가 없을 수 있다)
// RRF 점수는 최대 2/61 ≈ 0.0328이라 소수 셋째 자리까지면 다 0.033으로 보인다 → hybrid만 넷째 자리까지.
function topLabel(results: SearchResult[], mode: SearchMode): string {
  const top = results[0];
  return top ? `${top.score.toFixed(mode === "hybrid" ? 4 : 3)} ${top.chunk.heading}` : "(결과 없음)";
}

// 문항 하나 = 두 줄. 방식마다 두 글자 = hit@1, hit@3 (O 맞음 / X 틀림). 예: "XO" = 1위는 틀렸지만 상위 3개 안에는 있음.
function printRow(row: EvalRow, i: number): void {
  const num = String(i + 1).padStart(2);
  const { item } = row;
  if (row.kind === "refusal") {
    console.log(`${num}  거절 ${row.pass ? "O" : "X"}                ${item.type.padEnd(6)}  ${item.question}`);
    console.log(`                                    └ 답: ${row.answer.replace(/\s+/g, " ").slice(0, 60)}`);
    return;
  }
  const cells = SEARCH_MODES.map((mode) => `${row.hits[mode].hit1 ? "O" : "X"}${row.hits[mode].hit3 ? "O" : "X"}`);
  console.log(`${num}  ${cells[0]}     ${cells[1]}      ${cells[2]}      ${item.type.padEnd(6)}  ${item.question}`);
  console.log(`                                    └ ${SEARCH_MODES.map((mode) => `${mode} ${topLabel(row.ranked[mode], mode)}`).join(" | ")}`);
}

async function main(): Promise<void> {
  const items = loadQuestions();

  console.log(`#   vector keyword hybrid  유형     질문`);
  console.log(`                                    └ 방식별 1위 조각 (점수)`);
  let summary: EvalSummary;
  try {
    summary = await runEval(items, printRow);
  } catch (err) {
    console.error(describeError(err));
    process.exit(1);
  }

  const { stats, refusals, inDocs, outOfDocs } = summary;
  console.log(`\n방식      hit@1          hit@${TOP_K}   (문서에 있는 ${inDocs}문항)`);
  for (const [mode, s] of stats) {
    console.log(`${mode.padEnd(8)}  ${`${s.hit1}/${inDocs} (${percent(s.hit1, inDocs)})`.padEnd(13)}  ${s.hit3}/${inDocs} (${percent(s.hit3, inDocs)})`);
  }
  console.log(`거절: ${refusals}/${outOfDocs} (${percent(refusals, outOfDocs)})  — ask() 기본 방식(vector)`);
  // 유형별: "유형 hit@1/hit@3/전체" (예: "키워드 1/3/3" = 3문항 중 1위 1개, 상위 3개 안 3개)
  for (const [mode, s] of stats) {
    console.log(`${mode.padEnd(8)}  ${[...s.byType].map(([type, t]) => `${type} ${t.hit1}/${t.hit3}/${t.total}`).join(" · ")}`);
  }
}

await main();
