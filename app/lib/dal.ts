import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { findUserById, type Role } from "./users";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session?.userId) return null;
  return findUserById(session.userId);
});

export function homeFor(role: Role) {
  return role === "admin" ? "/admin/dashboard" : "/dashboard";
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/admin");
  return user;
}
