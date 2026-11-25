# mini-RAG — learn RAG by building it, one step at a time

> **This is a study repository, not a product.**
> It builds a tiny Retrieval-Augmented Generation (RAG) pipeline from scratch, in small steps, so you can see exactly **how it works and what data moves between each part**.
> No frameworks, no vector database, no cloud API. Everything runs on your laptop with [Ollama](https://ollama.com).

Each step ("Phase") is its own pull request. The PR description explains what was built, how the data flows, what was learned, how to check it yourself, and the known limits. Read the PRs in order and you get a short course on RAG, backed by real code and real output.

## The pipeline you will build

```
Indexing (once, when the documents change)
  docs/*.md ──split──▶ 14 chunks ──bge-m3──▶ 1024 numbers per chunk ──▶ index.json (text + vector)

Answering (every question)
  question ──bge-m3──▶ 1024 numbers
     └─ compare with every chunk in index.json (cosine similarity) ──▶ top 3 chunks
          └─ [system rules] + [material: the 3 chunks] + [question] ──▶ gemma3 ──▶ answer with [n] citations
```

## Study path

Follow the phases in order. Each one starts with a concept, adds a small piece of code, and ends with something you can run and look at.

| Phase | Topic | What you learn | PR |
|---|---|---|---|
| 0 | Environment check | A local LLM is just an HTTP server; disk vs memory; chat model vs embedding model | [#1](https://github.com/yongmmin/mini-RAG/pull/1) |
| 1 | Source documents | Why "one section = one topic" matters; a deliberately missing topic; conflicting facts become wrong answers | [#2](https://github.com/yongmmin/mini-RAG/pull/2) |
| 2 | Chunking | Why not send the whole document; split by headings, not by character count; why each chunk gets a "Doc > Section" header | [#3](https://github.com/yongmmin/mini-RAG/pull/3) |
| 3 | Embedding + index | What "1024 dimensions" means; indexing happens ahead of time; why the index stores the text and the model name | [#4](https://github.com/yongmmin/mini-RAG/pull/4) |
| 4 | Retrieval | Cosine similarity by hand; real scores; search never says "nothing found" | [#5](https://github.com/yongmmin/mini-RAG/pull/5) |
| 5 | Generation | The exact messages the LLM receives; system vs user roles; a prompt example that leaked into answers | [#6](https://github.com/yongmmin/mini-RAG/pull/6) |
| 6 | Tuning experiments | Change one setting at a time; when retrieval is right but the answer is wrong; top-K trade-offs | [#7](https://github.com/yongmmin/mini-RAG/pull/7) |
| 7 | Evaluation | A fixed 18-question set; retrieval (hit@3) and refusals scored separately; a perfect score that still hides the chunk-level change seen in Phase 6 | [#9](https://github.com/yongmmin/mini-RAG/pull/9) |
| 8 | Hybrid search | Keyword search (BM25 over character bigrams) written by hand; merging two rankings by rank (RRF), not by score; a harder 25-question set where vector and keyword miss different questions | [#11](https://github.com/yongmmin/mini-RAG/pull/11) |

Each phase is one PR, so its diff shows only that phase. All of them are merged into `main`, and each phase's branch still exists: check one out (for example `git checkout feat/phase-4-search`) to see the repository as it was at that step.

The full original plan (in Korean) is in [PLAN.md](PLAN.md). The Phase 6–7 experiment results are in [NOTES.md](NOTES.md) (Korean). What to build next (scaling to many documents, images and video, and the next phases) is in [ROADMAP.md](ROADMAP.md) (Korean).

## Requirements

- Tested on macOS
- Node.js 24 (`.nvmrc` pins 24.22.1, use `nvm use`)
- [Ollama](https://ollama.com), running natively (on a Mac, Docker cannot use the Apple Silicon GPU and is very slow)

```bash
brew install ollama      # or install the Ollama app, which starts the server for you
ollama serve             # only if you did not install the app
ollama pull gemma3:4b    # chat model: reads the material and writes the answer
ollama pull bge-m3       # embedding model: turns text into 1024 numbers
```

## Run it

```bash
nvm use
npm install
npm run check                       # Node, Ollama server, models, chat call, embedding call
npm run ingest -- --dry-run         # show the chunks only
npm run ingest                      # embed the chunks and write index.json
npm run search "예약을 언제까지 취소할 수 있어?"   # top 3 chunks with scores
npm run search -- --mode hybrid "OBS-로 시작하는 번호는 뭐야?"   # --mode vector (default) | keyword | hybrid
npm run ask "예약을 언제까지 취소할 수 있어?"      # answer with [n] citations
npm run eval   # score retrieval (hit@3) and refusals on eval/questions.json
npm test
```

Models can be swapped with environment variables, for example `CHAT_MODEL=qwen3:8b npm run ask "..."`. If you change `EMBED_MODEL`, run `npm run ingest` again: vectors from different embedding models cannot be compared.

## A note on language

The sample documents, prompts and example questions are in **Korean**. They describe a fictional satellite-observation booking service called "Haneulchang" (하늘창). The code, the method and the lessons do not depend on the language. To study with your own material, replace the files in `docs/` and re-run `npm run ingest`.

## Ground rules

These rules keep the moving parts visible:

- **No RAG frameworks** (no LangChain or LlamaIndex). Every step is written by hand.
- **No vector database.** `index.json` is the vector store, and the search loop is a few lines of TypeScript.
- **No external LLM API.** Everything runs on a local Ollama server.
- **Minimal dependencies:** `openai` (used only as a client for Ollama's OpenAI-compatible API), `tsx`, `typescript`, `@types/node`.

## Repository layout

```
docs/               source documents (the knowledge the answers are based on)
eval/questions.json   fixed evaluation questions with the expected source section
scripts/check-env.ts  environment check
src/llm.ts          Ollama client, model names, embed()
src/chunk.ts        markdown → chunks
src/ingest.ts       chunks → embeddings → index.json
src/search.ts       cosine similarity and top-K retrieval
src/keyword.ts      bigram tokenizer and BM25 keyword scores
src/ask.ts          retrieved chunks + rules + question → answer
src/eval.ts         run the question set, print hit@3 and refusal scores
src/*.test.ts       tests (node:test)
NOTES.md            Phase 6–8 experiment log (Korean)
PLAN.md             the study plan (Korean)
ROADMAP.md          next steps: scaling, multimodal, next phases (Korean)
```
