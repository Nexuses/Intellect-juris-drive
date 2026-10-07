import { logout } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-full border border-sand px-4 py-1.5 text-sm font-medium text-ink transition hover:border-gold hover:bg-sand"
      >
        Log out
      </button>
    </form>
  );
}
