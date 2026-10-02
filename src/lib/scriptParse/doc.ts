// Old Word (.doc): a binary format. Only the text can be recovered (no layout or styles), so it
// goes through the plain-text rules in lines.ts — the least accurate of the formats.

import WordExtractor from "word-extractor";
import { classifyLines } from "./lines";
import type { ScriptElement } from "./scenes";

export async function readDoc(bytes: Uint8Array): Promise<ScriptElement[]> {
  const doc = await new WordExtractor().extract(Buffer.from(bytes));
  return classifyLines(doc.getBody().split(/\r\n|\r|\n/));
}
