import "server-only";
import { inflateRawSync } from "node:zlib";
import { contentLimits } from "../config";

/**
 * Plain text out of a .docx or .pdf, so a notice can be dropped straight into
 * the studio instead of being retyped.
 *
 * .docx is a ZIP holding `word/document.xml`; the reader below is ~40 lines of
 * the ZIP spec rather than a dependency, which keeps the "no native build step"
 * promise intact. .pdf goes through unpdf (pure JS, wraps pdf.js).
 */

export type DocKind = "docx" | "pdf";

export interface ExtractedDoc {
  kind: DocKind;
  name: string;
  text: string;
  /** Before truncation, so the UI can say how much was dropped. */
  fullLength: number;
  truncated: boolean;
}

/* ------------------------------------------------------------------- zip */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** Reads one named entry out of a ZIP archive. */
function readZipEntry(buf: Buffer, wanted: string): Buffer | undefined {
  // The end-of-central-directory record sits in the last 64KB, after a
  // variable-length comment, so scan backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;

  let ptr = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);

  for (let i = 0; i < count; i += 1) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CEN_SIG) return undefined;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    if (name === wanted) {
      // The local header repeats the name/extra lengths, and its extra field
      // may differ in length from the central one — always read it here.
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = buf.subarray(start, start + compressedSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

/* ------------------------------------------------------------------ docx */

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

export function docxToText(buf: Buffer): string {
  const xml = readZipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("Không đọc được word/document.xml — file .docx có vẻ hỏng.");

  const text = unescapeXml(
    xml
      .toString("utf8")
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      // Table cells come first: a cell wraps its own <w:p>, so if paragraphs
      // were converted first every cell would land on its own line and the
      // "Khối chuyên tin | 03-04/10/2026" pairing would be lost.
      // (Nested tables are not handled — notices do not use them.)
      .replace(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g, (_, cell: string) =>
        `${cell.replace(/<\/w:p>/g, " ")} | `,
      )
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );

  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/\s*\|\s*/g, " | ")
        .replace(/^\s*\|\s*/, "")
        .replace(/\s*\|\s*$/, "")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    // Word emits a stray numeric run for every floating shape; drop those.
    .filter((line) => line.length > 0 && !/^\d{6,}$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/* ------------------------------------------------------------------- pdf */

export async function pdfToText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/* ----------------------------------------------------------------- entry */

export async function extractDocument(file: File): Promise<ExtractedDoc> {
  const name = file.name || "tài liệu";
  const lower = name.toLowerCase();
  const kind: DocKind | undefined = lower.endsWith(".docx")
    ? "docx"
    : lower.endsWith(".pdf")
      ? "pdf"
      : undefined;

  if (!kind) {
    throw new Error(
      lower.endsWith(".doc")
        ? "File .doc cũ không đọc được — mở bằng Word rồi lưu lại thành .docx."
        : "Chỉ nhận .docx hoặc .pdf.",
    );
  }

  const maxChars = contentLimits().docMaxChars;
  const buf = Buffer.from(await file.arrayBuffer());
  const raw = kind === "docx" ? docxToText(buf) : await pdfToText(buf);
  const text = raw.trim();

  if (!text) {
    throw new Error(
      kind === "pdf"
        ? "PDF không có lớp text — có vẻ là bản scan. Cần OCR trước, hoặc dán tay vào ô Dữ kiện cứng."
        : "Tài liệu không có chữ nào.",
    );
  }

  return {
    kind,
    name,
    text: text.slice(0, maxChars),
    fullLength: text.length,
    truncated: text.length > maxChars,
  };
}
