import { describeInputs, TOOLS } from "@/lib/tools/registry";
import { rails } from "@/lib/x402";
import { siteUrl, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * /llms.txt: the site, written for the thing that will actually use it.
 *
 * An agent that lands here should not have to scrape the pages. This is the
 * catalogue, the price, the two ways to call, and the payment rules, generated from
 * the same registry the site renders, so it cannot drift.
 */
export function GET() {
  const base = siteUrl();
  const railList = rails();
  const price = railList.map((r) => r.priceLabel).join(" or ") || "see /tools";

  const tools = TOOLS.map((tool) => {
    const inputs = describeInputs(tool)
      .map((i) => `${i.name}${i.required ? "" : "?"}${i.options ? ` (${i.options.join(" | ")})` : ""}: ${i.description}`)
      .join("; ");
    const mcpName = tool.slug.replace(/-/g, "_");
    return [
      `### ${tool.name}`,
      `- MCP tool: \`${mcpName}\``,
      `- HTTP: \`POST ${base}/api/tools/${tool.slug}\``,
      `- Price: ${price} per call`,
      `- ${tool.summary}`,
      `- Inputs: ${inputs}`,
      `- Example input: \`${JSON.stringify((tool.example as { request?: unknown }).request ?? tool.example)}\``,
      tool.endpoint ? `- Relayed to: ${tool.endpoint}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. Call an onchain tool, pay a cent, get the result. No account, no API key, no subscription. No answer, no charge.

${SITE_NAME} is a catalogue of paid onchain tools for AI agents. Listing tools is free. Each call returns HTTP 402 with a price and payment rails; the agent signs an x402 payment from its own wallet and calls again. The router holds no wallet and takes no commission: settlement goes from the agent to the tool author.

## Connect

- MCP (Streamable HTTP): \`${base}/mcp\`. \`tools/list\` is free. A paid call returns a payment-required result until the signed payment is passed as the \`payment\` argument (or in \`_meta["x402/payment"]\`).
- HTTP: \`POST ${base}/api/tools/<slug>\` with a JSON body. Unpaid: 402 with a \`PAYMENT-REQUIRED\` header. Paid: send the signed payment in \`PAYMENT-SIGNATURE\`.
- Wallet for chat clients: \`npx onchainrouter wallet\` (MCP server; \`call_paid_tool\` calls a router tool and pays in one step, \`sign_x402_payment\` signs any x402 request).
- SDK: \`npm install onchainrouter\`; \`pay(url, input, wallet)\` on the client, \`paid(config, handler)\` on the server.

## Payment rails (testnet)

${railList.map((r) => `- ${r.name} (\`${r.network}\`): ${r.priceLabel} per call, settled by ${r.facilitator}. ${r.gas}.`).join("\n")}

Both rails are offered in one 402; pay on whichever you hold.

## Rules

- No answer, no charge: a tool that cannot deliver returns 404 (HTTP) or \`isError\` (MCP) and the payment is never settled.
- Malformed input is rejected with 400 before any price is quoted.
- 0% commission: the 402 names the author's address; the router never touches the funds.

## Tools

${tools.join("\n\n")}

## List a tool

Any x402 endpoint on Hedera or Arc can be listed, by a person or an agent. Nothing is stored; a listing is a GitHub issue or pull request that a maintainer merges.

- MCP: call \`submit_tool\` on \`${base}/mcp\` (free) with endpoint, name, question, example. It probes the 402 and returns \`issueUrl\` (prefilled) and \`registryEntry\` (for a PR to \`lib/tools/registry.ts\`).
- HTTP: \`POST ${base}/api/submit\` with the same JSON fields; same response.
- Not on x402 yet: \`npm install onchainrouter\`, wrap the function with \`paid()\` from \`onchainrouter/server\`, deploy, then list it.
- Rules: the 402 must offer \`hedera:testnet\` or \`eip155:5042002\`; return 404 when there is no answer so nothing is charged; do one job and report the outcome.

## Pages

- [Docs](${base}/docs): quickstarts, HTTP and MCP reference, selling a tool, funding a wallet
- [Catalogue](${base}/tools): every tool with price and inputs
- [Connect](${base}/connect): MCP and HTTP setup for your own agent or Claude Code
- [Playground](${base}/playground): try a tool from a wallet we fund
- [Submit](${base}/submit): list your own tool; wrap an API with \`paid()\` or bring an x402 endpoint
- [Source](https://github.com/web3xDev/onchainrouter)
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
