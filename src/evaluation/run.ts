// 평가 실행: 고정된 질문 묶음(eval/questions.json)을 한 번에 돌려 점수를 낸다. 검색과 답변(거절)을 따로 채점한다.
// 데이터 흐름: questions.json → 항목마다
//   문서에 있는 질문 → embed 1회 → 모든 검색 방식(vector / keyword / hybrid) 각각 상위 3개 → isHit (기대 출처·소제목이 들어 있나) → 방식별 hit@1·hit@3
//   문서에 없는 질문 → ask() 답 (기본 방식 vector) → isRefusal (거절 문구가 나왔나) → 거절률
// 출력은 하지 않는다: 문항마다 onRow로 결과를 넘기고, 끝나면 집계 객체를 돌려준다 (표 모양은 cli/eval.ts가 정한다).
import { readFileSync } from "node:fs";
import { QUESTIONS_PATH, TOP_K } from "../config.ts";
import { ask } from "../generation/ask.ts";
import { embed } from "../llm.ts";
import { RANKERS, SEARCH_MODES } from "../retrieval/search.ts";
import { readIndex } from "../store/json-store.ts";
import type { SearchMode, SearchResult } from "../types.ts";
import { isHit, isRefusal } from "./score.ts";

// expectedSource가 null이면 "문서에 없는 질문" → 거절해야 정답.
type EvalItem = {
  question: string;
  type: string;
  expectedSource: string | null;
  expectedHeading?: string;
};

// 방식 하나의 집계: 전체 hit@1·hit@3 + 유형별.
type ModeStats = { hit1: number; hit3: number; byType: Map<string, { hit1: number; hit3: number; total: number }> };

// 문항 하나의 결과. refusal = 문서에 없는 질문(답을 채점), retrieval = 문서에 있는 질문(방식별 검색을 채점).
export type EvalRow =
  | { kind: "refusal"; item: EvalItem; pass: boolean; answer: string }
  | {
      kind: "retrieval";
      item: EvalItem;
      hits: Record<SearchMode, { hit1: boolean; hit3: boolean }>;
      ranked: Record<SearchMode, SearchResult[]>;
    };

export type EvalSummary = {
  stats: Map<SearchMode, ModeStats>; // SEARCH_MODES 순서
  refusals: number;
  inDocs: number; // 문서에 있는 질문 수 (hit의 분모)
  outOfDocs: number; // 문서에 없는 질문 수 (거절의 분모)
};

export function loadQuestions(path = QUESTIONS_PATH): EvalItem[] {
  return JSON.parse(readFileSync(path, "utf8")) as EvalItem[];
}

// 에러는 throw 한다 (중간에 멈추면 그때까지의 onRow만 불린 상태). 종료·안내는 호출한 쪽이 정한다.
export async function runEval(items: EvalItem[], onRow: (row: EvalRow, index: number) => void): Promise<EvalSummary> {
  const stats = new Map<SearchMode, ModeStats>(SEARCH_MODES.map((mode) => [mode, { hit1: 0, hit3: 0, byType: new Map() }]));
  let refusals = 0;

  const { chunks } = readIndex(); // 색인은 한 번만 읽는다
  // Ollama에 한 번에 하나씩 보낸다 (동시에 보내면 로컬 모델이 느려지고 순서도 섞인다).
  for (const [i, item] of items.entries()) {
    if (item.expectedSource === null) {
      // 문서에 없는 질문만 LLM을 부른다. 검색 점수로는 "없다"를 판정할 수 없기 때문. (기본 방식 vector, Phase 7과 같음)
      const { answer } = await ask(item.question, { topK: TOP_K });
      const pass = isRefusal(answer);
      if (pass) refusals++;
      onRow({ kind: "refusal", item, pass, answer }, i);
      continue;
    }

    // 질문 embedding은 한 번만 만들어 벡터가 필요한 방식(vector, hybrid)이 같이 쓴다. keyword는 embedding이 필요 없다.
    const [queryVector] = await embed([item.question]);
    const query = { text: item.question, vector: queryVector };
    const expected = { expectedSource: item.expectedSource, expectedHeading: item.expectedHeading };
    const ranked = {} as Record<SearchMode, SearchResult[]>;
    const hits = {} as Record<SearchMode, { hit1: boolean; hit3: boolean }>;

    for (const mode of SEARCH_MODES) {
      ranked[mode] = RANKERS[mode].rank(query, chunks, TOP_K);
      const hit1 = isHit(ranked[mode], expected, 1);
      const hit3 = isHit(ranked[mode], expected, TOP_K);
      hits[mode] = { hit1, hit3 };
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
    }
    onRow({ kind: "retrieval", item, hits, ranked }, i);
  }

  const inDocs = items.filter((item) => item.expectedSource !== null).length;
  return { stats, refusals, inDocs, outOfDocs: items.length - inDocs };
}
