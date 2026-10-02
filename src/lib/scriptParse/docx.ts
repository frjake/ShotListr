// Word (.docx): a zip of XML. Scripts exported from screenwriting apps (or written with a
// screenplay template) name their paragraph styles "Scene Heading", "Character", "Dialogue"…; those
// are used directly. Without such styles, the text goes through the plain-text rules in lines.ts.

import JSZip from "jszip";
import { classifyLines, splitSceneNumber } from "./lines";
import type { ElementType, ScriptElement } from "./scenes";
import { attr, childrenOf, find, parseXml, tagOf, type XmlNode } from "./xml";

function typeForStyle(name: string): ElementType | null {
  const n = name.toLowerCase();
  if (/scene ?heading|slug ?line/.test(n)) return "heading";
  if (/^character/.test(n)) return "character";
  if (/dialog/.test(n)) return "dialogue";
  if (/parenthetical/.test(n)) return "parenthetical";
  if (/transition/.test(n)) return "transition";
  return null;
}

/** A paragraph's text: every w:t (deleted text is w:delText, so it's skipped), tabs as spaces. */
function textOf(node: XmlNode): string {
  const tag = tagOf(node);
  if (node["#text"] !== undefined) return node["#text"];
  if (tag === "w:tab") return " ";
  if (tag === "w:br" || tag === "w:cr") return "\n";
  if (tag === "w:pPr" || tag === "w:rPr" || tag === "w:del") return "";
  return childrenOf(node).map(textOf).join("");
}

export async function readDocx(bytes: Uint8Array): Promise<ScriptElement[]> {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("Not a Word document");
  const stylesXml = await zip.file("word/styles.xml")?.async("string");

  const styleNames = new Map<string, string>();
  for (const style of childrenOf(find(parseXml(stylesXml ?? "<w:styles/>"), "w:styles") ?? {})) {
    const id = attr(style, "w:styleId");
    const name = attr(find(childrenOf(style), "w:name") ?? {}, "w:val");
    if (id && name) styleNames.set(id, name);
  }

  // Paragraphs in order, including any inside tables or content controls.
  const paragraphs: { type: ElementType | null; text: string }[] = [];
  const walk = (nodes: XmlNode[]) => {
    for (const n of nodes) {
      if (tagOf(n) === "w:p") {
        const styleId = attr(find(childrenOf(find(childrenOf(n), "w:pPr") ?? {}), "w:pStyle") ?? {}, "w:val");
        paragraphs.push({ type: typeForStyle(styleNames.get(styleId ?? "") ?? styleId ?? ""), text: textOf(n) });
      } else {
        walk(childrenOf(n));
      }
    }
  };
  walk(childrenOf(find(childrenOf(find(parseXml(documentXml), "w:document") ?? {}), "w:body") ?? {}));

  const styled = paragraphs.some((p) => p.type === "heading");
  if (!styled) return classifyLines(paragraphs.flatMap((p) => p.text.split("\n")));
  return paragraphs.flatMap((p): ScriptElement[] => {
    const text = p.text.replace(/\s+/g, " ").trim();
    if (!text) return [];
    if (p.type === "heading") return [{ type: "heading", ...splitSceneNumber(text) }];
    return [{ type: p.type ?? "action", text }];
  });
}
