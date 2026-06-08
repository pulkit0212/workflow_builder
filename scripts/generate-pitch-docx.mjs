#!/usr/bin/env node
/**
 * Generate editable Word doc from artivaa-investor-pitch.md
 * Usage: node scripts/generate-pitch-docx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "artivaa-investor-pitch.md");
const outPath = path.join(root, "artivaa-investor-pitch.docx");

const md = fs.readFileSync(mdPath, "utf8");

function parseInline(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
    const token = m[0];
    if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith("*")) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith("`")) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: "Courier New", size: 20 }));
    } else if (token.startsWith("[")) {
      const label = token.match(/\[([^\]]+)\]/)[1];
      runs.push(new TextRun({ text: label, underline: {} }));
    }
    last = m.index + token.length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs.length ? runs : [new TextRun(text)];
}

function tableFromRows(rows) {
  if (rows.length === 0) return null;
  const colCount = rows[0].length;
  const widthPct = Math.floor(100 / colCount);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              width: { size: widthPct, type: WidthType.PERCENTAGE },
              shading:
                rowIdx === 0
                  ? { fill: "E8EEF7", type: ShadingType.CLEAR }
                  : undefined,
              children: [
                new Paragraph({
                  children: parseInline(cell.trim()),
                  spacing: { before: 60, after: 60 },
                }),
              ],
            })
        ),
      })
    ),
  });
}

function parseMarkdown(content) {
  const children = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: codeLines.join("\n"),
              font: "Courier New",
              size: 18,
            }),
          ],
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableRows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        const row = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        // skip separator row |---|---|
        if (!row.every((c) => /^[-:]+$/.test(c))) tableRows.push(row);
        i++;
      }
      const table = tableFromRows(tableRows);
      if (table) children.push(table);
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: line.slice(2).trim(),
          heading: HeadingLevel.TITLE,
          spacing: { after: 200 },
        })
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: line.slice(3).trim(),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 160 },
        })
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: line.slice(4).trim(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 120 },
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      children.push(
        new Paragraph({
          children: parseInline(quoteLines.join(" ")),
          indent: { left: 720 },
          spacing: { before: 80, after: 80 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB" },
          },
        })
      );
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        const item = lines[i].replace(/^[-*]\s/, "");
        children.push(
          new Paragraph({
            children: parseInline(item),
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
        i++;
      }
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Normal paragraph
    children.push(
      new Paragraph({
        children: parseInline(line),
        spacing: { after: 120 },
      })
    );
    i++;
  }

  return children;
}

const doc = new Document({
  creator: "Artivaa AI",
  title: "Artivaa AI — Investor Pitch & Product Brief",
  description: "Editable product and feature document for investors",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: parseMarkdown(md),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log(`Word doc written: ${outPath}`);
