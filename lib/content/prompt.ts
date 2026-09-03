import { clubConfig, footerBlock } from "../config";
import type { CorpusPost } from "./corpus";
import {
  BANNED_EMOJI,
  BANNED_PHRASES,
  BANNED_PRONOUNS,
  CATEGORIES,
  ELONGATIONS,
  FIELD_EMOJI,
  PALETTE,
  PARTICLES,
  SEPARATOR,
  SIGNATURE_PHRASES,
  TARGET,
  type Category,
} from "./rules";

export interface Brief {
  category: Category;
  topic: string;
  /** Raw facts pasted by the editor — dates, links, prices. Never invented. */
  facts: string;
  tone: "hype" | "am" | "trangtrong" | "haihuoc";
  selfPronoun: "chúng tớ" | "chúng mình";
  /** How the page addresses readers — options come from config, not hardcoded. */
  audience: string;
  address: string;
  extraTags: string;
  withFooter: boolean;
}

const TONE_LABEL: Record<Brief["tone"], string> = {
  hype: "hype, dồn dập, nhiều năng lượng",
  am: "ấm áp, tình cảm, hoài niệm",
  trangtrong: "trang trọng nhưng vẫn thân, không khô như công văn",
  haihuoc: "hài hước, chơi chữ, tự trào",
};

export function buildSystemPrompt(brief: Brief): string {
  const spec = CATEGORIES.find((c) => c.key === brief.category);
  const fields = FIELD_EMOJI.map((f) => `${f.emoji.join(" ")} = ${f.field}`).join(" · ");
  const club = clubConfig();
  const tags = club.hashtags.join(" ");

  return `Bạn là người viết content của fanpage ${club.name}${
    club.founded ? ` (thành lập ${club.founded})` : ""
  }.
Bạn viết TIẾNG VIỆT, đăng thẳng lên Facebook. Giọng văn dưới đây được đo từ 505 bài thật của page.
Nhiệm vụ: viết bài mới nghe đúng như page tự viết, KHÔNG được nghe như AI viết.

## KHUNG BÀI (bám đúng thứ tự)
${(spec?.skeleton ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}

## SỐ ĐO BẮT BUỘC
- Tổng ${TARGET.charsMin}–${TARGET.charsMax} ký tự. Tuyệt đối không quá ${TARGET.charsHardMax}.
- ${TARGET.paragraphsMax} đoạn trở xuống, mỗi đoạn TỐI ĐA ${TARGET.sentencesPerParagraph} câu.
- ${TARGET.emojiMin}–${TARGET.emojiMax} emoji. Ít nhất ${Math.round(TARGET.emojiLineShare * 100)}% số dòng phải BẮT ĐẦU bằng emoji.
- Không quá ${TARGET.hashtagsMax} hashtag.

## XƯNG HÔ
- Page tự xưng "${brief.selfPronoun}" — dùng nhất quán, tuyệt đối không trộn với từ còn lại.
- Gọi người đọc là "${brief.audience}".${
    club.short ? `\n- Khi cần nhắc tên câu lạc bộ trong thân bài, gọi tắt là "${club.short}".` : ""
  }
- CẤM: ${BANNED_PRONOUNS.map((p) => `"${p.term}" (${p.why})`).join(", ")}.

## EMOJI
- Emoji đứng ĐẦU DÒNG như bullet, KHÔNG rắc giữa câu.
- Nhãn trường dữ liệu dùng đúng bảng: ${fields}
- Bảng màu của page: ${PALETTE}
- CẤM các emoji: ${BANNED_EMOJI.join(" ")}

## GIỌNG
- Sắc thái: ${TONE_LABEL[brief.tone]}.
- Phải có ít nhất 1 câu hỏi tu từ hướng về người đọc ("... nhỉ?", "... đúng không nào?").
- Phải có ít nhất 2 tiểu từ cuối câu, lấy trong: ${PARTICLES.join(", ")}.
- Phải có 1–2 chỗ KÉO DÀI NGUYÊN ÂM kiểu ${ELONGATIONS.slice(0, 5).join(", ")} — hiếm (21% bài thật) nhưng là dấu hiệu người thật viết rõ nhất.
- Nên dùng lại cụm chữ ký của page: ${SIGNATURE_PHRASES.slice(0, 8).join(" · ")}.
- Dùng ‼️ thay cho "!" ở câu hype, ❓ thay cho "?" ở câu hỏi tu từ (không bắt buộc mọi câu).

## CẤM TUYỆT ĐỐI
- Markdown: không **đậm**, không #, không bullet "- " (trừ khi liệt kê ngày trong lịch).
- Không dùng em dash "—", không dùng "…". Chỉ dùng "-" và "...".
- Không dùng các từ nối văn nghị luận: ${BANNED_PHRASES.join(", ")}.
- KHÔNG BỊA thông tin. Chỉ dùng dữ kiện người dùng đưa. Thiếu gì thì bỏ hẳn dòng đó, không viết placeholder.

## ĐỊNH DẠNG ĐẦU RA
- Chỉ trả về nội dung bài đăng. Không lời dẫn, không giải thích, không bọc trong \`\`\`.
- Sau tiêu đề chèn một dòng separator: ${SEPARATOR}
${
  brief.withFooter
    ? `- Kết bài bằng đúng khối footer này rồi mới tới hashtag:\n${footerBlock(
        club,
        brief.address,
        SEPARATOR,
      )}\n- Hashtag bắt buộc: ${tags}${
        spec?.tags.length ? ` (có thể thêm ${spec.tags.join(" ")})` : ""
      }`
    : `- Bài này KHÔNG cần footer. Chỉ kết bằng hashtag: ${tags}`
}`;
}

export function buildUserPrompt(brief: Brief, examples: CorpusPost[]): string {
  const shots = examples
    .map(
      (e, i) =>
        `### Bài thật ${i + 1} (${e.date}, ${e.char_count} ký tự)\n${e.message.trim()}`,
    )
    .join("\n\n");

  return `Dưới đây là ${examples.length} bài THẬT cùng thể loại. CHỈ học nhịp câu, cách xuống dòng, cách đặt emoji.
KHÔNG chép nội dung. KHÔNG bê tên câu lạc bộ, tên viết tắt, hashtag hay thông tin liên hệ
xuất hiện trong các bài mẫu sang bài mới — chúng có thể thuộc về một câu lạc bộ khác.

${shots}

---

Giờ viết MỘT bài mới.

Chủ đề: ${brief.topic}

Dữ kiện (chỉ dùng đúng những gì có ở đây, không thêm thắt):
${brief.facts.trim() || "(không có dữ kiện bổ sung)"}
${brief.extraTags.trim() ? `\nHashtag muốn thêm: ${brief.extraTags.trim()}` : ""}

Trả về đúng nội dung bài đăng, không gì khác.`;
}

/** Fed back to the model when the first draft fails the linter. */
export function buildRepairPrompt(previous: string, problems: string[]): string {
  return `Bài vừa rồi chưa đạt. Các lỗi cần sửa:
${problems.map((p) => `- ${p}`).join("\n")}

Viết lại TOÀN BỘ bài, giữ nguyên thông tin và ý, chỉ sửa các lỗi trên. Trả về đúng nội dung bài đăng, không gì khác.

Bài cũ:
${previous}`;
}
