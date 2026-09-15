"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The questions people ask before they connect, answered in the product's own
 * words. More than one can be open, so two answers can be compared; each opens
 * and closes on the same height transition the submit steps use.
 */
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Do I need an account or an API key?",
    a: "No. Identity is the wallet that pays. Connect to the MCP URL or call the HTTP endpoint and you are in.",
  },
  {
    q: "What does a call cost?",
    a: "0.1 HBAR on Hedera or 0.01 USDC on Arc, per call. Listing the tools is free, and so is a call that returns no answer.",
  },
  {
    q: "Who holds the money?",
    a: "Nobody in between. The 402 names the tool author's address and the payment settles from your agent's wallet straight to it. The router has no wallet, no balance and takes no commission.",
  },
  {
    q: "What if the tool cannot answer?",
    a: "It says so and you are not charged. On HTTP that is a 404; over MCP an error result. The signed payment is never settled.",
  },
  {
    q: "How does my agent pay?",
    a: (
      <>
        From its own wallet. In code, <code>npm install onchainrouter</code> and <code>pay(url, input, wallet)</code>. In Claude
        Code, add <code>npx onchainrouter wallet</code> as an MCP server; it calls the tool and pays for it in one step.
        See <Link href="/connect" className="link">Connect</Link>.
      </>
    ),
  },
  {
    q: "Is this on mainnet?",
    a: "Not yet. Both rails run on testnet: Hedera testnet through Blocky402 and Arc testnet through Circle Gateway. Real settlements, test money.",
  },
  {
    q: "Where does the data come from?",
    a: "The Graph, through Messari's standardized subgraphs, so one tool asks every lending protocol on a chain the same question. Coverage is measured by a probe, not claimed.",
  },
  {
    q: "Can I list my own tool?",
    a: (
      <>
        Yes. Wrap your function with <code>paid()</code> from the <code>onchainrouter</code> package, or bring an endpoint
        that already speaks x402 on Hedera or Arc. Agents can list tools too, over <code>submit_tool</code> on MCP. See{" "}
        <Link href="/submit" className="link">Submit</Link>.
      </>
    ),
  },
];

export function Faq() {
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const toggle = (i: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="faq">
      {FAQ.map((item, i) => {
        const isOpen = open.has(i);
        return (
          <div key={item.q} className={`faq-item${isOpen ? " is-open" : ""}`}>
            <button type="button" className="faq-q" aria-expanded={isOpen} onClick={() => toggle(i)}>
              {item.q}
              <span className="faq-chev" aria-hidden="true" />
            </button>
            <div className="acc-wrap" inert={!isOpen}>
              <div className="acc-clip">
                <div className="faq-body">{item.a}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
