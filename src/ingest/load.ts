// 문서 읽기(입구): 폴더 → 원본 문서({source, text}) 배열. 자르기·embedding은 모른다.
// 확장 자리: 새 입력 형식(이미지·PDF 등)은 여기에 형식별 loader를 더해 같은 SourceDocument 모양으로 돌려준다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DOCS_DIR } from "../config.ts";
import type { SourceDocument } from "../types.ts";

// dir 안의 *.md 파일을 이름순으로 읽는다. 파일 이름 → 문자열.
export function loadDocuments(dir = DOCS_DIR): SourceDocument[] {
  const files = readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
  return files.map((file) => ({ source: file, text: readFileSync(join(dir, file), "utf8") }));
}
