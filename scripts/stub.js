// Stand-in for `server-only` and `next/cache` when the data layer runs outside Next.js.
module.exports = { revalidatePath() {}, revalidateTag() {} };
