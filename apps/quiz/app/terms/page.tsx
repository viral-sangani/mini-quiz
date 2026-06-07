import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// Effective date is intentionally left as a placeholder until legal sign-off.
// Update this single constant when the date is confirmed.
const EFFECTIVE_DATE = "[TBD]";

const LEGAL_EMAIL = "legal@celo.org";

export default function TermsPage() {
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
          Terms &amp; Conditions
        </h1>
        <p className="mq-body" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Celo Mini Apps · Effective Date: {EFFECTIVE_DATE}
        </p>
      </header>

      <article style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Section n="1" title="Introduction and Acceptance">
          <P>
            These Terms and Conditions (the &ldquo;Terms&rdquo;) govern your access to and
            use of the mini applications operated by cLabs, Inc. d/b/a Celo Core
            Co. (&ldquo;Celo Core Co.&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;), made available
            through the MiniPay environment on the Celo network, including
            MiniQuiz, Mondeto and MiniStreak (collectively the &ldquo;Mini Apps&rdquo; or the
            &ldquo;Services&rdquo; singly a &ldquo;Mini App&rdquo;).
          </P>
          <P>
            These Terms are a legally binding contract between you and us and
            apply in full force and effect to your use of the Services. By
            accessing or using any Mini App you agree to be legally bound by these
            Terms. If you do not agree with the Terms, you must not use the
            Services.
          </P>
          <P>
            These Terms incorporate by reference our Privacy Policy (available at
            [Link to Mini App Privacy Policy]) and any app-specific terms presented
            within a Mini App.
          </P>
        </Section>

        <Section n="2" title="Definitions">
          <P>
            &ldquo;Wallet&rdquo; means the self-custodial blockchain wallet you use to
            interact with a Mini App. We do not create, control, or have access to
            your Wallet. You are solely responsible for securing and controlling
            access to your Wallet, including any private key or back-up phrases
            associated with it.
          </P>
          <P>
            &ldquo;Celo&rdquo; or the &ldquo;Celo Network&rdquo; means the decentralized, permissionless
            Celo blockchain network on which the Services operate. We do not
            control Celo and therefore cannot ensure that transactions will be
            confirmed, processed or completed as intended.
          </P>
          <P>
            &ldquo;Digital Assets&rdquo; means any tokens transacted through the Services
            (including, for example, USDT, USDC, USDm, as applicable to a given
            Mini App).
          </P>
          <P>
            &ldquo;Username&rdquo; means an optional display name a user may add; no identity
            verification is performed.
          </P>
        </Section>

        <Section n="3" title="Eligibility and Availability">
          <P>
            This Site and the Services are not for use by any minors. You must be
            at least 18 years of age to use the Services, or the older age of
            majority in your country. By using the Services you represent and
            warrant that you are at least 18 years old and are legally capable of
            entering into a binding contract and that you are not prohibited from
            using the Services under applicable laws or regulations in your
            country.
          </P>
          <P>
            The Services are available only in those jurisdictions where the
            MiniPay environment is available. Availability may be limited where
            required by law, including regulatory restrictions applicable to
            particular stablecoins in certain jurisdictions. In particular, the
            Services are not offered or made available to users located in the
            People&rsquo;s Republic of China.
          </P>
          <P>
            You may not use the Services if you are subject to applicable sanctions
            or are located in a comprehensively sanctioned jurisdiction (see
            Section 17).
          </P>
        </Section>

        <Section n="4" title="Wallet-Based Access; No Custody; No KYC">
          <P>
            The Services are accessed through your self-custodial Wallet. We do not
            create or hold accounts or private keys, and we do not take custody or
            control of your Digital Assets at any time.
          </P>
          <P>
            We do not perform identity verification (KYC) and do not collect
            identity documents. You may optionally add a Username; you are
            responsible for the content of any Username you choose.
          </P>
          <P>
            You are solely responsible for the security of your Wallet, recovery
            phrase and keys. We cannot reverse transactions or restore access to a
            lost or compromised Wallet.
          </P>
        </Section>

        <Section n="5" title="Description of the Services">
          <P>
            MiniQuiz (miniquiz.club) — a quiz game where you join a global
            community and try to solve quizzes as fast as possible. Judging and
            prize payouts to participants are administered by and according to the
            sole discretion of Celo Core Co. and paid in USDT. There is currently
            no fee for playing MiniQuiz.
          </P>
          <P>
            We may add, modify, suspend or discontinue any feature at any time. The
            Services are provided on an &lsquo;as available&rsquo; basis and depend on
            third-party infrastructure including the MiniPay environment and the
            Celo Network.
          </P>
        </Section>

        <Section n="6" title="Fees &amp; Prizes">
          <P>
            For MiniQuiz, judging and prize amounts are determined in the sole
            discretion of and paid by Celo Core Co. via its admin process in USDT.
            Participating in some of the Services and transacting on the Celo
            Network may require the payment of network &ldquo;gas&rdquo; fees. Gas fees
            fluctuate, are payable by you to network validators, and are
            non-refundable. Applicable amounts and currency are presented to you
            before you confirm a transaction.
          </P>
        </Section>

        <Section n="7" title="Blockchain Transactions and Associated Risks">
          <P>
            Celo Core Co. does not provide trading, investment, or brokerage
            accounts or facilities, nor do we provide investment, financial, tax,
            or accounting advice of any kind. You are solely responsible for
            determining whether the purchasing and transacting in Digital Assets is
            appropriate for you. You acknowledge and accept that:
          </P>
          <List
            items={[
              "Blockchain transactions are irreversible; once confirmed they cannot be cancelled, recalled or refunded by us.",
              "You are responsible for network (gas) fees, which fluctuate and are non-refundable.",
              "Digital Assets can be volatile and may lose value or liquidity.",
              "Smart contracts may contain vulnerabilities, which may be exploited, resulting in loss of value; interaction is at your own risk.",
              "Network congestion, forks, outages or changes to the Celo network or MiniPay environment may interrupt the Services.",
            ]}
          />
        </Section>

        <Section n="8" title="Acceptable Use and Restrictions">
          <P>
            You represent, warrant, and agree not to use the Services to:
          </P>
          <List
            items={[
              "Violate any applicable law or regulation;",
              "Engage in money laundering, fraud or sanctions evasion;",
              "Infringe the copyright, trademark, patent, trade secret or other intellectual property or other proprietary rights of third-parties;",
              "Interfere with, exploit or attack the Services or underlying infrastructure;",
              "Cheat or manipulate game outcomes or rewards;",
              "Circumvent any access or eligibility restriction;",
              "Sell, sublicense or otherwise commercialize any content or material from the Services;",
              "Use a VPN or other means to evade geographic or sanctions-based access restrictions.",
            ]}
          />
        </Section>

        <Section n="9" title="Intellectual Property">
          <P>
            Celo Core Co. and/or its licensors own all rights to the intellectual
            property and material contained in the Services, and all such rights
            are reserved. You are granted a limited, non-exclusive,
            non-transferable, revocable licence to use the Services for their
            intended purpose only, subject to the restrictions in these Terms.
          </P>
        </Section>

        <Section n="10" title="Third-Party Services">
          <P>
            The Services rely on or link to third-party services, including the
            MiniPay environment, the Celo Network, and hosting and infrastructure
            providers. We are not responsible for third-party services, which
            operate under their own terms. We have no control or responsibility for
            any third-party services and linking to or permitting the use, access,
            or installation of any third-party services does not imply approval or
            endorsement of the service by Celo Core Co. You must review and agree
            to the terms and privacy practices of each third-party service you use.
          </P>
        </Section>

        <Section n="11" title="Disclaimers of Warranties">
          <P>
            To the maximum extent permitted by applicable law, the Services are
            provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind.
            Celo Core Co. hereby disclaims all warranties and conditions with
            regard to the services, including all express, implied or statutory
            warranties, and including warranties of merchantability, fitness for a
            particular purpose, non-infringement, availability, accuracy or
            security. We do not represent or warrant that the Services will be
            uninterrupted or error free, that defects will be corrected, or that
            the Services or the server that makes them available are free of
            viruses or other harmful components. You agree that Celo Core Co. is
            not be responsible for unauthorized access to or alteration of your
            devices, transmissions or data, any material or data sent or received
            or not sent or received, or any transactions entered into through the
            Services. Nothing contained in the Services constitutes legal,
            financial or other professional advice.
          </P>
        </Section>

        <Section n="12" title="Limitation of Liability">
          <P>
            In no event shall Celo Core Co. or its officers, directors, employees
            and affiliates be liable for any indirect, incidental, special,
            consequential or punitive damages, or any damages whatsoever,
            including, or loss of profits, Digital Assets, data or goodwill,
            arising out of or in connection with the use or performance of the
            Services, whether based on contract, tort, negligence, strict
            liability, or otherwise, even if Celo Core Co. or its officers,
            directors, employees and affiliates have been advised of the
            possibility of damages. To the that the exclusion or limitation of
            liability is not permitted in certain jurisdictions, this limitation
            may subject to certain restrictions.
          </P>
        </Section>

        <Section n="13" title="Indemnification">
          <P>
            You agree to indemnify and hold harmless Celo Core Co. and its
            officers, directors, employees and affiliates from and against any
            claims, liabilities, costs, demands, causes of action, damages and
            expenses (including reasonable attorneys&rsquo; fees) arising out of or in
            any way related to your use of the Services or your breach of these
            Terms, to the fullest extent permitted by applicable law.
          </P>
        </Section>

        <Section n="14" title="Suspension and Termination">
          <P>
            We may suspend or terminate your access to the Services at any time,
            including where required by law, to protect the Services or other
            users, or where we reasonably believe you have breached these Terms.
            You may stop using the Services at any time. Provisions that by their
            nature should survive termination will do so.
          </P>
        </Section>

        <Section n="15" title="Changes to the Terms or Services">
          <P>
            Celo Core Co. is permitted to revise these Terms from time to time and
            at any time. We will notify you of material changes by updating the
            effective date at the top of these Terms. Celo Core Co. reserves the
            right to modify or discontinue the Services in whole or in part at any
            time. By continuing to use the Services after changes take effect, you
            accept the revised Terms. You are expected to review these Terms
            regularly. If you terminate your use of the Services, your license
            thereto terminates immediately.
          </P>
        </Section>

        <Section n="16" title="Governing Law and Dispute Resolution">
          <P>
            These Terms are governed by and construed in accordance with the laws
            of the State of California and applicable United States federal law
            without giving effect to any conflicts of laws principles that may
            require the application of the laws of a different jurisdiction. You
            submit to the exclusive jurisdiction and venue of the appropriate
            arbitral tribunal located in San Francisco, California for the
            resolution of any disputes.
          </P>
          <P>
            Any claims arising out of, relating to, or connected with these Terms
            must be asserted individually in binding arbitration. Before either
            party may seek arbitration, they must first send the other party a
            written notice of dispute describing the nature and basis of the claim
            and the requested relief. Notices to Celo Core Co. should be sent to:{" "}
            <Mail />. After the notice is received, the parties may attempt to
            resolve the dispute informally for 30 days before either party may
            begin an arbitration proceeding.
          </P>
          <P>
            Arbitration shall be conducted through the American Arbitration
            Association (AAA) under its Consumer Arbitration Rules, available at
            www.adr.org, by a single neutral arbitrator. Claims below USD 10,000
            may be resolved through binding non-appearance-based arbitration. Any
            hearing will be held in San Francisco, California unless the parties
            agree otherwise. The United States Arbitration Act governs the
            interpretation and enforcement of these arbitration provisions.
          </P>
          <P>
            There is only one exception to the arbitration requirement: Celo Core
            Co. may seek injunctive or other appropriate relief in any court of
            competent jurisdiction where it reasonably believes you have violated
            or threatened to violate its intellectual property rights.
          </P>
          <P style={{ fontWeight: 800 }}>
            TO THE EXTENT ALLOWED BY LAW, YOU AGREE TO IRREVOCABLY WAIVE ANY RIGHT
            TO A TRIAL BY JURY OR TO PARTICIPATE AS A REPRESENTATIVE OR CLASS
            MEMBER IN ANY LAWSUIT, ARBITRATION OR OTHER PROCEEDING FILED AGAINST
            CELO CORE CO.
          </P>
        </Section>

        <Section n="17" title="Compliance and Sanctions">
          <P>
            You represent and warrant that you are not located, ordinarily
            resident, organized, established or domiciled in Iran, Cuba, North
            Korea, Syria, the Russian-occupied regions of Ukraine (Crimea, Donetsk
            and Luhansk), or any other country or jurisdiction against which the
            United States maintains comprehensive economic sanctions or an arms
            embargo.
          </P>
          <P>
            You shall not use, and will not allow any restricted persons to use, a
            VPN or other means to evade geographic or sanctions-based access
            restrictions. You will comply with all applicable export-control,
            anti-money-laundering and sanctions laws when using the Services.
          </P>
        </Section>

        <Section n="18" title="General">
          <P>
            Severability: if any provision of these Terms is found to be
            unenforceable or invalid under applicable law, that provision shall be
            removed without affecting the remaining provisions.
          </P>
          <P>
            Assignment: Celo Core Co. may assign, transfer and subcontract its
            rights and obligations under these Terms without notice or consent. You
            may not assign, transfer or subcontract any of your rights or
            obligations without our consent.
          </P>
          <P>
            Entire Agreement: these Terms, together with our Privacy Policy and any
            app-specific terms, constitute the entire agreement between Celo Core
            Co. and you regarding the Services, and supersede all prior agreements
            and understandings.
          </P>
          <P>
            No Waiver: no failure or delay by Celo Core Co. to enforce any
            provision is a waiver of that provision.
          </P>
          <P>
            Force Majeure: we are not liable for delay or failure caused by events
            beyond our reasonable control.
          </P>
        </Section>

        <Section n="19" title="Securities Disclaimer">
          <P>
            Nothing in these Terms or in the Services constitutes an offer to sell,
            or the solicitation of an offer to buy, any securities or tokens.
          </P>
        </Section>

        <Section n="20" title="Contact">
          <P>
            For questions about these Terms, please contact: <Mail />, Celo Core
            Co.
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

function P({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <p
      className="mq-body"
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--ink-soft)",
        marginBottom: 10,
        ...style,
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
      href={`mailto:${LEGAL_EMAIL}`}
      style={{ color: "var(--primary-shade)", fontWeight: 700 }}
    >
      {LEGAL_EMAIL}
    </a>
  );
}
