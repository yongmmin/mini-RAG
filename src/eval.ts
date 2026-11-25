// 평가: 고정된 질문 묶음(eval/questions.json)을 한 번에 돌려 점수를 낸다. 검색과 답변(거절)을 따로 채점한다.
// 데이터 흐름: questions.json → 항목마다
//   문서에 있는 질문 → embed 1회 → vector / keyword / hybrid 각각 상위 3개 → isHit (기대 출처·소제목이 들어 있나) → 방식별 hit@1·hit@3
//   문서에 없는 질문 → ask() 답 (기본 방식 vector) → isRefusal (거절 문구가 나왔나) → 거절률
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ask, describeError } from "./ask.ts";
import { embed } from "./llm.ts";
import { loadIndex, rankChunks, rankHybrid, rankKeyword, type SearchMode, type SearchResult } from "./search.ts";

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

// 상위 k개 중 하나라도 기대 출처와 같고, (소제목을 적었다면) 소제목도 같으면 적중. k=1이면 hit@1, k=3이면 hit@3.
// 한 섹션이 여러 조각으로 나뉘어도(예: "관측 예약 방법") 조각 하나만 들어오면 적중으로 본다.
export function isHit(
  results: SearchResult[],
  expected: { expectedSource: string; expectedHeading?: string },
  k = TOP_K,
): boolean {
  return results.slice(0, k).some(
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

// 방식 하나의 집계: 전체 hit@1·hit@3 + 유형별.
type ModeStats = { hit1: number; hit3: number; byType: Map<string, { hit1: number; hit3: number; total: number }> };

// 1위 조각 한 줄: "0.745 관측 예약 방법" (keyword는 겹치는 토큰이 없으면 결과가 없을 수 있다)
// RRF 점수는 최대 2/61 ≈ 0.0328이라 소수 셋째 자리까지면 다 0.033으로 보인다 → hybrid만 넷째 자리까지.
function topLabel(results: SearchResult[], mode: SearchMode): string {
  const top = results[0];
  return top ? `${top.score.toFixed(mode === "hybrid" ? 4 : 3)} ${top.chunk.heading}` : "(결과 없음)";
}

async function main(): Promise<void> {
  const items = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8")) as EvalItem[];
  const modes: SearchMode[] = ["vector", "keyword", "hybrid"];
  const stats = new Map<SearchMode, ModeStats>(modes.map((mode) => [mode, { hit1: 0, hit3: 0, byType: new Map() }]));
  let refusals = 0;

  // 문항별 표: 방식마다 두 글자 = hit@1, hit@3 (O 맞음 / X 틀림). 예: "XO" = 1위는 틀렸지만 상위 3개 안에는 있음.
  console.log(`#   vector keyword hybrid  유형     질문`);
  console.log(`                                    └ 방식별 1위 조각 (점수)`);
  try {
    const { chunks } = loadIndex(); // 색인은 한 번만 읽는다
    // Ollama에 한 번에 하나씩 보낸다 (동시에 보내면 로컬 모델이 느려지고 순서도 섞인다).
    for (const [i, item] of items.entries()) {
      const num = String(i + 1).padStart(2);
      if (item.expectedSource === null) {
        // 문서에 없는 질문만 LLM을 부른다. 검색 점수로는 "없다"를 판정할 수 없기 때문. (기본 방식 vector, Phase 7과 같음)
        const { answer } = await ask(item.question, TOP_K);
        const pass = isRefusal(answer);
        if (pass) refusals++;
        console.log(`${num}  거절 ${pass ? "O" : "X"}                ${item.type.padEnd(6)}  ${item.question}`);
        console.log(`                                    └ 답: ${answer.replace(/\s+/g, " ").slice(0, 60)}`);
        continue;
      }

      // 질문 embedding은 한 번만 만들어 vector와 hybrid가 같이 쓴다. keyword는 embedding이 필요 없다.
      const [queryVector] = await embed([item.question]);
      const ranked: Record<SearchMode, SearchResult[]> = {
        vector: rankChunks(queryVector, chunks, TOP_K),
        keyword: rankKeyword(item.question, chunks, TOP_K),
        hybrid: rankHybrid(queryVector, item.question, chunks, TOP_K),
      };
      const expected = { expectedSource: item.expectedSource, expectedHeading: item.expectedHeading };

      const cells: string[] = [];
      for (const mode of modes) {
        const hit1 = isHit(ranked[mode], expected, 1);
        const hit3 = isHit(ranked[mode], expected, TOP_K);
        const s = stats.get(mode)!;
        const t = s.byType.get(item.type) ?? { hit1: 0, hit3: 0, total: 0 };
        t.total++;
        if (hit1) {
          s.hit1++;
          t.hit1++;
        }
        if (hit3) {
          s.hit3++;
          t.hit3++;
        }
        s.byType.set(item.type, t);
        cells.push(`${hit1 ? "O" : "X"}${hit3 ? "O" : "X"}`);
      }
      console.log(`${num}  ${cells[0]}     ${cells[1]}      ${cells[2]}      ${item.type.padEnd(6)}  ${item.question}`);
      console.log(`                                    └ ${modes.map((mode) => `${mode} ${topLabel(ranked[mode], mode)}`).join(" | ")}`);
    }
  } catch (err) {
    console.error(describeError(err));
    process.exit(1);
  }

  const inDocs = items.filter((item) => item.expectedSource !== null).length;
  const outOfDocs = items.length - inDocs;
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

// 직접 실행(npm run eval)할 때만 main을 돈다. 테스트가 isHit·isRefusal을 import할 때는 돌지 않는다.
if (import.meta.filename === process.argv[1]) await main();
