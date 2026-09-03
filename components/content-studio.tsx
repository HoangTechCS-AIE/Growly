"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDraft, generateContent, readBriefFromDocument, saveDraft } from "@/lib/actions";
import { lintPost, type Check } from "@/lib/content/lint";
import type { Brief } from "@/lib/content/prompt";
import { CATEGORIES, type Category } from "@/lib/content/rules";
import type { ContentDraft } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconCheck, IconCopy, IconSparkle, IconTrash, IconWarning } from "./icons";
import { EmptyState, Ring, Tile } from "./ui";

interface CorpusInfo {
  total: number;
  from_date: string | null;
  to_date: string | null;
  byCategory: Record<string, number>;
}

const TONES: { value: Brief["tone"]; label: string }[] = [
  { value: "hype", label: "Hype" },
  { value: "am", label: "Ấm áp" },
  { value: "trangtrong", label: "Trang trọng" },
  { value: "haihuoc", label: "Hài hước" },
];

const VIEWS = [
  ["edit", "Soạn"],
  ["preview", "Xem trước"],
] as const;

/** Severity, not decoration — same three bands the rest of the app uses. */
function scoreTone(score: number) {
  return score >= 90 ? "accent" : score >= 70 ? "warn" : "danger";
}

function CheckRow({ check }: { check: Check }) {
  const tone = check.ok ? "text-accent" : check.severity === "fail" ? "text-danger" : "text-warn";
  return (
    <li className="list-row items-start gap-2.5">
      <span className={cn("mt-0.5 shrink-0", tone)}>
        {check.ok ? (
          <IconCheck className="h-4 w-4" strokeWidth={3} />
        ) : (
          <IconWarning className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", check.ok ? "text-ink" : tone)}>{check.label}</p>
        <p className="text-xs leading-snug text-muted">{check.detail}</p>
      </div>
    </li>
  );
}

/**
 * The post exactly as Facebook will show it: one plain-text block, line breaks
 * preserved, nothing rendered. Same string the Copy button puts on the clipboard
 * — this is a viewer, not a formatter.
 */
function FacebookPreview({ text }: { text: string }) {
  return (
    <div className="rounded-inner border border-line bg-surface-2 p-4">
      <p className="eyebrow mb-3 border-b border-line pb-2">Dán thẳng vào ô đăng bài</p>
      <div
        className="max-h-[30rem] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-ink"
        style={{ overflowWrap: "anywhere" }}
      >
        {text}
      </div>
    </div>
  );
}

export function ContentStudio({
  corpus,
  drafts,
  provider,
  club,
}: {
  corpus: CorpusInfo;
  drafts: ContentDraft[];
  provider: { model: string; baseUrl: string; hasKey: boolean; address: string };
  /** From `.env` via the server — nothing here is tied to one page. */
  club: { name: string; footerMarker: string; memberTerm: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<{ model: string; attempts: number } | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [doc, setDoc] = useState<{ name: string; chars: number; warnings: string[] } | null>(null);
  const [reading, setReading] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  const [brief, setBrief] = useState<Omit<Brief, "address">>({
    category: "thongbao",
    topic: "",
    facts: "",
    tone: "hype",
    selfPronoun: "chúng tớ",
    audience: "các cậu",
    extraTags: "",
    withFooter: true,
  });

  // Re-lints as you edit, so the panel tracks the text actually in the box.
  const lint = useMemo(
    () => (content.trim() ? lintPost(content, { footerMarker: club.footerMarker }) : null),
    [content, club.footerMarker],
  );
  const set = <K extends keyof typeof brief>(key: K, value: (typeof brief)[K]) =>
    setBrief((b) => ({ ...b, [key]: value }));

  const examples = corpus.byCategory[brief.category] ?? 0;
  // A blank or half-typed base URL is not a URL; the endpoint is worth showing anyway.
  const providerHost = (() => {
    try {
      return new URL(provider.baseUrl).host;
    } catch {
      return provider.baseUrl || "chưa đặt base URL";
    }
  })();

  // Fills the brief from an uploaded notice. It stops here on purpose: the
  // editor checks the extracted facts before anything gets written.
  async function readDocument(file: File) {
    setError("");
    setDoc(null);
    setReading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await readBriefFromDocument(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { brief: filled, doc: info } = res.result;
      setBrief((b) => ({
        ...b,
        category: filled.category,
        topic: filled.topic || b.topic,
        facts: filled.facts || b.facts,
        tone: filled.tone,
        extraTags: filled.extraTags || b.extraTags,
      }));
      setDoc({ name: info.name, chars: info.fullLength, warnings: filled.warnings });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function run() {
    if (!brief.topic.trim()) return;
    setError("");
    setCopied(false);
    startTransition(async () => {
      const res = await generateContent({ ...brief, address: provider.address });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setContent(res.result.content);
      setMeta({ model: res.result.model, attempts: res.result.attempts });
      setDraftId(undefined);
      setView("edit");
    });
  }

  function store() {
    startTransition(async () => {
      const id = await saveDraft({
        id: draftId,
        category: brief.category,
        topic: brief.topic || "(không tiêu đề)",
        brief: { tone: brief.tone, facts: brief.facts, audience: brief.audience },
        content,
        model: meta?.model ?? null,
      });
      setDraftId(id);
      router.refresh();
    });
  }

  /**
   * `navigator.clipboard` only exists in a secure context — it is undefined when
   * the app is opened over the LAN address the dev server prints, so the button
   * would silently do nothing. Fall back to a selection-based copy, and if even
   * that is blocked, select the text so Ctrl+C works.
   */
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const scratch = document.createElement("textarea");
        scratch.value = content;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(scratch);
        if (!ok) throw new Error("execCommand copy bị chặn");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      outputRef.current?.focus();
      outputRef.current?.select();
      setError("Trình duyệt chặn copy tự động — bài đã được bôi đen sẵn, bấm Ctrl+C.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------- brief */}
      <div className="flex flex-col gap-4">
        <Tile title="Brief" hint={`${examples} bài thật cùng loại làm mẫu`}>
          <div className="rounded-inner border border-dashed border-line-strong bg-surface-2 p-3.5">
            <label className="label" htmlFor="cs-doc">
              Nạp từ tài liệu
            </label>
            <input
              ref={fileRef}
              id="cs-doc"
              type="file"
              accept=".docx,.pdf"
              className="block w-full text-xs text-muted file:mr-2.5 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
              disabled={reading || !provider.hasKey}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readDocument(file);
              }}
            />
            <p aria-live="polite" className="mt-2 text-xs leading-snug text-muted">
              {reading ? (
                "Đang đọc tài liệu…"
              ) : doc ? (
                <>
                  <span className="font-semibold text-ink">{doc.name}</span> —{" "}
                  {doc.chars.toLocaleString("vi-VN")} ký tự, đã điền các trường bên dưới. Soát lại
                  rồi bấm Viết bài.
                </>
              ) : (
                "Thả file .docx hoặc .pdf thông báo vào đây, hệ thống tự điền Loại bài, Chủ đề và Dữ kiện cứng. Chỉ rút thông tin có thật trong file."
              )}
            </p>
            {doc && doc.warnings.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {doc.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 text-xs leading-snug text-warn">
                    <IconWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="label" htmlFor="cs-category">
              Loại bài
            </label>
            <select
              id="cs-category"
              className="input"
              value={brief.category}
              onChange={(e) => set("category", e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="cs-topic">
              Chủ đề
            </label>
            <input
              id="cs-topic"
              className="input"
              placeholder="Mở đăng ký Olympic Tin học & ICPC 2026"
              value={brief.topic}
              onChange={(e) => set("topic", e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="cs-facts">
              Dữ kiện cứng
            </label>
            <textarea
              id="cs-facts"
              className="input min-h-40 font-mono text-xs"
              placeholder={
                "Thời gian: 18h00, thứ 7 ngày 16/08/2026\nĐịa điểm: ...\nLink: ...\nHạn: ...\nKinh phí: ..."
              }
              value={brief.facts}
              onChange={(e) => set("facts", e.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted">
              Dán thô cũng được. Model chỉ được dùng đúng những gì ở đây — thiếu gì nó bỏ dòng đó
              chứ không bịa.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cs-tone">
                Sắc thái
              </label>
              <select
                id="cs-tone"
                className="input input-sm"
                value={brief.tone}
                onChange={(e) => set("tone", e.target.value as Brief["tone"])}
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cs-self">
                Page tự xưng
              </label>
              <select
                id="cs-self"
                className="input input-sm"
                value={brief.selfPronoun}
                onChange={(e) => set("selfPronoun", e.target.value as Brief["selfPronoun"])}
              >
                <option value="chúng tớ">chúng tớ</option>
                <option value="chúng mình">chúng mình</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cs-aud">
                Gọi người đọc
              </label>
              <select
                id="cs-aud"
                className="input input-sm"
                value={brief.audience}
                onChange={(e) => set("audience", e.target.value)}
              >
                {["các cậu", "các bạn", ...(club.memberTerm ? [club.memberTerm] : [])].map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cs-tags">
                Hashtag thêm
              </label>
              <input
                id="cs-tags"
                className="input input-sm"
                placeholder="#OLP2026 #ICPC"
                value={brief.extraTags}
                onChange={(e) => set("extraTags", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={brief.withFooter}
              aria-label="Kèm footer CLB"
              onClick={() => set("withFooter", !brief.withFooter)}
              className={cn("check", brief.withFooter && "check-on")}
            >
              <IconCheck className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
            <span className="text-sm text-ink">Kèm footer CLB</span>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !brief.topic.trim() || !provider.hasKey}
            onClick={run}
          >
            <IconSparkle />
            {pending ? "Đang viết…" : "Viết bài"}
          </button>

          {!provider.hasKey && (
            <p className="text-xs font-semibold text-warn">
              Chưa có API key — vào Settings → AI provider để điền trước.
            </p>
          )}
          <p className="tile-hint tabular-nums">
            {provider.model || "chưa chọn model"} · {providerHost}
          </p>
        </Tile>

        {drafts.length > 0 && (
          <Tile title="Bài đã lưu" hint={`${drafts.length} bản`}>
            <ul className="flex flex-col">
              {drafts.map((d) => (
                <li key={d.id} className="list-row gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left transition hover:text-accent"
                    onClick={() => {
                      setContent(d.content);
                      setDraftId(d.id);
                      setBrief((b) => ({ ...b, topic: d.topic, category: d.category as Category }));
                      setMeta(d.model ? { model: d.model, attempts: 0 } : null);
                    }}
                  >
                    <span className="block truncate text-sm font-semibold">{d.topic}</span>
                    <span className="tile-hint block tabular-nums">
                      {d.updated_at.slice(0, 10)} · {d.score}/100
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm btn-danger"
                    aria-label={`Xoá bản nháp ${d.topic}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteDraft(d.id);
                        if (draftId === d.id) setDraftId(undefined);
                        router.refresh();
                      })
                    }
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Tile>
        )}
      </div>

      {/* ------------------------------------------------------------ output */}
      <div className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-inner border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            {error}
          </p>
        )}

        <Tile
          title="Bài đăng"
          hint={
            meta
              ? `${meta.model}${meta.attempts ? ` · ${meta.attempts} lượt` : ""} · sửa tay được, điểm cập nhật theo`
              : "Kết quả hiện ở đây"
          }
          action={
            content ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="seg" role="group" aria-label="Chế độ xem">
                  {VIEWS.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={view === mode}
                      onClick={() => setView(mode)}
                      className={cn("seg-btn", view === mode && "seg-on")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
                  <IconCopy />
                  {copied ? "Đã copy" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={store}
                >
                  {draftId ? "Cập nhật" : "Lưu"}
                </button>
              </div>
            ) : null
          }
        >
          {content ? (
            view === "edit" ? (
              <textarea
                ref={outputRef}
                className="input min-h-[30rem] text-sm leading-relaxed whitespace-pre-wrap"
                aria-label="Nội dung bài đăng"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            ) : (
              <FacebookPreview text={content} />
            )
          ) : (
            <EmptyState
              title="Chưa có bài nào"
              hint={`Điền brief bên trái rồi bấm Viết bài. Bài sinh ra được chấm theo 15 tiêu chí đo từ ${corpus.total} bài thật của page.`}
            />
          )}
        </Tile>

        {lint && (
          <Tile
            title="Chấm giọng văn"
            hint={`${lint.failed} lỗi · ${lint.warned} cảnh báo · ${content.length.toLocaleString("vi-VN")} ký tự`}
            action={
              <Ring
                value={lint.score}
                max={100}
                size={72}
                stroke={8}
                tone={scoreTone(lint.score)}
                label={<span className="text-lg font-extrabold">{lint.score}</span>}
              />
            }
          >
            <ul>
              {lint.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
          </Tile>
        )}

        <p className="px-1 text-xs leading-relaxed text-muted">
          Corpus: {corpus.total} bài thật, {corpus.from_date} → {corpus.to_date}. Chạy{" "}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px]">
            npm run import:posts
          </code>{" "}
          để nạp lại sau khi crawl thêm.
        </p>
      </div>
    </div>
  );
}
