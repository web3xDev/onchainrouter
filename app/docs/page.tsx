import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/code";
import { describeInputs, TOOLS } from "@/lib/tools/registry";
import { rails } from "@/lib/x402";
import { siteUrl } from "@/lib/site";

const DESCRIPTION =
  "How to call a tool, pay for it, and list your own. HTTP and MCP reference, rails, wallet setup.";

export const metadata: Metadata = {
  title: "Docs",
  description: DESCRIPTION,
  openGraph: { title: "Docs", description: DESCRIPTION },
  twitter: { title: "Docs", description: DESCRIPTION },
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["quickstart", "Quickstart: your agent"],
  ["claude", "Quickstart: Claude Code"],
  ["http", "HTTP reference"],
  ["mcp", "MCP reference"],
  ["tools", "Tools"],
  ["sell", "Sell a tool"],
  ["rails", "Rails and prices"],
  ["wallet", "Funding a wallet"],
  ["rules", "Rules"],
] as const;

export default function DocsPage() {
  const base = siteUrl();
  const railList = rails();
  const price = railList.map((r) => r.priceLabel).join(" or ");

  return (
    <div className="page docs">
      <aside className="docs-nav">
        <span className="label">Docs</span>
        <nav>
          {SECTIONS.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="prose docs-body">
        <div className="page-head" style={{ paddingTop: 0 }}>
          <h1>Docs</h1>
          <p>
            Everything an agent, or the person setting one up, needs. Short on purpose: the
            router speaks standard MCP and standard x402, so most of this is the two
            addresses and the rules around them.
          </p>
        </div>

        <h2 id="quickstart">Quickstart: your agent</h2>
        <p>
          One package gives you a wallet on Hedera and Arc and a call that pays the 402 for
          you. Testnet keys; fund a wallet that exists only for this.
        </p>
        <Code lang="sh">{`npm install onchainrouter`}</Code>
        <Code lang="ts">
          {`import { createWallet, pay } from "onchainrouter";

const wallet = createWallet({
  hedera: { accountId: "0.0.12345", privateKey: "0x..." },   // ECDSA key
  arc: { privateKey: "0x..." },                               // or a Circle wallet
  maxPerCall: { hbar: "0.2", usdc: "0.05" },                  // defaults
});

const { status, data, receipt } = await pay(
  "${base}/api/tools/lending-rates",
  { asset: "USDC", chain: "base" },
  wallet,
);

data.assessment;        // the answer
receipt?.explorer;      // HashScan link on Hedera; Gateway transfer id on Arc`}
        </Code>
        <p>
          <code>wallet.fetch</code> is a drop-in <code>fetch</code> that pays 402s anywhere.{" "}
          <code>walletFromEnv()</code> reads the same keys from the environment. Over MCP
          instead: <code>wrapMCPClientWithPayment(mcpClient, wallet.client)</code> from{" "}
          <code>@x402/mcp</code>, connected to <code>{base}/mcp</code>.
        </p>

        <h2 id="claude">Quickstart: Claude Code</h2>
        <p>
          Claude Code cannot sign a payment, so it gets one MCP server from the npm package: a
          wallet that talks to the router and pays when a tool asks. Keys stay in your
          environment.
        </p>
        <Code lang="sh">
          {`claude mcp add onchainrouter \\
  -e HEDERA_AGENT_ACCOUNT_ID=0.0.12345 -e HEDERA_AGENT_PRIVATE_KEY=0x... \\
  -e ARC_AGENT_PRIVATE_KEY=0x... \\
  -- npx -y onchainrouter wallet`}
        </Code>
        <p>
          Then ask something the tools can answer: <em>where should I lend USDC on base?</em>{" "}
          Claude calls <code>call_paid_tool</code>; the wallet fetches the router&apos;s 402,
          signs it and sends the paid call, all in one step, and hands back the answer with a
          receipt. One tool call, a few seconds, no action from you. The wallet also exposes{" "}
          <code>sign_x402_payment</code> for other x402 services. For Arc through a Circle
          agent wallet, pass the four <code>CIRCLE_*</code> variables instead of a key.
        </p>
        <p>
          Already have an x402 wallet? Add the router directly with{" "}
          <code>claude mcp add --transport http onchainrouter {base}/mcp</code> and pay its 402s
          yourself; the package is not needed.
        </p>

        <h2 id="http">HTTP reference</h2>
        <p>Every tool is one endpoint. POST a JSON body; the response is JSON.</p>
        <Code>{`POST ${base}/api/tools/<slug>
GET  ${base}/api/tools            the catalogue, free`}</Code>
        <table className="docs-table">
          <tbody>
            <tr>
              <td>
                <code>402</code>
              </td>
              <td>
                Unpaid. <code>PAYMENT-REQUIRED</code> header carries base64 JSON with{" "}
                <code>accepts</code>: one entry per rail with <code>network</code>,{" "}
                <code>amount</code> (atomic units), <code>asset</code>, <code>payTo</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>200</code>
              </td>
              <td>
                Paid and answered. Send the signed payment in <code>PAYMENT-SIGNATURE</code>{" "}
                (or <code>X-PAYMENT</code>). <code>PAYMENT-RESPONSE</code> on the reply carries
                the settlement receipt.
              </td>
            </tr>
            <tr>
              <td>
                <code>400</code>
              </td>
              <td>Malformed input. Answered before the paywall; nothing to pay.</td>
            </tr>
            <tr>
              <td>
                <code>404</code>
              </td>
              <td>
                Unknown tool, or a tool with no answer for this input:{" "}
                <code>{`{ answer: null, reason, charged: false }`}</code>. Never settled.
              </td>
            </tr>
            <tr>
              <td>
                <code>502</code>
              </td>
              <td>The tool or a facilitator failed. Never settled.</td>
            </tr>
          </tbody>
        </table>

        <h2 id="mcp">MCP reference</h2>
        <p>
          Streamable HTTP at <code>{base}/mcp</code>, stateless. <code>tools/list</code> is
          free and returns every tool with its input schema. A paid call without a payment
          returns a result with <code>isError: true</code> whose <code>structuredContent</code>{" "}
          is the same payment-required object as the HTTP 402. Pass the signed payment back
          either in <code>_meta["x402/payment"]</code> (what <code>@x402/mcp</code> does) or as
          a <code>payment</code> argument (what a chat client does). The receipt comes back in{" "}
          <code>_meta["x402/payment-response"]</code>.
        </p>
        <p>
          <code>submit_tool</code> is also on the server, free: it probes an endpoint&apos;s 402
          and returns a listing request. See <a href="#sell">Sell a tool</a>.
        </p>

        <h2 id="tools">Tools</h2>
        <p>
          {TOOLS.length} tools, {price} per call. Names below are the MCP names; the HTTP slug
          replaces underscores with dashes. Generated from the registry, so this is what is
          served.
        </p>
        {TOOLS.map((tool) => {
          const inputs = describeInputs(tool);
          const request = (tool.example as { request?: unknown }).request ?? tool.example;
          return (
            <div key={tool.slug} className="docs-tool">
              <h3>
                <code>{tool.slug.replace(/-/g, "_")}</code>{" "}
                <Link href={`/tools/${tool.slug}`} className="link" style={{ fontSize: 13, fontWeight: 400 }}>
                  tool page
                </Link>
              </h3>
              <p>{tool.summary}</p>
              <ul>
                {inputs.map((i) => (
                  <li key={i.name}>
                    <code>{i.name}</code>
                    {i.required ? "" : " (optional)"}: {i.description.replace(/\.$/, "")}
                    {i.options ? `. One of ${i.options.join(", ")}.` : "."}
                  </li>
                ))}
              </ul>
              <Code>{JSON.stringify(request)}</Code>
            </div>
          );
        })}

        <h2 id="sell">Sell a tool</h2>
        <p>
          Wrap a function in an x402 paywall on your own server. Both rails, your address in
          the 402, settlement straight to you. Return <code>null</code> when there is no
          answer and the caller is not charged.
        </p>
        <Code lang="ts">
          {`import { paid } from "onchainrouter/server";

export const POST = paid(
  {
    price: { hbar: "0.1", usdc: "0.01" },
    payTo: { hedera: "0.0.12345", arc: "0xYourAddress" },
    description: "Liquidation risk for a lending position",
    parse: (body) => Input.parse(body),   // optional; throw to answer 400 unpaid
  },
  async (input) => {
    const result = await yourExistingLogic(input);
    if (!result) return null;
    return result;
  },
);`}
        </Code>
        <p>
          That is a Next.js route handler and a plain <code>(Request) =&gt; Response</code> for
          Hono, Bun, Workers or Express. Then list it: the{" "}
          <Link href="/submit" className="link">
            submit page
          </Link>{" "}
          reads price, rails and payout off your 402 and opens a prefilled GitHub issue.
          Agents can do the same with <code>submit_tool</code> over MCP or{" "}
          <code>POST {base}/api/submit</code>; both return the issue URL and the{" "}
          <code>external()</code> entry a pull request would add to{" "}
          <code>lib/tools/registry.ts</code>. Already on x402? Skip the wrapper; the router
          relays your endpoint as is. Endpoints quoting only some other network are refused,
          since nothing here could pay them.
        </p>

        <h2 id="rails">Rails and prices</h2>
        <table className="docs-table">
          <tbody>
            {railList.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <code>{r.network}</code> · {r.priceLabel} per call · {r.settlement}. {r.gas}.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          One 402 offers both; the client pays on whichever it holds. Testnet only for now.
          Hedera pays in native HBAR (no token association needed); Arc pays USDC from a
          Circle Gateway balance, batched, so the receipt is a transfer id rather than a
          per-payment transaction hash. Spend caps in the client default to 0.2 HBAR and 0.05
          USDC per payment.
        </p>

        <h2 id="wallet">Funding a wallet</h2>
        <p>This is the part that takes time. Do it once, in a wallet used for nothing else.</p>
        <h3>Hedera</h3>
        <ol>
          <li>
            <a href="https://portal.hedera.com" target="_blank" rel="noreferrer" className="link">
              portal.hedera.com
            </a>
            : create a testnet account, <strong>ECDSA</strong> key type. It comes with test HBAR.
          </li>
          <li>
            Set <code>HEDERA_AGENT_ACCOUNT_ID</code> and <code>HEDERA_AGENT_PRIVATE_KEY</code>.
            Gas is sponsored by the facilitator; the balance only pays the price.
          </li>
        </ol>
        <h3>Arc</h3>
        <ol>
          <li>
            An EVM key (<code>ARC_AGENT_PRIVATE_KEY</code>), or a Circle developer-controlled
            wallet on ARC-TESTNET (EOA, not SCA) via <code>CIRCLE_API_KEY</code>,{" "}
            <code>CIRCLE_ENTITY_SECRET</code>, <code>CIRCLE_WALLET_ID</code>,{" "}
            <code>CIRCLE_WALLET_ADDRESS</code>.
          </li>
          <li>
            Test USDC from{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="link">
              faucet.circle.com
            </a>{" "}
            (Arc Testnet) to that address.
          </li>
          <li>
            Deposit once into Circle Gateway (<code>0x0077777d7EBA4688BDeF3E311b846F25870A19B9</code>);
            payments draw on that balance, gasless. The repo has <code>npm run arc:deposit</code>{" "}
            for this.
          </li>
        </ol>

        <h2 id="rules">Rules</h2>
        <ul>
          <li>
            <strong>The agent pays with its own wallet.</strong> The router holds no keys and
            no funds. The playground is the one exception: a capped wallet we fund so the
            product can be tried without one.
          </li>
          <li>
            <strong>No answer, no charge.</strong> A 4xx on HTTP or <code>isError</code> on
            MCP is never settled.
          </li>
          <li>
            <strong>0% commission.</strong> The 402 names the author&apos;s address; money goes
            agent to author.
          </li>
          <li>
            <strong>Two rails.</strong> Hedera and Arc, testnet. Listings on other networks
            are refused.
          </li>
          <li>
            <strong>Coverage is measured.</strong> <code>npm run probe</code> records which
            subgraphs answer; the catalogue reads from that.
          </li>
        </ul>
        <p>
          Source and issues:{" "}
          <a href="https://github.com/web3xDev/onchainrouter" target="_blank" rel="noreferrer" className="link">
            github.com/web3xDev/onchainrouter
          </a>
          . For agents, the same in one file:{" "}
          <a href="/llms.txt" className="link">
            /llms.txt
          </a>
          .
        </p>
      </div>
    </div>
  );
}
