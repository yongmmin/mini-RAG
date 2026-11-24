# mini-rag 구축 계획서 (로컬 LLM 버전)

> 이 문서는 Claude Code가 단계별로 따라 진행하기 위한 계획서다.
> 목적은 **동작하는 RAG를 만드는 것**과 동시에 **사용자가 RAG의 원리를 처음부터 이해하는 것**이다.
> 결과물보다 이해가 우선이다.

---

## 1. 목표

마크다운 문서 몇 개를 색인해 두고, 질문하면 관련 조각을 찾아 로컬 LLM이 **출처를 붙여** 답하는 CLI 프로그램을 만든다.

```
npm run ask "예약을 언제까지 취소할 수 있어?"
→ 관측 시작 1시간 전까지 취소할 수 있습니다 [1].
  출처: [1] observation.md > 예약 취소
```

## 2. 제약 조건 (반드시 지킬 것)

- **외부 LLM API 사용 금지.** 모든 모델 호출은 로컬 Ollama(`http://localhost:11434/v1`)로만 한다. API 키를 요구하는 코드를 넣지 않는다.
- **프레임워크 금지.** LangChain, LlamaIndex, Vercel AI SDK 등을 쓰지 않는다. RAG의 각 단계를 직접 코드로 짠다.
- **Vector DB 금지 (Phase 7까지).** 벡터 저장소는 `index.json` 파일로 대신한다.
- 허용 의존성: `openai`(Ollama의 OpenAI 호환 API 호출용 SDK), `tsx`, `typescript`, `@types/node`. 이 외의 패키지가 필요하면 추가 전에 사용자에게 이유를 설명하고 승인받는다.
- 언어: TypeScript, ESM, Node.js 20 이상.

## 3. 사용 모델

| 역할 | 모델 | 비고 |
|---|---|---|
| 생성 (답변 작성) | `gemma3:4b` | 대안: `qwen3:4b` (생각 과정 출력 모드가 기본이라 후처리 필요) |
| Embedding (벡터 변환) | `bge-m3` | 다국어 지원, 1024차원 |

모델 이름은 `src/llm.ts` 한 곳에서만 정의하고, 환경 변수(`CHAT_MODEL`, `EMBED_MODEL`)로 덮어쓸 수 있게 한다.

## 4. 사전 준비 (사용자가 직접 수행)

```bash
brew install ollama          # 또는 ollama.com 앱 설치 (앱이면 서버 자동 실행)
ollama serve                 # 앱 설치가 아니라면 별도 터미널에서 실행
ollama pull gemma3:4b
ollama pull bge-m3
```

> Mac에서는 Docker가 아닌 네이티브 Ollama를 쓴다. Docker 컨테이너에서는 Apple Silicon GPU를 쓰지 못해 매우 느리다.

## 5. 최종 디렉터리 구조

```
mini-rag/
├─ PLAN.md               ← 이 문서
├─ package.json
├─ tsconfig.json
├─ docs/                 ← 검색 대상 문서 (*.md)
├─ eval/
│  └─ questions.json     ← 평가셋
├─ scripts/
│  └─ check-env.ts       ← 환경 점검
├─ src/
│  ├─ llm.ts             ← Ollama 클라이언트 + 모델 설정 (유일한 설정 지점)
│  ├─ chunk.ts           ← 문서 자르기
│  ├─ ingest.ts          ← 자르기 → embedding → index.json 저장
│  ├─ search.ts          ← 질문과 가까운 조각 찾기
│  ├─ ask.ts             ← 검색 결과 + 질문 → LLM → 답 + 출처
│  └─ eval.ts            ← 평가셋 채점
└─ index.json            ← 생성물 (.gitignore에 추가)
```

## 6. 진행 규칙 (Claude Code 작업 방식)

1. **Phase 단위로 진행하고, 각 Phase가 끝나면 멈춘다.** 사용자에게 실행할 명령어와 기대 결과를 알려주고, 사용자가 확인한 뒤 다음 Phase로 넘어간다.
2. **각 Phase 시작 시 개념을 먼저 설명한다.** 이 단계가 RAG에서 무슨 역할인지, 왜 필요한지를 한국어로 쉽게 3~5문장으로 설명한 뒤 코드를 작성한다. 비유를 적극 활용한다.
3. **코드는 읽기 쉽게.** 짧은 함수, 명확한 이름, 핵심 줄에 한국어 주석. 영리한 최적화보다 이해하기 쉬운 코드를 우선한다.
4. **Phase마다 커밋한다.** 커밋 메시지 형식: `phase N: <내용>`.
5. **에러는 친절하게.** Ollama가 꺼져 있거나 모델이 없을 때, 원인과 해결 명령어를 출력하고 종료한다.
6. 이 계획서에 없는 기능을 임의로 추가하지 않는다. 개선 아이디어가 있으면 Phase 종료 시 제안만 한다.

---

## 7. Phase별 계획

### Phase 0. 환경 점검

**배우는 것:** 로컬 LLM은 레포 안이 아니라 옆에 떠 있는 서버이고, 코드는 HTTP로 요청만 보낸다는 구조.

