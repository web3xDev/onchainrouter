import Link from "next/link";
import { Faq } from "@/components/faq";
import { TOOLS, catalogue } from "@/lib/tools/registry";
import { LIVE_GOVERNANCE_PROTOCOLS, LIVE_LENDING_CHAINS } from "@/lib/graph/verified";
import { rails } from "@/lib/x402";
import { HeroTerminal } from "@/components/hero-terminal";
import { StepsFlow } from "@/components/steps-flow";
import { Reveal } from "@/components/reveal";
import { Brand, type BrandId } from "@/components/brand";
import { Code } from "@/components/code";
import { Author } from "@/components/author";
import { siteUrl } from "@/lib/site";

// The rails are read from the deployment's own configuration, so this renders per
// request rather than being frozen into the build. A page that says "0 rails live"
// because an env var was missing at build time is worse than a slightly slower page.
export const dynamic = "force-dynamic";

export default function Home() {
  const live = rails();
  const featured = catalogue().slice(0, 2);
  const base = siteUrl();

  // Each tool sets its own price, so the bar quotes the floor, not a promise.
  const cheapest = TOOLS.map((t) => t.price).sort(
    (a, b) => parseFloat(a.replace(/[^\d.]/g, "")) - parseFloat(b.replace(/[^\d.]/g, "")),
  )[0];

  return (
    <>
      <Reveal />
      <section className="hero">
        <div className="page hero-grid">
          <div>
            <h1>
              Onchain tools
              <br />
              for AI agents
            </h1>

            <p className="hero-sub">
              Skip the API keys and subscriptions. Call an onchain tool, pay a cent, get the
              result.
            </p>

            <div className="hero-actions">
              <Link href="/connect" className="btn btn-primary">
                Connect your agent
              </Link>
              <Link href="/playground" className="btn">
                Try the playground
              </Link>
            </div>

            <p className="hero-note">
              No account. No API key. No subscription.
              <br />
              No answer, no charge.
            </p>

            <p className="proof">
              {TOOLS.length} live tools · {LIVE_LENDING_CHAINS.length} chains ·{" "}
              {LIVE_GOVERNANCE_PROTOCOLS.length} protocols · {cheapest} per call · 0% commission
            </p>
          </div>

          <HeroTerminal />
        </div>
      </section>

      <section className="band" data-reveal>
        <div className="section page">
        <div className="two-col">
          <div>
            <span className="label">Connect</span>
            <h2 style={{ marginTop: 8 }}>One endpoint. Every tool.</h2>
            <p className="lede">
              Add the router and a wallet to Claude Code. From then on, your agent can
              discover tools, pay for them, and get results: an answer, or an action taken.
            </p>
            <Link href="/connect" className="link" style={{ fontSize: 14 }}>
              Other agents and the SDK →
            </Link>
          </div>
          <Code lang="sh">
            {`claude mcp add --transport http onchainrouter \\
  ${base}/mcp

claude mcp add onchain-wallet -e HEDERA_AGENT_ACCOUNT_ID=0.0.x \\
  -e HEDERA_AGENT_PRIVATE_KEY=0x... -e ARC_AGENT_PRIVATE_KEY=0x... \\
  -- npx -y onchainrouter wallet`}
          </Code>
        </div>
        </div>
      </section>

      <section className="section page" data-reveal>
        <div className="section-head">
          <div>
            <span className="label">Tools</span>
            <h2 style={{ marginTop: 8 }}>Verdicts, not tables</h2>
            <p>
              Every tool turns onchain state into a decision, and tells the agent when the
              data isn&apos;t trustworthy.
            </p>
          </div>
          <Link href="/tools" className="btn btn-sm btn-arrow">
            All {TOOLS.length} tools
          </Link>
        </div>

        <div className="featured">
          {featured.map((tool) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="feature">
              <div className="card-top">
                <div>
                  <h3>{tool.name}</h3>
                  <div className="card-slug"><Author name={tool.author} /></div>
                </div>
                <span className="price">{tool.price}</span>
              </div>
              <p className="feature-summary">{tool.summary}</p>
              <div className="feature-answer">{tool.example.answer}</div>
              <div className="card-foot">
                <span className="tag">{tool.category}</span>
                <span>{tool.coverage}</span>
                {tool.source === "graph" ? (
                  <span className="card-source">
                    Powered by <Brand id="graph" height={12} /> The Graph
                  </span>
                ) : (
                  tool.source && <span>{tool.source}</span>
                )}
                <span style={{ marginLeft: "auto" }}>no answer, no charge</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="band" data-reveal>
        <div className="section page">
        <div className="section-head">
          <div>
            <span className="label">How it works</span>
            <h2 style={{ marginTop: 8 }}>Three steps, no signup anywhere</h2>
          </div>
        </div>

        <StepsFlow>
        <div className="steps steps-plain">
          <div className="step">
            <div className="step-n">01</div>
            <h3>Connect once</h3>
            <p>
              Add the router as an MCP server. Your agent sees every tool in the catalogue,
              with its price, straight away.
            </p>
          </div>
          <div className="step">
            <div className="step-n">02</div>
            <h3>Call a tool</h3>
            <p>
              The first call returns 402 with the price and payment rails. Nothing is
              charged yet.
            </p>
          </div>
          <div className="step">
            <div className="step-n">03</div>
            <h3>The agent pays, for a result</h3>
            <p>
              The agent signs with its own wallet. The tool runs and returns the answer. If
              it has nothing to say, the payment is never settled.
            </p>
          </div>
        </div>
        </StepsFlow>
        </div>
      </section>

      <section className="section page" data-reveal>
        <div className="section-head">
          <div>
            <span className="label">For tool authors</span>
            <h2 style={{ marginTop: 8 }}>Get discovered. Get paid. Keep 100%.</h2>
            <p>
              Wrap your API in x402 with one call, or list an endpoint that already speaks
              it. Agents find it, call it, and pay you directly. The router takes nothing.
            </p>
          </div>
        </div>

        <div className="authors">
          <div className="authors-points">
            <div>
              <strong>Discovered.</strong> In the catalogue and over MCP, in front of every
              agent that connects.
            </div>
            <div>
              <strong>Paid directly.</strong> Every call settles from the agent&apos;s wallet to
              your address. No invoice, no payout run, no minimum.
            </div>
            <div>
              <strong>Your terms.</strong> Your price, your wallet, your server. One{" "}
              <code>paid()</code> call if you are not on x402 yet.
            </div>
          </div>
          <div className="authors-cta">
            <div className="authors-zero">
              0%<span>commission</span>
            </div>
            <Link href="/submit" className="btn btn-primary">
              List your tool
            </Link>
          </div>
        </div>
      </section>

      <section className="band" data-reveal>
        <div className="section page">
        <div className="section-head">
          <div>
            <span className="label">Payment rails</span>
            <h2 style={{ marginTop: 8 }}>One tool. Multiple payment rails.</h2>
            <p>The agent chooses how to pay. The tool doesn&apos;t care.</p>
          </div>
        </div>

        <div className="rails">
          {live.map((rail) => (
            <div key={rail.id} className="rail">
              <div className="rail-head">
                <Brand id={rail.id as BrandId} kind="logo" height={24} />
                <span className="rail-net">testnet</span>
              </div>
              <div className="rail-price">
                {rail.priceLabel} <span>/ call</span>
              </div>
              <div className="rail-facts">
                <span>{rail.assetLabel}</span>
                <span>{rail.gas}</span>
                <span>{rail.facilitator}</span>
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="section page" data-reveal>
        <div className="section-head">
          <div>
            <span className="label">FAQ</span>
            <h2 style={{ marginTop: 8 }}>Questions, answered</h2>
          </div>
        </div>
        <Faq />
      </section>

      <section className="page" style={{ paddingBottom: 72, paddingTop: 24 }} data-reveal>
        <div className="closing">
          <h2>Give your agent an onchain toolbox.</h2>
          <p>One endpoint. Pay per call. No signup.</p>
          <div className="hero-actions" style={{ justifyContent: "center", marginTop: 22 }}>
            <Link href="/connect" className="btn btn-primary">
              Connect your agent
            </Link>
            <Link href="/playground" className="btn">
              Try the playground
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
