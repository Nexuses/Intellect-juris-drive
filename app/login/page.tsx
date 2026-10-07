import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { getCurrentUser, homeFor } from "@/app/lib/dal";
import { AuthCard } from "@/app/ui/auth-card";
import { AuthForm } from "@/app/ui/auth-form";

export const metadata: Metadata = { title: "Log in | Intellect Juris" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue to your workspace."
      footer="Use the email and password provided for your workspace."
    >
      <AuthForm action={login} submitLabel="Log In" pendingLabel="Logging in..." />
    </AuthCard>
  );
}
