import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/app/lib/dal";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : "/login");
}
