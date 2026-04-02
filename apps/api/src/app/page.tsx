export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight">
            Casper&apos;s Kitchen
          </span>
          <nav className="flex gap-6 text-sm text-muted-foreground">
            <a href="#menu" className="hover:text-foreground transition-colors">
              Menu
            </a>
            <a
              href="#about"
              className="hover:text-foreground transition-colors"
            >
              About
            </a>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mx-auto max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Delicious food,
            <br />
            delivered fast.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Casper&apos;s Kitchen is a ghost kitchen crafting restaurant-quality
            meals and delivering them straight to your door. No storefront, no
            wait &mdash; just great food.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <a
              href="#menu"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View Menu
            </a>
            <a
              href="#about"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
            >
              Learn More
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} Casper&apos;s Kitchen. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