**작업**
- `package.json`, `tsconfig.json`, `.gitignore`(`node_modules`, `index.json`) 생성
- `src/llm.ts`: OpenAI SDK를 `baseURL: "http://localhost:11434/v1"`, `apiKey: "ollama"`로 생성하여 export. `CHAT_MODEL`, `EMBED_MODEL` export (환경 변수 우선)
- `scripts/check-env.ts`: 다음을 순서대로 확인하고 결과를 ✅/❌로 출력
  1. Node.js 버전 20 이상
  2. Ollama 서버 응답 (`GET http://localhost:11434/api/tags`)
  3. `CHAT_MODEL`, `EMBED_MODEL`이 설치되어 있는지
  4. 생성 모델에 "안녕"을 보내 응답이 오는지 (hello world)
  5. embedding 모델로 "테스트"를 변환해 벡터 차원 수 출력
- npm script: `"check": "tsx scripts/check-env.ts"`

**완료 기준:** `npm run check`가 모두 ✅이고, LLM의 인사 응답과 embedding 차원(1024)이 출력된다.

---

### Phase 1. 검색 대상 문서 준비

**배우는 것:** RAG의 품질은 문서 품질에서 시작한다. 제목(`##`)으로 의미 단위가 잘 나뉜 문서가 잘 검색된다.

**작업**
- `docs/`에 가상의 위성 관측 서비스 문서 3개 작성 (각 3~5개 섹션)
  - `observation.md`: 관측 예약 방법, 예약 취소 규칙, 시간창 제한
  - `account.md`: 비밀번호 정책, 로그인 잠금, 권한 등급
  - `glossary.md`: TLE, pass, 지상국, UTC 등 용어 설명
- 의도적으로 **문서에 없는 주제**(예: 결제)를 정해 두고 Phase 7 평가셋에 사용

**완료 기준:** 사용자가 문서를 읽고 내용을 확인한다. 필요하면 실제 업무 문서로 교체해도 된다.

---

### Phase 2. 문서 자르기 (chunking)

**배우는 것:** 왜 문서를 통째로 주지 않고 잘라서 쓰는지, 왜 글자 수가 아니라 제목 기준으로 자르는지, 왜 조각 앞에 "문서명 > 소제목"을 붙이는지.

**작업**
- `src/chunk.ts`: `chunkMarkdown(source: string, markdown: string): ChunkDraft[]`
  - `##` 제목 기준으로 섹션 분리
  - 섹션이 `MAX_CHARS`(800)를 넘으면 문단 단위로 다시 분할
  - 각 조각 `text` 앞에 `"{문서 제목} > {소제목}\n"` 붙이기
  - 타입: `{ id, source, heading, text }`
- `ingest.ts`에 `--dry-run` 옵션: embedding 없이 잘린 조각 목록만 출력
- npm script: `"ingest": "tsx src/ingest.ts"`

**완료 기준:** `npm run ingest -- --dry-run`으로 조각 목록이 출력되고, 사용자가 조각이 의미 단위로 잘 나뉘었는지 눈으로 확인한다.

---

### Phase 3. 벡터로 바꿔 저장하기 (embedding + 색인)

**배우는 것:** embedding이 문장을 "의미 좌표"(숫자 배열)로 바꾸는 것이라는 점. 색인은 문서가 바뀔 때만 미리 해두는 작업이라는 점.

**작업**
- `ingest.ts`: 모든 조각을 `EMBED_MODEL`로 변환 (배치 처리, 진행 상황 출력)
- `index.json` 저장 형식:
  ```json
  {
    "embedModel": "bge-m3",
    "dimensions": 1024,
    "createdAt": "ISO 시각",
    "chunks": [{ "id": "...", "source": "...", "heading": "...", "text": "...", "embedding": [0.01, ...] }]
  }
  ```
- 저장 후 조각 수, 차원 수, 소요 시간 출력

**완료 기준:** `npm run ingest` 후 `index.json`이 생성되고, 사용자가 파일을 열어 조각마다 숫자 1024개가 붙어 있는 것을 확인한다.

---

### Phase 4. 가까운 조각 찾기 (retrieval)

**배우는 것:** 질문도 같은 모델로 좌표를 구해 cosine similarity로 비교한다는 것. 색인과 검색에 **반드시 같은 embedding 모델**을 써야 하는 이유.

**작업**
- `src/search.ts`: `search(question: string, topK = 3)`
  - `index.json` 로드
  - **안전장치:** `index.json`의 `embedModel`이 현재 `EMBED_MODEL`과 다르면 "재색인 필요" 에러로 종료
  - 질문 embedding → 모든 조각과 cosine similarity 계산 → 상위 `topK` 반환
  - cosine 함수는 직접 구현 (라이브러리 금지)
- CLI: `npm run search "질문"` → 점수, 출처, 본문 앞부분 출력
- npm script: `"search": "tsx src/search.ts"`

