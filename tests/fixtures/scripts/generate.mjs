// Regenerates the sample scripts used by tests/scriptFormats.test.ts — the same short screenplay in
// every supported format. Run with `node tests/fixtures/scripts/generate.mjs` (macOS: .doc and the
// plain .docx are made with `textutil`).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

const here = new URL(".", import.meta.url).pathname;
const out = (name) => join(here, name);

// [type, text, sceneNumber?] — the story every fixture contains.
const SCRIPT = [
  ["transition", "FADE IN:"],
  ["heading", "INT. KITCHEN - DAY", "1"],
  ["action", "Ana pours coffee. BEN (30s) shuffles in."],
  ["character", "ANA"],
  ["dialogue", "Morning."],
  ["character", "BEN (O.S.)"],
  ["parenthetical", "(sleepy)"],
  ["dialogue", "Hi."],
  ["character", "ANA (CONT'D)"],
  ["dialogue", "Coffee?"],
  ["transition", "CUT TO:"],
  ["heading", "EXT. GARDEN - NIGHT", "2"],
  ["action", "Wind in the trees."],
  ["character", "BEN (V.O.)"],
  ["dialogue", "Later that night, everything changed."],
  ["heading", "INTERCUT - PHONE CALL"],
  ["character", "CAROL"],
  ["dialogue", "Hello?"],
  ["heading", "BACK TO SCENE"],
  ["character", "MRS. O'BRIEN"],
  ["dialogue", "Who was that?"],
  ["heading", "INT./EXT. CAR - MOVING - CONTINUOUS", "2A"],
  ["action", "Ana drives. Ben sleeps."],
  ["heading", "EXT. ROAD - 1985", "3"],
  ["action", "A truck passes."],
  ["transition", "FADE OUT."],
];

// ---- Final Draft (.fdx), numbered, with a title page that must be ignored ----
const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FDX_TYPE = { heading: "Scene Heading", action: "Action", character: "Character", dialogue: "Dialogue", parenthetical: "Parenthetical", transition: "Transition" };
const fdxParagraphs = SCRIPT.map(([type, text, num]) => {
  const number = num ? ` Number="${num}"` : "";
  // Split a run to check that text from several <Text> elements is joined.
  const runs = type === "heading" ? text.split(/(?<= )/).map((t) => `<Text>${xmlEscape(t)}</Text>`).join("") : `<Text>${xmlEscape(text)}</Text>`;
  return `    <Paragraph Type="${FDX_TYPE[type]}"${number}>${runs}</Paragraph>`;
}).join("\n");
writeFileSync(out("sample.fdx"), `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${fdxParagraphs}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Scene Heading"><Text>INT. TITLE PAGE - DAY</Text></Paragraph>
      <Paragraph Type="Character"><Text>WRITTEN BY</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`);

// ---- Word (.docx) with screenplay paragraph styles, unnumbered ----
const STYLE_ID = { heading: "SceneHeading", action: "Action", character: "Character", dialogue: "Dialogue", parenthetical: "Parenthetical", transition: "Transition" };
const STYLE_NAME = { SceneHeading: "Scene Heading", Action: "Action", Character: "Character", Dialogue: "Dialogue", Parenthetical: "Parenthetical", Transition: "Transition" };
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docxBody = SCRIPT.map(([type, text]) => {
  const runs = text.split(/(?<= )/).map((t) => `<w:r><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`).join("");
  return `<w:p><w:pPr><w:pStyle w:val="${STYLE_ID[type]}"/></w:pPr>${runs}</w:p>`;
}).join("");
const styled = new JSZip();
styled.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
styled.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
styled.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
styled.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${docxBody}</w:body></w:document>`);
styled.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${Object.entries(STYLE_NAME).map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`).join("")}</w:styles>`);
writeFileSync(out("sample-styled.docx"), await styled.generateAsync({ type: "nodebuffer" }));

// ---- Plain text → .doc (blank lines between blocks) and unstyled .docx (no blank lines) ----
const tmp = mkdtempSync(join(tmpdir(), "script-fixtures-"));
const blocks = [];
for (const [type, text] of SCRIPT) {
  if (type === "dialogue" || type === "parenthetical") blocks[blocks.length - 1].push(text);
  else blocks.push([text]); // every other paragraph starts a block
}
writeFileSync(join(tmp, "spaced.txt"), blocks.map((b) => b.join("\n")).join("\n\n") + "\n");
writeFileSync(join(tmp, "tight.txt"), SCRIPT.map(([, text]) => text).join("\n") + "\n");
execFileSync("textutil", ["-convert", "doc", join(tmp, "spaced.txt"), "-output", out("sample.doc")]);
execFileSync("textutil", ["-convert", "docx", join(tmp, "tight.txt"), "-output", out("sample-plain.docx")]);

// ---- PDF: standard screenplay layout, scene numbers in both margins, a title page, page breaks ----
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Courier);
const SIZE = 12;
const X = { action: 108, heading: 108, dialogue: 180, parenthetical: 223, character: 266 };
let page;
let y;
const newPage = (pageNumber) => {
  page = pdf.addPage([612, 792]);
  y = 720;
  if (pageNumber) page.drawText(`${pageNumber}.`, { x: 522, y: 750, size: SIZE, font });
};
const line = (text, x) => {
  page.drawText(text, { x, y, size: SIZE, font });
  y -= 12;
};
newPage(); // title page
for (const [text, yy] of [["MY TEST SCRIPT", 500], ["Written by", 470], ["Felix", 455]]) {
  page.drawText(text, { x: (612 - font.widthOfTextAtSize(text, SIZE)) / 2, y: yy, size: SIZE, font });
}
newPage(); // page 1 of the script (unnumbered, as usual)
for (const [i, [type, text, num]] of SCRIPT.entries()) {
  if (type === "heading" && text === "INTERCUT - PHONE CALL") {
    // Break the page mid-scene like screenwriting apps do.
    line("(MORE)", X.character);
    newPage(2);
    line("CONTINUED:", X.action);
    y -= 12;
  }
  if (type === "heading") {
    if (num) {
      page.drawText(num, { x: 72, y, size: SIZE, font });
      page.drawText(num, { x: 522, y, size: SIZE, font });
    }
    line(text, X.heading);
  } else if (type === "transition") {
    line(text, text === "FADE IN:" ? X.action : 540 - font.widthOfTextAtSize(text, SIZE));
  } else {
    line(text, X[type]);
  }
  const next = SCRIPT[i + 1];
  if (next && !["dialogue", "parenthetical"].includes(next[0])) y -= 12;
}
writeFileSync(out("sample.pdf"), await pdf.save());
console.log("Wrote fixtures to", here);
