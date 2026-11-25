// 환경 점검: Node → Ollama 서버 → 모델 설치 → 생성 모델 → embedding 모델 순서로 확인한다.
// 뒤 단계는 앞 단계가 성공해야 의미가 있으므로, 첫 실패에서 원인과 해결 명령을 출력하고 멈춘다.
import { CHAT_MODEL, EMBED_MODEL, OLLAMA_URL } from "../src/config.ts";
import { llm } from "../src/llm.ts";

// 실패를 출력하고 프로세스를 종료한다. 호출한 쪽은 이 줄 다음으로 진행하지 않는다.
function fail(title: string, cause: string, fix: string): never {
  console.log(`❌ ${title}`);
  console.log(`   원인: ${cause}`);
  console.log(`   해결: ${fix}`);
  process.exit(1);
}

// 1. Node 버전: process.versions.node 는 "24.22.1" 같은 문자열이다. 앞자리(major)만 비교한다.
function checkNode(): void {
  const version = process.versions.node;
  const major = Number(version.split(".")[0]);
  if (major < 24) {
    fail(`Node.js ${version}`, "Node.js 24 이상이 필요하다 (.nvmrc = 24.22.1)", "nvm use   (.nvmrc 를 읽어 24.22.1 로 전환)");
  }
  console.log(`✅ Node.js ${version}`);
}

// 2. Ollama 서버: 여기서 HTTP GET으로 Ollama에 설치된 모델 목록을 물어본다. 응답이 오면 서버가 떠 있다는 뜻이다.
async function checkOllamaServer(): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/tags`);
  } catch (error) {
    // 서버가 꺼져 있으면 fetch 는 TypeError("fetch failed")를 던지고, 진짜 원인은 error.cause.code(ECONNREFUSED = 연결 거부)에 들어 있다.
    const code = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
    fail(`Ollama 서버 (${OLLAMA_URL})`, `연결 실패 (${code ?? String(error)}) — 서버가 꺼져 있다`, "ollama serve   (또는 Ollama 앱 실행)");
  }
  if (!response.ok) {
    fail(`Ollama 서버 (${OLLAMA_URL})`, `HTTP ${response.status} 응답`, "ollama serve   (또는 Ollama 앱 재시작)");
  }
  // 응답 모양: { models: [{ name: "gemma3:4b", ... }, { name: "bge-m3:latest", ... }] }
  const body = (await response.json()) as { models: { name: string }[] };
  console.log(`✅ Ollama 서버 응답 (${OLLAMA_URL}) — 설치된 모델 ${body.models.length}개`);
  return body.models.map((model) => model.name);
}

// 3. 모델 설치 여부: Ollama는 태그 없이 받은 모델을 "bge-m3:latest" 로 보여주므로 ":latest" 를 붙인 이름도 같은 모델로 본다.
function checkModelInstalled(model: string, installed: string[]): void {
  if (!installed.includes(model) && !installed.includes(`${model}:latest`)) {
    fail(`모델 ${model}`, "Ollama에 설치되어 있지 않다", `ollama pull ${model}`);
  }
  console.log(`✅ 모델 ${model} 설치됨`);
}

// 4. 생성 모델: POST /v1/chat/completions 로 "안녕"을 보내고 답장을 받는다.
async function checkChat(): Promise<void> {
  try {
    const completion = await llm.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "안녕" }],
    });
    const reply = completion.choices[0]?.message.content ?? "";
    console.log(`✅ 생성 모델 응답 (${CHAT_MODEL}): ${reply.trim()}`);
  } catch (error) {
    fail(`생성 모델 ${CHAT_MODEL}`, String(error), `CHAT_MODEL 이 생성(chat) 모델인지 확인 — 예: CHAT_MODEL=gemma3:4b npm run check`);
  }
}

// 5. embedding 모델: POST /v1/embeddings 로 "테스트"를 숫자 배열(벡터)로 바꾼다. 벡터는 그냥 숫자들의 목록이다.
async function checkEmbedding(): Promise<void> {
  try {
    const result = await llm.embeddings.create({ model: EMBED_MODEL, input: "테스트" });
    const vector = result.data[0]?.embedding ?? [];
    const preview = vector.slice(0, 5).map((n) => n.toFixed(4)).join(", ");
    console.log(`✅ embedding 모델 (${EMBED_MODEL}): ${vector.length}차원 [${preview}, ...]`);
  } catch (error) {
    fail(`embedding 모델 ${EMBED_MODEL}`, String(error), `EMBED_MODEL 이 embedding 모델인지 확인 — 예: EMBED_MODEL=bge-m3 npm run check`);
  }
}

async function main(): Promise<void> {
  console.log(`점검 대상 — CHAT_MODEL=${CHAT_MODEL}, EMBED_MODEL=${EMBED_MODEL}\n`);
  checkNode();
  const installed = await checkOllamaServer();
  checkModelInstalled(CHAT_MODEL, installed);
  checkModelInstalled(EMBED_MODEL, installed);
  await checkChat();
  await checkEmbedding();
  console.log("\n모든 점검 통과");
}

await main();
