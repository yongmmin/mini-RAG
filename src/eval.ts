// 평가: 고정된 질문 묶음(eval/questions.json)을 한 번에 돌려 점수를 낸다. 검색과 답변(거절)을 따로 채점한다.
// 데이터 흐름: questions.json → 항목마다
//   문서에 있는 질문 → search() 상위 3개 → isHit (기대 출처·소제목이 들어 있나) → hit@3
//   문서에 없는 질문 → ask() 답 → isRefusal (거절 문구가 나왔나) → 거절률
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ask, describeError } from "./ask.ts";
import { search, type SearchResult } from "./search.ts";

// 프로젝트 루트의 eval/questions.json (search.ts의 index.json과 같은 방식으로 경로를 잡는다).
const QUESTIONS_PATH = join(import.meta.dirname, "..", "eval", "questions.json");
const TOP_K = 3;
const REFUSAL = "문서에서 찾을 수 없습니다"; // ask.ts SYSTEM_PROMPT 규칙 3의 문구

// expectedSource가 null이면 "문서에 없는 질문" → 거절해야 정답.
type EvalItem = {
  question: string;
  type: string;
  expectedSource: string | null;
  expectedHeading?: string;
};

// 상위 결과 중 하나라도 기대 출처와 같고, (소제목을 적었다면) 소제목도 같으면 적중.
// 한 섹션이 여러 조각으로 나뉘어도(예: "관측 예약 방법") 조각 하나만 들어오면 적중으로 본다.
export function isHit(results: SearchResult[], expected: { expectedSource: string; expectedHeading?: string }): boolean {
  return results.some(
    ({ chunk }) =>
      chunk.source === expected.expectedSource &&
      (expected.expectedHeading === undefined || chunk.heading === expected.expectedHeading),
  );
}

// 완전 일치가 아니라 "포함": gemma3는 문구 끝에 마침표를 붙이기도 한다.
export function isRefusal(answer: string): boolean {
  return answer.includes(REFUSAL);
}

// 0.75 → "75%"
function percent(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

async function main(): Promise<void> {
  const items = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8")) as EvalItem[];
  const passedByType = new Map<string, { passed: number; total: number }>();
  let hits = 0;
  let refusals = 0;

  console.log(`#   결과  유형         질문  →  1위 조각 (점수)`);
  try {
    // Ollama에 한 번에 하나씩 보낸다 (동시에 보내면 로컬 모델이 느려지고 순서도 섞인다).
    for (const [i, item] of items.entries()) {
      let results: SearchResult[];
      let pass: boolean;
      let answer = "";
      if (item.expectedSource === null) {
        // 문서에 없는 질문만 LLM을 부른다. 검색 점수로는 "없다"를 판정할 수 없기 때문.
        ({ results, answer } = await ask(item.question, TOP_K));
        pass = isRefusal(answer);
        if (pass) refusals++;
      } else {
        results = await search(item.question, TOP_K);
        pass = isHit(results, { expectedSource: item.expectedSource, expectedHeading: item.expectedHeading });
        if (pass) hits++;
      }

      const counts = passedByType.get(item.type) ?? { passed: 0, total: 0 };
      counts.total++;
      if (pass) counts.passed++;
      passedByType.set(item.type, counts);

      const top = results[0];
      const topLabel = top ? `${top.score.toFixed(3)} ${top.chunk.source} > ${top.chunk.heading}` : "(결과 없음)";
      const num = String(i + 1).padStart(2);
      console.log(`${num}  ${pass ? "O" : "X"}     ${item.type.padEnd(6)}  ${item.question}  →  ${topLabel}`);
      if (item.expectedSource === null) {
        console.log(`                 답: ${answer.replace(/\s+/g, " ").slice(0, 60)}`);
      }
    }
  } catch (err) {
    console.error(describeError(err));
    process.exit(1);
  }

  const inDocs = items.filter((item) => item.expectedSource !== null).length;
  const outOfDocs = items.length - inDocs;
  console.log(`\nhit@${TOP_K}: ${hits}/${inDocs} (${percent(hits, inDocs)})`);
  console.log(`거절: ${refusals}/${outOfDocs} (${percent(refusals, outOfDocs)})`);
  console.log([...passedByType].map(([type, c]) => `${type} ${c.passed}/${c.total}`).join(" · "));
}

// 직접 실행(npm run eval)할 때만 main을 돈다. 테스트가 isHit·isRefusal을 import할 때는 돌지 않는다.
if (import.meta.filename === process.argv[1]) await main();
