import Link from "next/link";
import { SITE_NAME } from "@/lib/metadata";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <p>
          © {year} {SITE_NAME}
        </p>
        <p>
          Built by{" "}
          <Link
            href="https://favouritejome.com"
            target="_blank"
            rel="noopener noreferrer author"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Favourite Jome
          </Link>
        </p>
      </div>
    </footer>
  );
}
