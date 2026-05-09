import type { Express } from "express";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/** Extract plain text from Document Analyzer uploads (PDF, DOCX, TXT). */
export async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  const buf = file.buffer;
  const name = (file.originalname ?? "").toLowerCase();
  const mime = (file.mimetype ?? "").toLowerCase();

  if (!buf?.length) {
    throw new Error("Empty file upload.");
  }

  if (mime === "text/plain" || name.endsWith(".txt")) {
    return buf.toString("utf8");
  }

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    return (result.text ?? "").trim();
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value ?? "").trim();
  }

  if (mime.startsWith("image/")) {
    throw new Error(
      "Images are not read as text on the server. Use “Paste Text”, or export to PDF with selectable text."
    );
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT, or use Paste Text.");
}
