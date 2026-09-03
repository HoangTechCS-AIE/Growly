import "server-only";
import { contentLimits, providerDefaults } from "../config";
import { extractDocument, type ExtractedDoc } from "./extract";
import { CATEGORIES, type Category } from "./rules";
import { chat, getProviderConfig } from "./provider";

/**
 * Turns an uploaded notice into a filled-in brief.
 *
 * This step never writes the post — it only reads facts out of the document so
 * the editor can check them before generating. The post itself still goes
 * through `generatePost`, so the house rules and the linter apply either way.
 */

export interface DocumentBrief {
  category: Category;
  topic: string;
  facts: string;
  extraTags: string;
  tone: "hype" | "am" | "trangtrong" | "haihuoc";
  /** Contradictions or gaps found in the document — shown, never auto-resolved. */
  warnings: string[];
}

export interface AnalyzeResult {
  brief: DocumentBrief;
  doc: Pick<ExtractedDoc, "kind" | "name" | "fullLength" | "truncated">;
  excerpt: string;
}

const SYSTEM = `Bạn là trợ lý biên tập của một fanpage câu lạc bộ sinh viên.
Nhiệm vụ DUY NHẤT: đọc một văn bản thông báo và rút ra các trường thông tin để điền vào form.

TUYỆT ĐỐI KHÔNG viết bài đăng. KHÔNG thêm emoji. KHÔNG văn vẻ.

Quy tắc rút thông tin:
- Chỉ lấy những gì CÓ TRONG văn bản. Không suy đoán, không bịa, không điền giá trị mẫu.
- Trường nào văn bản không nói thì bỏ hẳn, không ghi "chưa có" hay "...".
- Giữ nguyên số liệu, ngày tháng, link, số điện thoại, tên riêng đúng như bản gốc.
- Nếu văn bản mâu thuẫn (ví dụ ngày ban hành khác năm với các mốc bên trong) hoặc
  thiếu thông tin quan trọng, ghi vào "warnings". Không tự sửa.

Loại bài hợp lệ (chọn đúng một key):
${CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n")}

Sắc thái hợp lệ: hype (dồn dập, nhiều năng lượng), am (ấm áp, tình cảm),
trangtrong (trang trọng nhưng vẫn thân), haihuoc (hài hước, chơi chữ).

Trả về DUY NHẤT một object JSON, không bọc trong \`\`\`, theo đúng schema:
{
  "category": "<key>",
  "topic": "<một câu ngắn mô tả bài sẽ viết, không quá 80 ký tự>",
  "facts": "<mỗi dòng một dữ kiện, dạng 'Nhãn: giá trị'>",
  "extraTags": "<hashtag gợi ý, cách nhau bằng dấu cách, hoặc chuỗi rỗng>",
  "tone": "<hype|am|trangtrong|haihuoc>",
  "warnings": ["<mâu thuẫn hoặc thiếu sót cần người kiểm tra>"]
}

Nhãn nên dùng trong "facts", đúng thứ tự nếu có: Thời gian, Hạn đăng ký, Địa điểm,
Đối tượng, Link đăng ký, Lịch thi, Kinh phí, Quyền lợi, Liên hệ.`;

function parseJson(raw: string): unknown {
  const unfenced = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // Some models prepend a sentence despite the instruction; take the object.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error(`Model không trả về JSON hợp lệ: ${unfenced.slice(0, 200)}`);
    }
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}

const TONES = new Set(["hype", "am", "trangtrong", "haihuoc"]);

function coerce(value: unknown): DocumentBrief {
  const v = (value ?? {}) as Record<string, unknown>;
  const category = String(v.category ?? "");
  const tone = String(v.tone ?? "");
  return {
    category: (CATEGORIES.some((c) => c.key === category) ? category : "thongbao") as Category,
    topic: String(v.topic ?? "").trim().slice(0, 200),
    facts: String(v.facts ?? "").trim(),
    extraTags: String(v.extraTags ?? "").trim(),
    tone: (TONES.has(tone) ? tone : "hype") as DocumentBrief["tone"],
    warnings: Array.isArray(v.warnings)
      ? v.warnings.map((w) => String(w).trim()).filter(Boolean).slice(0, 8)
      : [],
  };
}

export async function analyzeDocument(file: File): Promise<AnalyzeResult> {
  const doc = await extractDocument(file);
  const config = getProviderConfig();

  const reply = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Đọc văn bản dưới đây và rút ra các trường thông tin.\n\n---\n${doc.text}\n---`,
      },
    ],
    // Extraction wants to be literal, not creative — override the writing temp.
    { ...config, temperature: providerDefaults().extractTemperature },
  );

  const brief = coerce(parseJson(reply));
  if (doc.truncated) {
    brief.warnings.push(
      `Tài liệu dài ${doc.fullLength.toLocaleString("vi-VN")} ký tự, chỉ đọc ${contentLimits().docMaxChars.toLocaleString("vi-VN")} ký tự đầu — kiểm tra phần cuối bằng tay.`,
    );
  }

  return {
    brief,
    doc: { kind: doc.kind, name: doc.name, fullLength: doc.fullLength, truncated: doc.truncated },
    excerpt: doc.text.slice(0, 1200),
  };
}
