// 문서 자르기(chunking): 마크다운 문자열 하나 → 검색 단위 조각(ChunkDraft) 배열.
// 파일을 읽지 않는 순수 함수만 둔다. 파일 읽기는 ingest.ts가 맡는다.

// 조각 본문의 최대 글자 수(머리말 제외). Phase 6에서 이 값을 직접 바꿔 가며 실험한다.
export const MAX_CHARS = 800;

// 아직 embedding이 붙지 않은 조각. Phase 3에서 여기에 embedding(숫자 배열)이 더해진다.
export type ChunkDraft = {
  id: string; // "observation.md#2" = 파일 이름 + 파일 안 순번(0부터)
  source: string; // 파일 이름. 답변의 출처 표시에 쓴다
  heading: string; // ## 소제목 (첫 ## 이전 본문이면 문서 제목)
  text: string; // "문서 제목 > 소제목\n본문" — embedding과 LLM에 실제로 들어가는 글
};

// ## 하나 = 섹션 하나. 아직 길이로 나누기 전 상태다.
type Section = { heading: string; body: string };

// 문서 제목 = 첫 "# " 줄. 없으면 파일 이름을 제목으로 쓴다.
function findTitle(source: string, lines: string[]): string {
  const titleLine = lines.find((line) => line.startsWith("# "));
  return titleLine ? titleLine.slice(2).trim() : source;
}

// 줄 단위로 훑으며 "## " 줄을 만날 때마다 새 섹션을 연다.
// 첫 ## 이전 본문도 버리지 않도록, 처음 섹션의 heading은 문서 제목으로 시작한다.
function splitSections(lines: string[], title: string): Section[] {
  const sections: Section[] = [];
  let heading = title;
  let bodyLines: string[] = [];
  let titleSkipped = false;

  const closeSection = () => sections.push({ heading, body: bodyLines.join("\n").trim() });

  for (const line of lines) {
    if (line.startsWith("## ")) {
      closeSection();
      heading = line.slice(3).trim();
      bodyLines = [];
    } else if (!titleSkipped && line.startsWith("# ")) {
      titleSkipped = true; // 제목 줄은 머리말로 들어가므로 본문에서는 뺀다
    } else {
      bodyLines.push(line);
    }
  }
  closeSection();

  // 빈 섹션(제목만 있고 본문 없음)은 검색할 내용이 없으니 버린다
  return sections.filter((section) => section.body.length > 0);
}

// 긴 본문 → MAX_CHARS 이하 조각들. 빈 줄로 문단을 나눈 뒤 앞에서부터 넘치기 직전까지 이어 붙인다(greedy).
function splitLongBody(body: string): string[] {
  if (body.length <= MAX_CHARS) return [body];

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const pieces: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const joined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (joined.length <= MAX_CHARS || current === "") {
      // shortcut: 문단 하나가 MAX_CHARS보다 길면 자르지 않고 한 조각으로 둔다, 그런 문단이 생기면 문장 단위 분할을 추가
      current = joined;
    } else {
      pieces.push(current);
      current = paragraph;
    }
  }
  pieces.push(current);
  return pieces;
}

// 마크다운 한 파일 → 조각 배열. 같은 섹션에서 나온 조각은 모두 같은 머리말을 단다.
export function chunkMarkdown(source: string, markdown: string): ChunkDraft[] {
  const lines = markdown.split(/\r?\n/);
  const title = findTitle(source, lines);

  // 섹션마다 본문을 길이 기준으로 나눈 뒤, 조각 하나하나에 머리말을 붙인다
  const pieces = splitSections(lines, title).flatMap((section) =>
    splitLongBody(section.body).map((body) => ({ heading: section.heading, body })),
  );

  return pieces.map((piece, index) => ({
    id: `${source}#${index}`,
    source,
    heading: piece.heading,
    // 머리말: 조각만 떼어 봐도 어느 문서의 어느 주제인지 알 수 있게 한다
    text: `${title} > ${piece.heading}\n${piece.body}`,
  }));
}
