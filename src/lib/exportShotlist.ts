// Builds and downloads a shotlist as an .xlsx file in the browser. ExcelJS is large, so it's only
// loaded when the user actually exports.

import { ROW_KIND } from "./constants";
import { exportTable, type RowData } from "./rows";

const BLACK = { argb: "FF000000" };
const BORDER = { style: "thin" as const, color: BLACK };
const COLUMN_WIDTHS = [16, 20, 26, 16, 44];

/** A file/sheet-safe version of the title. */
function safeName(title: string) {
  return title.replace(/[\\/:*?"<>|[\]]/g, "-").trim() || "Shotlist";
}

export async function downloadShotlist(title: string, rows: readonly RowData[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  // Excel limits sheet names to 31 characters.
  const sheet = workbook.addWorksheet(safeName(title).slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
    headerFooter: { oddHeader: `&C&B${title.replace(/&/g, "&&")}` }, // title on printed pages
  });
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  exportTable(rows).forEach((values, r) => {
    const row = sheet.addRow(values);
    // Black and white: bold for the header and for scene rows instead of colour.
    const bold = r === 0 || rows[r - 1].kind === ROW_KIND.SCENE;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = "@"; // keep numbers like 12.10 as typed
      cell.font = { name: "Calibri", size: 11, bold, color: BLACK };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(title)}.xlsx`;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
