// 키워드 검색: 질문과 조각에 "같은 글자 조각"이 얼마나, 얼마나 드물게 겹치는지로 점수를 매긴다 (BM25). embedding 없음.
// 데이터 흐름: 질문 문자열 → tokenize() → 질문 토큰들 → (조각 text마다 tokenize → BM25) → 조각별 점수.

// 한국어는 띄어쓰기 단위가 단어가 아니다 ("예약을", "예약은", "예약하려면"). 형태소 분석기 대신 글자 2개씩 겹쳐 자르면(bigram)
// 조사·어미가 달라도 "예약" 토큰은 똑같이 나온다. 대신 "약을", "약은" 같은 뜻 없는 토큰도 함께 생긴다.
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 소문자로 바꾸고(TLE = tle) 공백·문장부호·기호(- : > ( ) 등)에서 자른다. \p{P}=문장부호, \p{S}=기호.
  for (const piece of text.toLowerCase().split(/[\s\p{P}\p{S}]+/u)) {
    const chars = [...piece]; // 글자 단위 배열 (한글 한 글자 = 한 칸)
    if (chars.length === 1) tokens.push(piece); // 1글자 토막("a", "5")은 자를 게 없으니 그대로
    for (let i = 0; i + 1 < chars.length; i++) tokens.push(chars[i] + chars[i + 1]); // "예약을" → "예약", "약을"
  }
  return tokens;
}

// BM25 상수: 보통 쓰는 기본값.
const K1 = 1.2; // TF 포화 정도: 같은 토큰이 여러 번 나와도 점수가 무한히 커지지 않게 한다 (클수록 늦게 포화)
const B = 0.75; // 길이 보정 세기: 0이면 길이 무시, 1이면 길이에 완전히 비례해 깎는다

// 질문 토큰마다 "이 조각에 몇 번 나오나(TF)" × "전체 조각 중 얼마나 드문가(IDF)"를 더한다. 조각 순서 그대로 점수 배열을 돌려준다.
// 조각 통계는 index.json의 text로 질문할 때마다 계산한다 (조각 14개라 충분히 빠르다). (순수 함수: 파일·네트워크 없음)
export function bm25Scores(queryTokens: string[], chunks: { text: string }[]): number[] {
  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length; // 조각 평균 토큰 수
  const terms = [...new Set(queryTokens)]; // 질문에 같은 토큰이 두 번 나와도 한 번만 센다

  // IDF(역문서 빈도): 그 토큰이 든 조각이 적을수록 크다. 모든 조각에 있는 "관측" 같은 토큰은 구분에 도움이 안 되니 작게.
  // N = 전체 조각 수, df = 토큰이 들어 있는 조각 수. 앞의 1 + 는 점수가 음수가 되지 않게 하는 흔한 변형이다.
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = docs.filter((doc) => doc.includes(term)).length;
    idf.set(term, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)));
  }

  return docs.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const tf = doc.filter((token) => token === term).length; // TF: 이 조각에 그 토큰이 나온 횟수
      if (tf === 0) continue;
      // 길이 보정: 평균보다 긴 조각은 우연히 토큰이 들어 있을 확률이 높으니 분모를 키워 점수를 깎는다.
      const lengthNorm = 1 - B + B * (doc.length / avgLength);
      // TF 포화: tf가 1 → 2 → 3으로 늘어도 점수는 (K1 + 1)에 가까워질 뿐 계속 비례해 커지지 않는다.
      score += idf.get(term)! * ((tf * (K1 + 1)) / (tf + K1 * lengthNorm));
    }
    return score;
  });
}
