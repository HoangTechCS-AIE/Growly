/**
 * The HIT fanpage voice, as data.
 *
 * Every constant here is measured from the 505 real posts in `data/` (Jun 2021 →
 * Jun 2026) — see `docs/hit-content-rules.md` for the prose version and the
 * per-year numbers. The linter and the prompt builder both read from this file,
 * so a rule only ever has to change in one place.
 */

export type Category =
  | "tuyen"
  | "sukien"
  | "thongbao"
  | "recap"
  | "thanhtich"
  | "lophoc"
  | "confession"
  | "ngayle";
export interface CategorySpec {
  key: Category;
  label: string;
  /** How many of the 505 real posts fall here. */
  sample: number;
  /** Shape guidance handed to the model, one line per beat. */
  skeleton: string[];
  /** Hashtags this category adds on top of the fixed set. */
  tags: string[];
}

export const CATEGORIES: CategorySpec[] = [
  {
    key: "sukien",
    label: "Sự kiện / cuộc thi",
    sample: 109,
    tags: ["#HITOpenDay", "#HITCONTESTSERIES"],
    skeleton: [
      "Tiêu đề: tên sự kiện + năm, IN HOA, emoji kẹp hai đầu",
      "Hook: 2 dòng thơ hoặc lời bài hát hợp chủ đề",
      "Đoạn hype: đếm ngược — 'Chỉ còn chưa đầy X ngày nữa thôi...'",
      "Đoạn nội dung: sự kiện sẽ có gì",
      "Block thông tin: ⏰ thời gian, 📍 địa điểm, 👉 link, ❌ hạn, 💸 kinh phí",
      "Chốt: mời gọi, kiểu 'Sự góp mặt của các cậu sẽ là niềm vui lớn cho chúng tớ đó'",
    ],
  },
  {
    key: "tuyen",
    label: "Tuyển thành viên / CTV / BQT",
    sample: 95,
    tags: ["#TuyenThanhVienHIT", "#CTV"],
    skeleton: [
      "Tiêu đề: TUYỂN ... + đợt/khoá, mở bằng 📣",
      "Hai dòng slogan có vần hoặc chơi chữ",
      "Câu chào thân: 'Chào cả nhà, lại là tớ đây! 👋'",
      "Đoạn bối cảnh: đợt trước / lý do mở đợt này",
      "Khối tiêu chí: '💡 Bạn có phải là người mà HIT đang tìm?' rồi 4 dòng ✅ bắt đầu bằng 'Muốn ...'",
      "Đoạn thúc đẩy, kết bằng 'Đây chính là lúc để bạn tỏa sáng! 💪'",
      "Block: 📩 link, ⏳ hạn chót",
      "Chốt: 'Còn chờ gì nữa? Đăng ký ngay thôi! 🚀'",
    ],
  },
  {
    key: "recap",
    label: "Recap / tổng kết",
    sample: 69,
    tags: ["#teambuilding", "#TeambuildingWithHIT"],
    skeleton: [
      "Tiêu đề: RECAP / TỔNG KẾT ..., mở bằng 📸",
      "Hook: 4 dòng thơ",
      "Câu hỏi hướng về người đọc về chính buổi đó",
      "Đoạn kể lại: 'Ngày dd/mm vừa qua, ... đã diễn ra trong không khí ...'",
      "Đoạn cảm xúc: nụ cười, cái bắt tay, mệt nhoài nhưng vui",
      "Đoạn cảm ơn thành viên",
      "Chốt cố định: mời xem ảnh — 'Và bây giờ, hãy cùng nhìn lại những khoảnh khắc đẹp nhất ... nhé!'",
    ],
  },
  {
    key: "thongbao",
    label: "Thông báo",
    sample: 67,
    tags: [],
    skeleton: [
      "Tiêu đề: THÔNG BÁO + nội dung, mở bằng 🔔",
      "Hook 1–2 dòng, chơi chữ theo dịp nếu có",
      "Đoạn nội dung chính, mở bằng 🗞",
      "Block: ⏰ thời gian, 🏢 địa điểm, ⚠️ chú ý",
      "Chốt ngắn — giọng gọn hơn các loại khác nhưng vẫn phải có 1 tiểu từ",
    ],
  },
  {
    key: "thanhtich",
    label: "Chúc mừng / thành tích",
    sample: 42,
    tags: ["#ThanhTich", "#WeAreHITers"],
    skeleton: [
      "Tiêu đề: GÓC FLEX THÀNH TÍCH hoặc CHÚC MỪNG ..., mở bằng 🎉",
      "Đoạn dẫn: tại cuộc thi X vừa qua, các thành viên HIT đã xuất sắc giành ...",
      "Câu mời điểm danh: 'Hãy cùng chúng tớ điểm danh những gương mặt vàng ... nhé!'",
      "Danh sách giải: 🏆 GIẢI NHẤT / 🥈 GIẢI NHÌ / 🥉 GIẢI BA / 🎖️ KHUYẾN KHÍCH",
      "Mỗi người một dòng, format '👤 Họ Tên – HIT<khoá>'",
      "Chốt chúc mừng, kết bằng 'không ngừng vươn xa! 🚀🔥'",
    ],
  },
  {
    key: "lophoc",
    label: "Lớp học / đào tạo",
    sample: 25,
    tags: ["#GocHocTapChiaSe"],
    skeleton: [
      "Tiêu đề: THÔNG BÁO MỞ LỚP ... hoặc GÓC HỌC TẬP - CHIA SẺ",
      "Hook: ba câu hỏi liên tiếp, mỗi câu một dòng, mỗi dòng một emoji",
      "Câu chuyển: '👉 Tất cả sẽ có trong lớp học ... của HIT – không chỉ là nơi học tập, mà còn là ...'",
      "Danh sách lớp: mỗi lớp một dòng, emoji hợp ngôn ngữ (☕ Java, 🐍 Python, 💻 Web, 🎨 Design, 🎮 Unity)",
      "Block: 📋 link đăng ký, ⏰ hạn đóng link, 📍 địa điểm",
      "Chốt chúc học tốt",
    ],
  },
  {
    key: "confession",
    label: "Confession",
    sample: 19,
    tags: ["#HITCfs"],
    skeleton: [
      "Tiêu đề: 💌 HIT CONFESSION - <tên số> 💌",
      "KHÔNG viết hộ nội dung confession — chỉ dựng khung, ruột là bài gửi thật",
      "Mỗi confession: '#HIT00n' rồi nguyên văn, ngăn nhau bằng một dòng gạch",
      "Chốt cố định: '🫶 Đừng ngần ngại mà hãy chia sẻ ... nhé👇' + '💌 Gửi cho chúng tớ tại: <link>'",
      "Bỏ footer, chỉ để #HITCLUB #HITCfs",
    ],
  },
  {
    key: "ngayle",
    label: "Ngày lễ / Tết",
    sample: 15,
    tags: [],
    skeleton: [
      "Mở bằng thơ hoặc lời bài hát, chế lại theo bối cảnh sinh viên/IT càng tốt",
      "Mỗi dòng thơ kẹp emoji hai đầu",
      "Một đoạn về ý nghĩa của ngày",
      "Đoạn chúc: 'Nhân ngày X, CLB Tin học HIT xin chân thành gửi tới ... lời chúc ...'",
      "Câu chúc chốt kẹp emoji",
      "Giọng ấm, ít hype, gần như không có block thông tin",
      "Với thầy cô xưng 'chúng em'; với HITers xưng 'chúng tớ'",
    ],
  },
];

