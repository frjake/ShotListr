// Small helpers over fast-xml-parser's ordered output: [{ tag: [children…], ":@": { attrs } }, …].

import { XMLParser } from "fast-xml-parser";

export type XmlNode = { [tag: string]: XmlNode[] | string | Record<string, string> | undefined } & {
  ":@"?: Record<string, string>;
  "#text"?: string;
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false, // keep the spaces between runs ("INT." + " KITCHEN")
  parseTagValue: false, // keep "12" as text
  parseAttributeValue: false,
});

export function parseXml(xml: string): XmlNode[] {
  return parser.parse(xml) as XmlNode[];
}

/** The tag of an element node (null for text nodes). */
export function tagOf(node: XmlNode): string | null {
  return Object.keys(node).find((k) => k !== ":@" && k !== "#text") ?? null;
}

export function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  const kids = tag ? node[tag] : undefined;
  return Array.isArray(kids) ? kids : [];
}

export function attr(node: XmlNode, name: string): string | undefined {
  return node[":@"]?.[name];
}

/** The first child (or, with `deep`, descendant) element with this tag. */
export function find(nodes: XmlNode[], tag: string, deep = false): XmlNode | undefined {
  for (const n of nodes) {
    if (tagOf(n) === tag) return n;
    if (deep) {
      const hit = find(childrenOf(n), tag, true);
      if (hit) return hit;
    }
  }
  return undefined;
}
