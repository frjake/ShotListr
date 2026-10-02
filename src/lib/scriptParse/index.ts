import "server-only";

// Reads a script file into shotlist scenes. Each format has a reader that labels paragraphs
// (heading, character, dialogue…); buildScenes turns those into scenes the same way for all.

import { readDoc } from "./doc";
import { readDocx } from "./docx";
import { readFdx } from "./fdx";
import { readPdf } from "./pdf";
import { buildScenes, type ScriptElement, type ScriptScene } from "./scenes";

export type { ScriptScene } from "./scenes";

export async function parseScript(fileName: string, bytes: Uint8Array): Promise<{ scenes: ScriptScene[] } | { error: string }> {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  let elements: ScriptElement[];
  try {
    if (ext === ".fdx") elements = readFdx(new TextDecoder().decode(bytes));
    else if (ext === ".docx") elements = await readDocx(bytes);
    else if (ext === ".doc") elements = await readDoc(bytes);
    else if (ext === ".pdf") elements = await readPdf(bytes);
    else return { error: "Scripts must be .doc, .docx, .pdf or .fdx files." };
  } catch {
    return { error: `Couldn't read “${fileName}”. The file may be damaged or not really a ${ext} file.` };
  }
  const scenes = buildScenes(elements);
  if (scenes.length === 0) {
    return {
      error:
        ext === ".pdf"
          ? `No scenes found in “${fileName}”. If it's a scanned PDF, export a text PDF or .fdx from your writing app instead.`
          : `No scenes found in “${fileName}”. Scene headings need to start with INT. or EXT.`,
    };
  }
  return { scenes };
}
