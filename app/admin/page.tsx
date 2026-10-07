import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogin, setupAdmin } from "@/app/actions/auth";
import { getCurrentUser } from "@/app/lib/dal";
import { hasAdmin } from "@/app/lib/users";
import { AuthCard } from "@/app/ui/auth-card";
import { AuthForm } from "@/app/ui/auth-form";

export const metadata: Metadata = { title: "Admin login | Intellect Juris" };

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin/dashboard");

  if (!(await hasAdmin())) {
    return (
      <AuthCard
        title="Set up admin account"
        subtitle="Create the first account. It will become the workspace admin."
        footer="This one-time setup is only available until an admin exists."
      >
        <AuthForm
          action={setupAdmin}
          submitLabel="Create Admin Account"
          pendingLabel="Creating account..."
          showName
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Admin login"
      subtitle="Sign in to the admin console."
      footer={
        <Link href="/login" className="underline hover:text-zinc-600">
          Back to user login
        </Link>
      }
    >
      <AuthForm action={adminLogin} submitLabel="Log In" pendingLabel="Logging in..." />
    </AuthCard>
  );
}