export const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<Category, string>;

/*
 * Club identity (name, fanpage, address, hashtags) is NOT here — it is
 * deployment config and lives in `.env`, read through `lib/config.ts`.
 * This file holds only the voice, which is the same whichever page uses it.
 */

export const SEPARATOR = "-".repeat(62);

/* ---------------------------------------------------------------------- voice */

/** Measured medians. The linter warns outside these, it does not hard-fail. */
export const TARGET = {
  charsMin: 600,
  charsMax: 1900,
  charsHardMax: 2500,
  linesMin: 10,
  linesMax: 34,
  paragraphsMax: 8,
  /** Prompt target. p75 of real paragraphs is 3. */
  sentencesPerParagraph: 3,
  /** Lint threshold — p90 of real paragraphs is 6, so only flag past this. */
  sentencesPerParagraphHard: 4,
  emojiMin: 8,
  emojiMax: 28,
  emojiLineShare: 0.45,
  hashtagsMax: 8,
};

/** Page says `chúng tớ` (29%) or `chúng mình` (28%) — never both in one post. */
export const SELF_PRONOUNS = ["chúng tớ", "chúng mình"];

export const BANNED_PRONOUNS = [
  { term: "chúng tôi", why: "chỉ 6/505 bài, đều là text copy từ đối tác" },
  { term: "quý vị", why: "4/505, chỉ dùng khi cảm ơn khách mời trang trọng nhất" },
  { term: "bạn nhé", why: "page nói với đám đông, không nói với một người" },
];

