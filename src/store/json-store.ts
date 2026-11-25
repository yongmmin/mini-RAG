// 저장소: 색인(IndexFile)을 index.json 파일로 쓰고 읽는다. 읽을 때 embedding 모델이 맞는지도 확인한다.
// 확장 자리: pgvector 같은 다른 저장소로 바꿀 때 같은 readIndex / writeIndex 모양의 파일을 이 폴더에 더한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EMBED_MODEL, INDEX_PATH } from "../config.ts";
import { IndexError } from "../errors.ts";
import type { IndexFile } from "../types.ts";

// 안전장치: 다른 모델로 만든 벡터끼리는 좌표계가 달라 비교 자체가 의미 없다. 색인 모델 ≠ 현재 모델이면 멈춘다.
export function checkEmbedModel(indexModel: string, currentModel: string): void {
  if (indexModel !== currentModel) {
    throw new IndexError(
      `index.json은 '${indexModel}'로 만들었는데 현재 EMBED_MODEL은 '${currentModel}'이다. 재색인 필요: npm run ingest`,
    );
  }
}

// index.json을 읽고 모델이 맞는지 확인한다. 문제가 있으면 throw (종료는 호출한 쪽이 결정한다).
export function readIndex(path = INDEX_PATH): IndexFile {
  if (!existsSync(path)) {
    throw new IndexError(`index.json이 없다. 먼저 색인을 만든다: npm run ingest`);
  }
  const index = JSON.parse(readFileSync(path, "utf8")) as IndexFile;
  checkEmbedModel(index.embedModel, EMBED_MODEL);
  return index;
}

// 통째로 한 번에 덮어쓴다. 들여쓰기 2칸 = 사람이 열어 볼 수 있게.
export function writeIndex(index: IndexFile, path = INDEX_PATH): void {
  writeFileSync(path, JSON.stringify(index, null, 2));
}
