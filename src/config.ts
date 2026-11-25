// 설정값 한 곳: 경로, Ollama 주소·모델, 자르기·검색·평가의 숫자들. 실험할 때 이 파일만 열면 된다.
// 이 파일은 아무것도 import하지 않는 맨 아래 층이다 (node:path 제외). 다른 모든 층이 여기서 값을 읽는다.
import { join } from "node:path";

// 이 파일(src/config.ts) 기준으로 한 단계 위 = 프로젝트 루트. 어느 폴더에서 실행해도 같은 파일을 읽는다.
const ROOT = join(import.meta.dirname, "..");
export const DOCS_DIR = join(ROOT, "docs");
export const INDEX_PATH = join(ROOT, "index.json");
export const QUESTIONS_PATH = join(ROOT, "eval", "questions.json");

// Ollama는 레포 안이 아니라 내 컴퓨터에서 따로 떠 있는 HTTP 서버다. 코드는 이 주소로 요청만 보낸다.
export const OLLAMA_URL = "http://localhost:11434";

// 환경 변수가 있으면 그것을, 없으면 기본 모델을 쓴다. (예: CHAT_MODEL=qwen3:4b npm run check)
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gemma3:4b";
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "bge-m3";

// 조각 본문의 최대 글자 수(머리말 제외). Phase 6에서 이 값을 직접 바꿔 가며 실험한다.
export const MAX_CHARS = 800;

// 한 번의 HTTP 요청에 보낼 조각 수. 14조각이면 8 + 6 = 요청 2번.
export const BATCH_SIZE = 8;

// 검색 결과로 가져올 조각 수 (search·ask·eval 기본값). eval의 hit@3도 이 값이다.
export const TOP_K = 3;

// BM25 상수: 보통 쓰는 기본값.
export const BM25 = {
  k1: 1.2, // TF 포화 정도: 같은 토큰이 여러 번 나와도 점수가 무한히 커지지 않게 한다 (클수록 늦게 포화)
  b: 0.75, // 길이 보정 세기: 0이면 길이 무시, 1이면 길이에 완전히 비례해 깎는다
};

// RRF의 k: 1위와 2위의 차이를 줄여, 한 방식의 1위가 혼자 결과를 결정하지 못하게 한다.
export const RRF_K = 60;

// hybrid가 합치기 전에 각 방식에서 가져오는 후보 수. 조각이 14개뿐이라 10이면 거의 전부를 본다.
export const HYBRID_POOL = 10;

// 거절 문구: SYSTEM_PROMPT 규칙 3이 모델에게 시키는 말이자, eval이 거절로 채점하는 기준.
export const REFUSAL_PHRASE = "문서에서 찾을 수 없습니다";
