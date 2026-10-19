import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export const LEGAL_CONTACT_EMAIL = "hello@booktrackr.app";
export const LEGAL_LAST_UPDATED = "19 October 2026";

type LegalPageProps = {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
};

/** Shared shell for the Privacy Policy and Terms of Service pages. */
export default function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 border-b border-border pb-8">
          <p className="text-sm text-muted-foreground">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <div className="mt-4 text-base leading-7 text-muted-foreground">
            {intro}
          </div>
        </header>
        <div className="space-y-10">{children}</div>
        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          See also our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> and{" "}
          <LegalLink href="/terms">Terms of Service</LegalLink>.
        </p>
      </main>
      <Footer />
    </>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-border">{children}</ul>;
}

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  return (
    <Link
      href={href}
      {...(isExternal && !href.startsWith("mailto:")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="font-medium text-foreground underline underline-offset-4 hover:opacity-80"
    >
      {children}
    </Link>
  );
}

export function ContactEmail() {
  return (
    <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
      {LEGAL_CONTACT_EMAIL}
    </LegalLink>
  );
}
