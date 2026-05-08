import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { ToastProvider } from "@/components/Toast";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/signin?error=forbidden");

  return (
    <ToastProvider>
    <div className="min-h-screen">
      {/* Mobile gate — admin CMS is desktop-only. */}
      <div
        className="flex min-h-screen items-center justify-center p-6 text-center md:hidden"
        style={{ background: "var(--a-bg)" }}
      >
        <div
          className="max-w-sm rounded-2xl bg-white p-6"
          style={{ border: "1px solid var(--a-line)" }}
        >
          <h1 className="font-display text-xl font-black">Open on desktop</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--a-ink-soft)" }}>
            The Mini Quiz admin portal is designed for desktop use. Please open this page on a wider screen.
          </p>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex min-h-screen" style={{ background: "var(--a-bg)" }}>
        <Sidebar
          user={{
            email: session.user.email ?? null,
            name: session.user.name ?? null,
          }}
          onSignOut={<SignOutButton />}
        />
        <div className="flex flex-1 flex-col min-w-0">{children}</div>
      </div>
    </div>
    </ToastProvider>
  );
}
