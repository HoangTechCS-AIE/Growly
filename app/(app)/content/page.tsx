import { ContentStudio } from "@/components/content-studio";
import { EmptyState, PageHeader, Tile } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { clubConfig, isClubConfigured } from "@/lib/config";
import { corpusStats } from "@/lib/content/corpus";
import { getPublicProviderConfig } from "@/lib/content/provider";
import { listDrafts } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Both gates render the same shell, so a half-set-up install still looks like
    the rest of the app rather than a stack trace. */
function Gate({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Content" subtitle="Viết bài fanpage theo giọng văn của chính page" />
      <Tile>
        <EmptyState title={title} hint={hint} />
      </Tile>
    </div>
  );
}

export default async function ContentPage() {
  await requireUser();

  const club = clubConfig();
  if (!isClubConfigured(club)) {
    return (
      <Gate
        title="Thiếu CLUB_NAME trong .env"
        hint="Copy .env.example thành .env rồi điền tên câu lạc bộ, fanpage, email, website và địa chỉ. Footer của bài đăng và bộ chấm điểm đều dựa vào đó."
      />
    );
  }

  const corpus = corpusStats();
  if (corpus.total === 0) {
    return (
      <Gate
        title="Chưa nạp bài nào"
        hint="Đặt kho bài đã crawl vào data/<post_id>/post.json rồi chạy npm run import:posts. Studio cần corpus để lấy bài mẫu cùng thể loại."
      />
    );
  }

  const provider = getPublicProviderConfig();
  const drafts = listDrafts();

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle={`Giọng văn đo từ ${corpus.total} bài thật (${corpus.from_date} → ${corpus.to_date})`}
        actions={
          <>
            <span className="tag">{corpus.total} bài mẫu</span>
            <span className={provider.hasKey ? "tag tag-accent" : "tag tag-warn"}>
              {provider.hasKey ? provider.model || "provider sẵn sàng" : "chưa có API key"}
            </span>
          </>
        }
      />
      <ContentStudio
        corpus={{
          total: corpus.total,
          from_date: corpus.from_date,
          to_date: corpus.to_date,
          byCategory: Object.fromEntries(corpus.by_category.map((c) => [c.category, c.n])),
        }}
        drafts={drafts}
        provider={{
          model: provider.model,
          baseUrl: provider.baseUrl,
          hasKey: provider.hasKey,
          address: provider.address,
        }}
        club={{ name: club.name, footerMarker: club.footerMarker, memberTerm: club.memberTerm }}
      />
    </div>
  );
}