**완료 기준:** 사용자가 아래 질문을 직접 실행하고 결과를 관찰한다.
- 문서에 단어가 그대로 있는 질문 ("예약 취소")
- 단어는 다르지만 의미가 같은 질문 ("로그인 계속 틀리면?") → 비밀번호 정책이 상위에 오는지
- 문서에 없는 질문 ("결제 방법") → 점수가 전반적으로 낮은지

---

### Phase 5. 답 생성하기 (generation)

**배우는 것:** 검색 결과를 prompt에 끼워 넣는 방식, Chat Completions의 messages 구조(system/user), 환각을 막는 system prompt 작성법.

**작업**
- `src/ask.ts`: `ask(question: string)`
  - `search()` 결과에 `[1]`, `[2]` 번호를 붙여 context 구성
  - system prompt 규칙:
    - 주어진 [자료]만 근거로 답할 것
    - 문장마다 근거 번호 `[n]`를 붙일 것
    - 자료에 없으면 "문서에서 찾을 수 없습니다"라고만 답할 것
  - `temperature: 0`
  - 출력: 검색된 조각과 점수(디버깅용) → 답변 → 출처 목록
- npm script: `"ask": "tsx src/ask.ts"`

**완료 기준:** Phase 4의 세 질문을 `npm run ask`로 실행하고, 특히 문서에 없는 질문에서 모델이 지어내는지 관찰한다. (소형 모델은 지어낼 수 있다. 이건 실패가 아니라 관찰 포인트다.)

---

### Phase 6. 관찰하고 튜닝해 보기

**배우는 것:** RAG가 틀리는 원인은 대부분 LLM이 아니라 검색이라는 것. 설정 하나가 결과를 어떻게 바꾸는지.

**작업** (코드 변경은 최소화, 설정값 위주)
- 아래 실험을 사용자와 하나씩 진행하고, 각 결과를 `NOTES.md`에 기록
  1. `MAX_CHARS`를 300 / 800 / 2000으로 바꿔 재색인 → 검색 결과 비교
  2. 조각 앞 "문서명 > 소제목" 접두어를 뺐을 때 검색 점수 변화
  3. `topK`를 1 / 3 / 5로 바꿨을 때 답변 변화
  4. system prompt에서 "모르면 모른다고 하라" 규칙을 뺐을 때 변화
  5. `CHAT_MODEL`을 다른 소형 모델로 바꿨을 때 차이

**완료 기준:** `NOTES.md`에 실험별 관찰 내용이 정리된다.

---

### Phase 7. 평가 자동화

**배우는 것:** 평가셋 없이는 개선했는지 알 수 없다는 것. 검색 평가와 답변 평가를 분리해서 보는 방법.

**작업**
- `eval/questions.json`: 15~20개 항목
  ```json
  [
    { "question": "예약은 언제까지 취소돼?", "expectedSource": "observation.md", "expectedHeading": "예약 취소" },
    { "question": "결제는 어떤 카드로 해?", "expectedSource": null }
  ]
  ```
  - `expectedSource: null`은 "문서에 없는 질문" (거절해야 정답)
  - 표현을 바꾼 질문, 용어를 쓴 질문, 문서에 없는 질문을 고르게 섞는다
- `src/eval.ts`:
  - **검색 평가:** 기대 출처가 상위 3개 안에 있는 비율 (hit@3)
  - **거절 평가:** 문서에 없는 질문에 "문서에서 찾을 수 없습니다"로 답한 비율
  - 항목별 통과/실패 표 + 요약 점수 출력
- npm script: `"eval": "tsx src/eval.ts"`

**완료 기준:** `npm run eval`로 점수가 나오고, Phase 6의 설정 변경 하나를 다시 적용해 점수가 어떻게 변하는지 확인한다.

---

## 8. 이번 범위에서 하지 않는 것 (다음 단계 후보)

아래는 Phase 7까지 끝낸 뒤 사용자가 원할 때 별도 계획으로 진행한다.

- **pgvector 전환:** `index.json` → Postgres + `pgvector` (Docker), `search.ts`의 비교 루프를 SQL로 대체
- **Hybrid search:** 키워드 검색(full-text search)과 벡터 검색 결합
- **증분 색인:** 문서 content hash를 저장해 바뀐 문서만 재색인
- **MCP 서버화:** `search`를 `search_docs` tool로 감싸 Claude Code 등에서 호출
- **NestJS 모듈화:** `KnowledgeModule`로 옮겨 서비스 아키텍처에 통합
- **LangChain 비교:** 같은 기능을 프레임워크로 구현해 직접 구현과 비교

## 9. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:11434` | Ollama 서버가 꺼져 있음 | `ollama serve` 또는 Ollama 앱 실행 |
| `model not found` | 모델 미설치 | `ollama pull <모델명>` |
| 검색 시 "재색인 필요" | embedding 모델이 바뀜 | `npm run ingest` 재실행 |
| 첫 응답이 매우 느림 | 모델을 메모리에 올리는 중 | 정상. 두 번째 호출부터 빨라짐 |
| 답변에 `<think>` 같은 태그 | qwen3 계열의 생각 출력 모드 | `gemma3:4b` 사용 또는 해당 태그 제거 후처리 |
