import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signIn } from "@/lib/auth-actions";
import { hasAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // An empty database has nobody to sign in as; the first visit sets the account.
  if (!hasAccount()) redirect("/setup");

  const next = (await searchParams).next;

  return (
    <AuthForm
      action={signIn}
      title="Welcome back"
      hint="Growly is private. Sign in to reach your pages."
      submitLabel="Sign in"
      next={Array.isArray(next) ? next[0] : next}
    />
  );
}
