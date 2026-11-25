// 공유 데이터 모양: 층과 층 사이를 오가는 데이터의 타입만 둔다 (코드 없음).
// 데이터 흐름: SourceDocument → ChunkDraft → IndexedChunk(IndexFile에 저장) → SearchResult.

// 읽어 들인 원본 문서 하나. ingest/load.ts가 만들고 ingest/indexer.ts가 자른다.
// 새 입력 형식(이미지·PDF)도 이 모양으로 바꿔 넘기면 뒤 단계는 그대로 쓴다.
export type SourceDocument = {
  source: string; // 파일 이름. 조각 id와 답변의 출처 표시에 쓴다
  text: string; // 문서 본문 (지금은 마크다운)
};

// 아직 embedding이 붙지 않은 조각. Phase 3에서 여기에 embedding(숫자 배열)이 더해진다.
export type ChunkDraft = {
  id: string; // "observation.md#2" = 파일 이름 + 파일 안 순번(0부터)
  source: string; // 파일 이름. 답변의 출처 표시에 쓴다
  heading: string; // ## 소제목 (첫 ## 이전 본문이면 문서 제목)
  text: string; // "문서 제목 > 소제목\n본문" — embedding과 LLM에 실제로 들어가는 글
};

// index.json 한 조각 = Phase 2 조각(id, source, heading, text) + 그 text의 벡터.
export type IndexedChunk = ChunkDraft & { embedding: number[] };
export type IndexFile = {
  embedModel: string; // 검색할 때 질문도 같은 모델로 바꿔야 하므로 기록해 둔다
  dimensions: number; // 벡터 길이 (bge-m3 = 1024)
  createdAt: string; // ISO 시각
  chunks: IndexedChunk[];
};

// score는 방식마다 단위가 다르다: vector = cosine(-1~1), keyword = BM25(0 이상, 상한 없음), hybrid = RRF(작은 양수).
export type SearchResult = { score: number; chunk: IndexedChunk };

export type SearchMode = "vector" | "keyword" | "hybrid";
