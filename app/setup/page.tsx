import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { createFirstAccount } from "@/lib/auth-actions";
import { hasAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  // Runs once. After the account exists this route is just a way back to /login.
  if (hasAccount()) redirect("/login");

  return (
    <AuthForm
      action={createFirstAccount}
      title="Set your account"
      hint="Pick the username and password that will open Growly from now on."
      submitLabel="Create account"
      confirmPassword
    />
  );
}
