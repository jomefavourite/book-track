import LegalPage, {
  ContactEmail,
  LegalLink,
  LegalList,
  LegalSection,
} from "@/components/LegalPage";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "What personal data BookTrackr collects, why, who processes it, and how to access or delete it.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          BookTrackr helps you plan and track your reading, alone or with a
          community. This policy explains what we collect to do that, who
          helps us run the service, and how you can see, change or delete your
          data. We don&apos;t sell your personal data, and we don&apos;t show ads.
        </p>
      }
    >
      <LegalSection id="who-we-are" title="Who we are">
        <p>
          BookTrackr (booktrackr.app) is built and operated by Favourite Jome,
          who is the data controller for the personal data described here. For
          any privacy question or request, email <ContactEmail />.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" title="What we collect">
        <p>
          <strong>Account details.</strong>{" "}When you sign up, our
          authentication provider collects your name, email address and
          profile picture (for example from Google if you sign in with it). We
          keep a copy of these in our database, along with a public profile
          link (a &ldquo;slug&rdquo;) generated from your name.
        </p>
        <p>
          <strong>Your books and reading activity.</strong>{" "}Book titles,
          authors, page and chapter counts, reading schedules and dates, tags,
          optional &ldquo;buy&rdquo; links, and your daily log: pages or
          chapters read, the page you stopped on, and missed days.
        </p>
        <p>
          <strong>Reflection notes.</strong>{" "}Any notes you write about a
          reading day. These are private unless you choose to share a book&apos;s
          combined reflection publicly.
        </p>
        <p>
          <strong>Community activity.</strong>{" "}Communities you create or join,
          your role in them, invite links you create, and anything you add as
          a community owner or admin (names, descriptions, logos, cover images,
          social links, schedules and notes). If you request permission to
          create communities, we store your name, email and the reason you
          give.
        </p>
        <p>
          <strong>Reminder settings.</strong>{" "}Whether reminders are on, the
          times you choose, your time zone, the channel you prefer, and, if you
          allow browser notifications, a push subscription from your browser
          (an endpoint URL and encryption keys) so we can send them.
        </p>
        <p>
          <strong>Usage and device data.</strong>{" "}Pages visited, referrer,
          browser and device type, country-level location derived from your IP
          address, and product events such as &ldquo;book created&rdquo; or
          &ldquo;day marked read&rdquo;. We use this to understand how
          BookTrackr is used and to improve it.
        </p>
        <p>
          <strong>Data stored on your device.</strong>{" "}We use your
          browser&apos;s local storage to remember your theme and some app
          state, and our authentication provider sets cookies that keep you
          signed in. We don&apos;t use advertising cookies.
        </p>
        <p>
          <strong>Messages you send us.</strong>{" "}If you email us, we keep the
          message and your email address to reply.
        </p>
      </LegalSection>

      <LegalSection id="public-data" title="What other people can see">
        <p>
          New books are public by default, with your name shown as the
          reader. You can make a book private when you create it or at any
          time by editing it. A public book&apos;s title, author, schedule and
          progress appear on its own page, in the public library and on your
          public profile, which shows your name and profile picture. Your
          email address appears on a public book only if you switch that
          option on, and reflection notes stay private unless you choose to
          share them. Public pages can be indexed by search engines.
        </p>
        <p>
          In a community, other members can see that you&apos;re a member,
          your role, and content you add as an owner or admin. Public
          communities can be seen by anyone.
        </p>
      </LegalSection>

      <LegalSection id="why" title="Why we use it">
        <LegalList>
          <li>
            <strong>To provide the service</strong>: your account, your
            reading plans, progress, reminders and communities. We rely on our
            contract with you (our <LegalLink href="/terms">Terms</LegalLink>)
            for this.
          </li>
          <li>
            <strong>To show what you share</strong>: public books, profiles
            and communities. Sharing is part of how BookTrackr works, and you
            control it with each book&apos;s sharing settings, which you can
            change at any time.
          </li>
          <li>
            <strong>To improve and secure BookTrackr</strong>: usage analytics,
            debugging and preventing abuse, based on our legitimate interest
            in running a reliable product.
          </li>
          <li>
            <strong>To reply to you</strong>{" "}when you contact us.
          </li>
        </LegalList>
        <p>
          We don&apos;t use your data for automated decisions that have legal
          or similarly significant effects on you, and we don&apos;t sell it.
        </p>
      </LegalSection>

      <LegalSection id="processors" title="Services that process your data">
        <p>
          We use a small number of providers to run BookTrackr. They process
          data on our behalf and only for the purposes above.
        </p>
        <LegalList>
          <li>
            <strong>Clerk</strong>: sign-in, accounts and session cookies.
          </li>
          <li>
            <strong>Convex</strong>: our database, file storage and background
            jobs (such as scheduling reminders).
          </li>
          <li>
            <strong>Vercel</strong>: hosting, and Vercel Web Analytics for
            privacy-friendly page-view statistics.
          </li>
          <li>
            <strong>Sabilytics</strong>: website analytics and product events.
            Our public{" "}
            <LegalLink href="/live">Live Room</LegalLink>{" "}shows recent visits
            by page and country only, never by person.
          </li>
          <li>
            <strong>Your browser&apos;s push service</strong>{" "}(for example
            Google, Apple or Mozilla) delivers reminder notifications if you
            turn them on.
          </li>
        </LegalList>
        <p>
          Some of these providers are based in or store data in the United
          States and other countries. Where the law requires it, we rely on
          safeguards such as the providers&apos; Standard Contractual Clauses
          for those transfers.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <p>
          We keep your account data for as long as your account exists. When
          your account is deleted, we delete your profile, books, reading
          logs, reflection notes, tags, reminder settings and push
          subscriptions from our live database, and delete your account
          from our authentication provider. Copies may stay in encrypted
          backups for a short time until they expire. Analytics data
          isn&apos;t linked to your account and is kept in aggregate.
        </p>
        <p>
          If you own a community, you&apos;ll need to delete it, or ask us to
          hand it over to another admin, before you can delete your account,
          so other members don&apos;t lose access without warning. Books you
          added to someone else&apos;s community stay with that community, but
          your name is removed from them.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="Your rights and choices">
        <p>
          Depending on where you live (for example under the UK or EU GDPR,
          Nigeria&apos;s Data Protection Act, or US state privacy laws), you
          may have the right to:
        </p>
        <LegalList>
          <li>access a copy of the personal data we hold about you;</li>
          <li>correct data that&apos;s wrong or incomplete;</li>
          <li>delete your account and personal data;</li>
          <li>receive your data in a portable format;</li>
          <li>object to or restrict some uses, such as analytics;</li>
          <li>withdraw consent, such as making a public book private again.</li>
        </LegalList>
        <p>
          You can edit your books, sharing settings and reminders yourself in
          the app. You can delete your account at any time from{" "}
          <strong>Settings → Delete account</strong>. For anything else, or
          if you can&apos;t sign in, email <ContactEmail />{" "}from the address
          on your account. We may ask you to confirm the request so we know
          it&apos;s really you, and we&apos;ll respond within one month. You can also complain to your local data
          protection authority.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          Data is encrypted in transit, and access to our systems is limited
          to what&apos;s needed to run the service. No system is perfectly
          secure, but if a breach affects your personal data, we&apos;ll tell
          you and the relevant authorities as required by law.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          BookTrackr is not intended for children under 13, and we don&apos;t
          knowingly collect their data. If you believe a child has created an
          account, contact us and we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          If we change how we handle your data, we&apos;ll update this page and
          the date at the top. For significant changes, we&apos;ll also let
          you know in the app or by email.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
