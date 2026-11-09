import { QUANTUM_DISCLAIMER } from "@/lib/quantum/index";

export const metadata = { title: "Docs & methodology — WHITEHAT" };

export default function DocsPage() {
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure stack" style={{ ["--gap" as string]: "16px" }}>
        <div>
          <div className="eyebrow">Docs &amp; methodology</div>
          <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>How WHITEHAT works</h1>
        </div>

        <Section title="One report, three lenses">
          <p>
            A WHITEHAT report covers three things: smart-contract breach risk, quantum readiness, and — for your own
            wallet — privacy exposure. Contracts get the first two; wallets get quantum readiness publicly and the
            privacy report only after you prove ownership.
          </p>
        </Section>

        <Section title="Evidence levels">
          <p>Every finding carries one of three levels, and the level is enforced in code:</p>
          <ul>
            <li>
              <strong>Confirmed on fork</strong> — a test reproduced the issue on a private local fork of the contract.
              This is the only level that means &quot;we demonstrated it&quot;.
            </li>
            <li>
              <strong>Likely</strong> — strong static evidence from verified source or bytecode (including Slither), not
              reproduced on a fork.
            </li>
            <li>
              <strong>Review</strong> — an AI reviewer flagged it. It is a lead for a human to verify, never shown as a
              confirmed bug. AI suspicion can never be promoted above this level.
            </li>
          </ul>
        </Section>

        <Section title="Proof on a private fork, never the live chain">
          <p>
            To confirm an issue, WHITEHAT starts a private local fork (an Anvil instance bound to localhost), copies the
            contract&apos;s state into it, and runs a reproducing test there. Nothing is ever sent to a live contract,
            testnet or mainnet. A transaction guard sits in front of every RPC call and every Foundry invocation and
            blocks anything that would change state outside a fork this process started. The fork always runs on a
            different chain ID than the live network, so a signed payload could never be replayed.
          </p>
        </Section>

        <Section title="What a contract report checks">
          <ul>
            <li>Access control and ownership takeover</li>
            <li>Hidden or unlimited mint</li>
            <li>Blacklist / freezing and trading switches</li>
            <li>Adjustable sell taxes and sell restrictions (honeypots)</li>
            <li>Reentrancy (reproduced with a disposable attacker on the fork)</li>
            <li>Oracle manipulation (spot-price lending)</li>
            <li>Upgrade authority — who can replace the code, and with what delay</li>
            <li>Unsafe external calls and arbitrary-call helpers</li>
            <li>Uniswap v4 hook behaviour (caller checks, fee limits, swap blocking)</li>
          </ul>
          <p className="muted">
            We never say a contract is &quot;safe&quot;. A clean report says &quot;no issues found by these checks&quot;
            and lists exactly what was covered.
          </p>
        </Section>

        <Section title="Quantum readiness" id="quantum">
          <p>{QUANTUM_DISCLAIMER}</p>
          <p>
            For a wallet, we check whether its public key is already exposed on-chain. A key is revealed the first time an
            address <em>sends</em> a transaction, not when it receives funds. If the key is exposed and the wallet still
            holds a balance, it falls into the group a future quantum computer could in principle target — a long-term
            readiness consideration, not a present threat. The report gives a plain migration checklist. For a contract,
            we report reliance on ECDSA signatures, <code className="inline">ecrecover</code>, permit, and single-key
            admin control. Nothing is ever described as &quot;quantum-proof&quot;.
          </p>
        </Section>

        <Section title="Wallet privacy — owner-gated">
          <p>
            A privacy report uses only public on-chain data, but it is generated only for a wallet whose owner proves
            control by signing a free, off-chain message (no transaction, no gas). WHITEHAT never asks for a private key,
            never identifies who owns an address, and never publishes, indexes, or allows lookup of anyone else&apos;s
            privacy report. Your report is yours; you choose whether to share it.
          </p>
        </Section>

        <Section title="Responsible disclosure">
          <p>
            For an exploitable issue in a contract we don&apos;t own, the public report withholds the details. A human
            sends the project a private notice, a documented waiting period runs, and only a plain-language summary is
            published — after a fix or the deadline. Proofs are stored encrypted, readable only by the operator. We never
            publish working exploit code or unfixed details, and there is always a human approval step before anything is
            sent or published.
          </p>
        </Section>

        <Section title="Costs and limits">
          <p>
            AI review runs under a hard daily budget and per-scan token limits; when the budget is reached, scans skip AI
            review rather than overspend. API keys and any wallet key live only in <code className="inline">.env</code>,
            which is gitignored, and are never printed or logged. The software writes and tests code; it does not move
            funds, pay bounties, send disclosures, or launch the coin — those are manual operator steps.
          </p>
        </Section>

        <Section title="Chain facts (verify at runtime)">
          <p>
            Elysium is EVM-compatible, settles to HyperEVM, uses HYPE for gas, and targets ~100ms blocks. Mainnet is
            chain <strong>99901</strong> and testnet is <strong>99801</strong>. WHITEHAT still reads each network&apos;s
            chain ID live with <code className="inline">eth_chainId</code> at connect time and refuses to run if it
            doesn&apos;t match, rather than trusting a configured value.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="stack" style={{ ["--gap" as string]: "8px", scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: "1.3rem", marginTop: 16 }}>{title}</h2>
      <div className="docs-prose stack" style={{ ["--gap" as string]: "10px" }}>
        {children}
      </div>
    </section>
  );
}
