import LegalPage, {
  ContactEmail,
  LegalLink,
  LegalList,
  LegalSection,
} from "@/components/LegalPage";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Terms of Service",
  description:
    "The rules for using BookTrackr: your account, your content, communities, and our responsibilities.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between you and BookTrackr
          (booktrackr.app), operated by Favourite Jome. By creating an account
          or using BookTrackr, you agree to them. If you don&apos;t agree,
          please don&apos;t use the service.
        </p>
      }
    >
      <LegalSection id="the-service" title="The service">
        <p>
          BookTrackr lets you plan reading schedules, log your progress, write
          reflection notes, get reminders, share reading journeys publicly
          and read together in communities. BookTrackr is currently free. We
          may add, change or remove features over time.
        </p>
      </LegalSection>

      <LegalSection id="your-account" title="Your account">
        <LegalList>
          <li>You must be at least 13 years old to use BookTrackr.</li>
          <li>
            Give accurate account details and keep your sign-in method secure.
            You&apos;re responsible for activity on your account.
          </li>
          <li>
            Tell us at <ContactEmail />{" "}if you think someone else has accessed
            your account.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-content" title="Your content">
        <p>
          You own what you add to BookTrackr: your books, logs, notes, tags
          and community content. You give us a limited licence to store,
          process and display it only as needed to run the service, including
          showing it publicly when you make a book, profile or community
          public. This licence ends when you delete the content or your
          account, except for copies in backups that expire on their own.
        </p>
        <p>
          You&apos;re responsible for what you share. Only upload content,
          such as logos and cover images, that you have the right to use.
        </p>
      </LegalSection>

      <LegalSection id="communities" title="Communities">
        <p>
          Community owners and admins set the reading schedule, invite and
          remove members, and manage the community&apos;s content. They are
          responsible for running their community within these terms.
          Members can leave at any time. We may remove communities or
          content that break these terms.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="Acceptable use">
        <p>When using BookTrackr, don&apos;t:</p>
        <LegalList>
          <li>
            post content that is illegal, hateful, harassing or sexually
            explicit, or that infringes someone else&apos;s rights;
          </li>
          <li>impersonate others or share other people&apos;s personal data;</li>
          <li>spam, or use invite links or buy links to mislead people;</li>
          <li>
            try to break, overload, scrape or get unauthorised access to the
            service or other users&apos; data;
          </li>
          <li>use BookTrackr to break any law.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="ending" title="Ending your use">
        <p>
          You can stop using BookTrackr and delete your account at any time
          from <strong>Settings → Delete account</strong>. If you can&apos;t
          sign in, email <ContactEmail />{" "}from the address on your account
          and we&apos;ll complete the deletion within one month.
        </p>
        <p>
          When your account is deleted, we permanently remove your profile,
          books, reading logs, reflection notes, tags, reminder settings and
          push subscriptions from our database, and delete your sign-in
          account. Your public books and profile stop being visible straight
          away. If you own a community, you&apos;ll first need to delete it or ask
          us to hand it over to another admin. Copies in our encrypted backups
          are removed automatically when those backups expire. Anonymous
          analytics that can&apos;t identify you are kept. See our{" "}
          <LegalLink href="/privacy#retention">Privacy Policy</LegalLink>{" "}for
          details.
        </p>
        <p>
          We may suspend or close an account that seriously or repeatedly
          breaks these terms, or if the law requires us to. Where we can,
          we&apos;ll tell you why first.
        </p>
      </LegalSection>

      <LegalSection id="privacy" title="Privacy">
        <p>
          How we collect and use personal data is explained in our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="Disclaimers">
        <p>
          BookTrackr is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. We work to keep it reliable, but we can&apos;t
          promise it will always be available, error-free, or that reminders
          will always arrive on time. Keep your own copy of anything you
          can&apos;t afford to lose.
        </p>
        <p>
          Public books and communities are created by users. We don&apos;t
          endorse them, and buy links point to third-party sites we don&apos;t
          control.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Limitation of liability">
        <p>
          To the extent the law allows, BookTrackr and its operator are not
          liable for indirect or consequential losses, or for loss of data,
          arising from your use of the service. Because the service is free,
          our total liability to you for any claim is limited to £50 (or the
          equivalent in your currency). Nothing in these terms limits
          liability that can&apos;t be limited by law, or your rights as a
          consumer.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <p>
          We may update these terms. We&apos;ll change the date at the top and,
          for significant changes, let you know in the app or by email before
          they take effect. If you keep using BookTrackr after that, the new
          terms apply.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions about these terms? Email <ContactEmail />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