/** Sentence-final particles, with the share of real posts that carry each. */
export const PARTICLES = ["nhé", "nha", "nào", "thôi", "ơi", "nhỉ", "nè", "đúng không"];

/** 21% of real posts stretch a vowel; models do it ~never. Rare but decisive. */
export const ELONGATIONS = ["nhaaa", "thoiii", "ơiii", "nèeee", "nàooo", "siuuu", "đâyyy"];

export const SIGNATURE_PHRASES = [
  "còn chần chờ gì nữa",
  "đại gia đình HIT",
  "cháy hết mình",
  "mảnh ghép",
  "truyền lửa",
  "giữ lửa đam mê",
  "khoảnh khắc đáng nhớ",
  "nhanh tay đăng ký",
  "đừng bỏ lỡ",
  "hẹn gặp các bạn",
  "bình tĩnh - tự tin - chiến thắng",
  "góc flex thành tích",
];

/** Emoji that act as field labels. Using the wrong one reads as a stranger writing. */
export const FIELD_EMOJI: { field: string; emoji: string[] }[] = [
  { field: "Thời gian", emoji: ["⏰", "⏱️", "🕰"] },
  { field: "Địa điểm", emoji: ["📍", "🏢", "🏫"] },
  { field: "Ngày / lịch", emoji: ["🗓", "📅", "📆"] },
  { field: "Link đăng ký", emoji: ["👉", "📥", "📋", "🔗", "📝"] },
  { field: "Hạn đóng link", emoji: ["❌", "⏳"] },
  { field: "Kinh phí", emoji: ["💸", "💰", "💵"] },
  { field: "Chuyển khoản", emoji: ["📨"] },
  { field: "Lưu ý", emoji: ["⚠️"] },
  { field: "Tên người", emoji: ["👤", "👨‍🎓"] },
  { field: "Giải thưởng", emoji: ["🥇", "🥈", "🥉", "🏆", "🎖️"] },
  { field: "Bullet thường", emoji: ["✅", "👉", "🔹"] },
];

/** The page's own top-25 emoji. Stay inside this set. */
export const PALETTE = "✅ 📌 🔥 👉 💥 🏢 🎉 📮 ✨ 🌟 ❤️ 🌈 🍀 🥰 💌 ❓ ⚡️ 💻 📣 🔔 🥳 🚀 👇 🗓 📢";

/**
 * Near-absent from the corpus, so their presence reads as a stranger writing.
 * Measured, not guessed: 🧠 1/505, 📈 2/505, ⚙️ 2/505, 📊 4/505. Emoji that felt
 * "AI" but the page genuinely uses — 💡 18, 🤖 12, 🌐 10, 🎓 9 — are NOT banned.
 */
export const BANNED_EMOJI = ["🧠", "📈", "⚙️", "📊"];

/** Connectives from school-essay Vietnamese the page does not write. */
export const BANNED_PHRASES = [
  "bên cạnh đó",
  "tóm lại",
  "nhìn chung",
  "có thể nói rằng",
  "đóng vai trò quan trọng",
  "một cách",
  "nhằm mục đích",
  "trong bối cảnh",
  "không thể phủ nhận",
  "là vô cùng cần thiết",
  "hy vọng bài viết này",
  "đầu tiên,",
  "thứ hai,",
  "cuối cùng, chúng ta có thể",
];
