// Final Draft (.fdx): XML where every paragraph is labelled ("Scene Heading", "Character"…) and
// numbered scenes carry a Number attribute. Only the script body (FinalDraft > Content) is read,
// not the title page or headers.

import type { ElementType, ScriptElement } from "./scenes";
import { attr, childrenOf, find, parseXml, tagOf, type XmlNode } from "./xml";

const TYPES: Record<string, ElementType> = {
  "Scene Heading": "heading",
  Character: "character",
  Dialogue: "dialogue",
  Parenthetical: "parenthetical",
  Transition: "transition",
};

function textOf(paragraph: XmlNode): string {
  return childrenOf(paragraph)
    .filter((n) => tagOf(n) === "Text")
    .map((t) => childrenOf(t).map((n) => n["#text"] ?? "").join(""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function readFdx(xml: string): ScriptElement[] {
  const content = find(childrenOf(find(parseXml(xml), "FinalDraft") ?? {}), "Content");
  if (!content) throw new Error("Not a Final Draft file");
  const out: ScriptElement[] = [];
  // Paragraphs can nest (dual dialogue), so walk in document order.
  const walk = (nodes: XmlNode[]) => {
    for (const n of nodes) {
      if (tagOf(n) === "Paragraph") {
        const text = textOf(n);
        if (text) out.push({ type: TYPES[attr(n, "Type") ?? ""] ?? "action", text, number: attr(n, "Number") || undefined });
      }
      if (tagOf(n) !== "Text") walk(childrenOf(n));
    }
  };
  walk(childrenOf(content));
  return out;
}
