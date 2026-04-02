import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ADMIN_PAGES = [
  {
    href: "/generate",
    title: "Generate user data",
    description:
      "Create simulated users, orders, deliveries, and support cases.",
  },
  {
    href: "/support",
    title: "View active support case",
    description:
      "Look up a support case by ID and watch admin responses in real time.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight">
            Casper&apos;s Kitchen
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Admin
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-lg font-semibold">Admin Tools</h1>
          <div className="grid gap-4">
            {ADMIN_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="group flex items-center justify-between rounded-xl border border-border p-5 transition-colors hover:bg-muted/50"
              >
                <div className="space-y-1">
                  <p className="font-medium">{page.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {page.description}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Casper&apos;s Kitchen. All rights
        reserved.
      </footer>
    </div>
  );
}
