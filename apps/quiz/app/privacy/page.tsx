import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const EFFECTIVE_DATE = "June 8, 2026";
const PRIVACY_EMAIL = "privacy@celo.org";

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100%",
        background: "var(--bg)",
        color: "var(--ink)",
        padding: "20px 20px 48px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/"
          className="mq-body"
          style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-soft)" }}
        >
          ← Back
        </Link>
      </div>

      <header style={{ textAlign: "center", marginBottom: 24 }}>
        <Image
          src="/logo.svg"
          alt="Mini Quiz"
          width={160}
          height={82}
          priority
          style={{ height: "auto", width: 140, margin: "0 auto 12px" }}
        />
        <h1 className="mq-h1" style={{ fontSize: 26, marginBottom: 4 }}>
          Privacy Policy
        </h1>
        <p className="mq-body" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          MiniQuiz Privacy Policy · Effective Date: {EFFECTIVE_DATE}
        </p>
      </header>

      <article style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Section n="1" title="Introduction and Scope">
          <P>
            This Privacy Policy explains how Celo Core Co. processes personal data
            when you use the Services, including the following Mini Apps:
            MiniQuiz, Mondeto, and MiniStreak, offered through the MiniPay
            environment on the Celo Network. This Privacy Policy along with the{" "}
            <Link
              href="/terms"
              style={{ color: "var(--primary-shade)", fontWeight: 700 }}
            >
              Celo Mini Apps Terms and Conditions
            </Link>{" "}
            forms part of a legally binding contract between Celo Core Co. and you.
          </P>
        </Section>

        <Section n="2" title="Data Controller and Contact Information">
          <P>
            cLabs, Inc. d/b/a Celo Core Co. (&ldquo;Celo Core Co.&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo; or &ldquo;our&rdquo;) acts as the Data Controller of any personal
            data collected via the Services. Celo Core Co. is responsible for
            ensuring that the systems and processes we use are compliant with data
            protection laws, to the extent applicable to us. Celo Core Co.
            personnel are required to comply with this Privacy Policy, where
            appropriate.
          </P>
          <P>
            Privacy contact: <Mail />
          </P>
        </Section>

        <Section n="3" title="Personal Data We Collect">
          <P>
            We collect information that you provide when using the Mini Apps, as
            well as certain technical and usage data. We process the minimum data
            needed to operate the games.
          </P>
          <P>The categories of personal data we collect are:</P>
          <List
            items={[
              "Blockchain data: your public Wallet address and on-chain transactions associated with your use of the Services. This data is publicly recorded on the Celo Network blockchain.",
              "Username: an optional display name you choose. For some games usernames/names are stored off-chain per game and for others usernames are stored on-chain only, with no off-chain database.",
              "Usage and device data: app interaction and technical data, including device IP address and associated location data, identifiers associated with your device, device type, web browser characteristics, language preferences, and dates and times of use.",
              "Data you provide to us: data that we may receive from you, in particular as is relevant for troubleshooting, user assistance and support, and bug reports / fixes.",
            ]}
          />
          <P>
            We do not use cookies or similar tracking technologies at this time.
          </P>
        </Section>

        <Section n="4" title="The Blockchain and Public Data">
          <P>
            Transactions submitted through the Services are recorded on the Celo
            blockchain, which is publicly accessible, transparent, and immutable.
            Data written on-chain, including Wallet addresses, transactions, and
            in certain cases usernames, cannot be altered, erased, or made private
            by us and is outside our control. Please consider this carefully
            before transacting.
          </P>
        </Section>

        <Section n="5" title="How We Use Personal Data and Legal Bases">
          <P>We use the personal data we collect for the following purposes:</P>
          <List
            items={[
              "To operate and provide the Services, including administering prize payouts for certain Mini Apps;",
              "To make our Services more intuitive and easy to use, using device data and other information you provide;",
              "To secure, debug, and monitor the Services, and to prevent abuse and misuse;",
              "To improve and develop our Services and user experience;",
              "To comply with legal obligations;",
              "To carry out any other purpose for which the information was collected.",
            ]}
          />
          <P>
            Where the GDPR or similar data protection law applies, our legal bases
            for processing are performance of a contract, legitimate interests,
            compliance with legal obligations, and consent where required by
            applicable law.
          </P>
        </Section>

        <Section n="6" title="Cookies and Similar Technologies">
          <P>
            The Mini Apps do not currently use cookies, local storage for
            tracking, or similar technologies. If this changes, this Policy will
            be updated and any required consent mechanism implemented.
          </P>
        </Section>

        <Section n="7" title="Sharing and Disclosure">
          <P>We do not sell personal data. We may share personal data:</P>
          <List
            items={[
              "With our affiliates, vendors, consultants, and other service providers who need access to such information to carry out work on our behalf.",
              "With the MiniPay environment and the Celo network, as necessary to deliver the Services. These operate under their own terms and privacy practices.",
              "In response to a lawful request for information if we believe disclosure is required by applicable law, regulation, or legal process.",
              "If we believe your actions are inconsistent with our user agreements or policies, or to protect the rights, property, and safety of us or any third party.",
              "In connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business.",
              "With your consent or at your direction.",
            ]}
          />
          <P>
            We may also share aggregated or de-identified information that cannot
            reasonably be used to identify you.
          </P>
        </Section>

        <Section n="8" title="International Transfers">
          <P>
            Personal data may be processed outside your country, including outside
            the EEA and UK. Celo Core Co.&apos;s headquarters and some of its IT
            systems, including email, are located in the United States. Where
            transfers outside the EEA or UK are required, we protect those
            transfers using appropriate safeguards.
          </P>
        </Section>

        <Section n="9" title="Data Retention">
          <P>
            In general, we retain personal data only for as long as necessary for
            the purposes described in this Policy, and in accordance with
            applicable legal and regulatory obligations.
          </P>
        </Section>

        <Section n="10" title="Security">
          <P>
            We maintain administrative, technical, and physical safeguards designed
            to protect personal data against accidental, unlawful, or unauthorized
            destruction, loss, alteration, access, disclosure, or use. No method
            of transmission or storage is fully secure, and you remain responsible
            for the security of your Wallet and private keys.
          </P>
        </Section>

        <Section n="11" title="Your Rights">
          <P>
            Subject to applicable law, you may have rights in relation to your
            personal data. These may include access, rectification, erasure,
            objection or restriction, data portability, and withdrawal of consent
            where processing is based on consent.
          </P>
          <P>
            California residents may additionally have rights under the CCPA/CPRA
            to know what personal information is collected, sold, or disclosed;
            delete personal information; correct inaccurate personal information;
            opt out of the &apos;sale&apos; or &apos;sharing&apos; of personal
            information; and not be discriminated against for exercising these
            rights.
          </P>
          <P>
            To exercise your rights, please contact us at <Mail />. Please note
            that rights cannot be exercised over immutable blockchain data,
            including Wallet addresses and transaction data, which is outside our
            control.
          </P>
        </Section>

        <Section n="12" title="Children">
          <P>
            The Services are not directed to children under the age of 18. If you
            learn that a child under the age of 18 has provided personal
            information without consent, please contact us at <Mail /> so we can
            take appropriate steps to delete it.
          </P>
        </Section>

        <Section n="13" title="Third-Party Links and Services">
          <P>
            The Services may rely on or link to third-party services with their
            own privacy practices. We have no control or responsibility for any
            third-party services and linking to or permitting the use, access, or
            installation of any third-party services does not imply approval or
            endorsement of the service or their privacy practices by Celo Core Co.
            We recommend carefully reviewing the privacy policy of each
            third-party service prior to use.
          </P>
        </Section>

        <Section n="14" title="Changes to this Policy">
          <P>
            We reserve the right to change and update this Privacy Policy from
            time to time. If we make changes, you will be notified of the change
            by the updated date at the top of the Policy.
          </P>
        </Section>

        <Section n="15" title="Contact and Complaints">
          <P>
            For privacy enquiries, please contact us at <Mail />. If you are
            located in the EEA or UK, you also have the right to lodge a complaint
            with your local data protection supervisory authority.
          </P>
        </Section>
      </article>

      <footer
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid var(--line)",
          textAlign: "center",
        }}
      >
        <Link href="/">
          <span
            className="mq-body"
            style={{ fontSize: 14, fontWeight: 800, color: "var(--primary-shade)" }}
          >
            Back to Mini Quiz
          </span>
        </Link>
        <div style={{ marginTop: 10 }}>
          <Link
            href="/terms"
            className="mq-body"
            style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-soft)" }}
          >
            Terms &amp; Conditions
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2
        className="mq-h2"
        style={{ fontSize: 17, marginBottom: 8, lineHeight: 1.3 }}
      >
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p
      className="mq-body"
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--ink-soft)",
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul
      className="mq-body"
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--ink-soft)",
        margin: "0 0 10px",
        paddingLeft: 20,
        listStyle: "disc",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Mail() {
  return (
    <a
      href={`mailto:${PRIVACY_EMAIL}`}
      style={{ color: "var(--primary-shade)", fontWeight: 700 }}
    >
      {PRIVACY_EMAIL}
    </a>
  );
}
