import type { Metadata } from "next";
import { requireAdmin } from "@/app/lib/dal";
import { formatDate } from "@/app/lib/format";
import { listUsers } from "@/app/lib/users";
import { UserAvatar } from "@/app/ui/user-avatar";
import { AddUserForm } from "./add-user-form";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "User Management | Intellect Juris" };

export default async function UserManagementPage() {
  await requireAdmin();
  const users = await listUsers();

  return (
    <div>
      <h1 className="text-[22px] font-normal">User Management</h1>
      <p className="mt-1 text-sm text-ink/60">
        Create accounts for your team. Only users created here can sign in from the user
        login page.
      </p>

      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border border-sand bg-white p-6 shadow-[0_1px_2px_rgba(41,45,48,0.05)] transition hover:shadow-[0_16px_36px_-24px_rgba(165,139,96,0.7)]">
          <h2 className="text-lg font-semibold text-ink">Create User</h2>
          <p className="mb-5 mt-0.5 text-sm text-ink/60">
            The user can sign in with this email and password.
          </p>
          <AddUserForm />
        </div>

        <div className="overflow-hidden rounded-2xl border border-sand">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-sand bg-cream text-ink/60">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {users.map((user) => (
                <tr key={user.id} className="transition hover:bg-sand/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={user.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-xs text-ink/60">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-ink text-cream"
                          : "bg-sand text-ink"
                      }`}
                    >
                      {user.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink/70">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-3">
                    <UserActions
                      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
