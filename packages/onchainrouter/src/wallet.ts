import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { wrapMCPClientWithPayment } from "@x402/mcp";
import { z } from "zod";
import { walletFromEnv, type Wallet } from "./client.js";
import { explorerUrl } from "./rails.js";

export const DEFAULT_ROUTER_URL = "https://onchainrouter.io/mcp";

/**
 * The agent's wallet as an MCP server, for chat clients that cannot sign.
 *
 * A remote x402 service answers a tool call with "payment required" and the rails it
 * accepts. Claude Code, Cursor and the like have no wallet, so this gives them one:
 * a single tool that takes the payment request and returns a signed payment the
 * agent passes back. It knows nothing about any particular service; it signs x402.
 */

const NO_WALLET =
  "No wallet configured. Set HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY, " +
  "ARC_AGENT_PRIVATE_KEY, or the four CIRCLE_* variables.";

type PaidClient = ReturnType<typeof wrapMCPClientWithPayment>;

/**
 * A paying MCP client to the router, opened on first use and kept for the life of
 * the process. The x402 library handles the 402 inside `callTool`, so the gap
 * between signing and sending is milliseconds: a Hedera signature (valid for
 * about two minutes) cannot expire while a chat model is still thinking.
 */
function routerClient(wallet: Wallet, url: string, prefer: { network?: string }) {
  let ready: Promise<PaidClient> | null = null;
  return () =>
    (ready ??= (async () => {
      const mcp = new Client({ name: "onchainrouter-wallet", version: "0.2.0" });
      const agent = wrapMCPClientWithPayment(mcp, wallet.client, {
        // A per-call rail preference narrows the offer before the client picks;
        // an unavailable preference falls back to whatever is offered.
        onPaymentRequested: ({ paymentRequired }) => {
          const want = prefer.network;
          if (want && paymentRequired.accepts.some((a) => a.network === want)) {
            paymentRequired.accepts = paymentRequired.accepts.filter((a) => a.network === want);
          }
          return true;
        },
      });
      await agent.connect(new StreamableHTTPClientTransport(new URL(url)));
      return agent;
    })().catch((error) => {
      ready = null;
      throw error;
    }));
}

export function createWalletServer(
  wallet: Wallet | null,
  options: { routerUrl?: string } = {},
): McpServer {
  const server = new McpServer({ name: "onchainrouter-wallet", version: "0.2.0" });
  const routerUrl = options.routerUrl ?? DEFAULT_ROUTER_URL;
  const prefer: { network?: string } = {};
  const router = wallet ? routerClient(wallet, routerUrl, prefer) : null;
  const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

  // One call, paid inside. Claude asks for the tool; the wallet fetches the 402,
  // signs it, sends it back, and returns the answer with the receipt.
  server.registerTool(
    "call_paid_tool",
    {
      title: "Call a paid tool on OnchainRouter and pay for it",
      description:
        "Calls a tool on the router and pays the x402 charge from this wallet in the " +
        "same step, so no separate signing round trip is needed. Returns the tool's " +
        "answer plus a receipt (network, amount, transaction). Costs one call on the " +
        "chosen rail; a tool with no answer is not charged. Use list_router_tools to " +
        "see names and arguments.",
      inputSchema: {
        tool: z.string().describe("Tool name as listed by the router, e.g. lending_rates"),
        args: z.record(z.string(), z.unknown()).default({}).describe("The tool's arguments"),
        network: z
          .string()
          .optional()
          .describe("Prefer this rail if offered: hedera:testnet or eip155:5042002"),
      },
    },
    async ({ tool, args, network }) => {
      if (!wallet || !router) return fail(NO_WALLET);
      try {
        const agent = await router();
        prefer.network = network;
        const result = await agent.callTool(tool, args);
        const settle = result.paymentResponse;
        const receipt = settle
          ? {
              settled: Boolean(settle.success),
              network: settle.network,
              payer: settle.payer,
              transaction: settle.transaction,
              explorer: settle.transaction ? explorerUrl(settle.network, settle.transaction) : null,
            }
          : { settled: false, note: result.paymentMade ? "signed, not settled" : "nothing charged" };
        const texts = result.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof (c as { text?: unknown }).text === "string")
          .map((c) => ({ type: "text" as const, text: c.text }));
        return {
          content: [...texts, { type: "text" as const, text: `receipt: ${JSON.stringify(receipt)}` }],
          isError: Boolean(result.isError),
        };
      } catch (error) {
        return fail(`call_paid_tool failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  server.registerTool(
    "list_router_tools",
    {
      title: "List the router's tools",
      description: "Names, descriptions and input schemas of every tool on the router. Free.",
      inputSchema: {},
    },
    async () => {
      if (!wallet || !router) return fail(NO_WALLET);
      try {
        const agent = await router();
        const { tools } = await agent.listTools();
        const lines = tools
          .filter((t) => t.name !== "submit_tool")
          .map((t) => `${t.name}: ${t.description ?? ""}
  args: ${JSON.stringify(t.inputSchema?.properties ?? {})}`);
        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
      } catch (error) {
        return fail(`list_router_tools failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  server.registerTool(
    "wallet_info",
    {
      title: "What this wallet can pay with",
      description: "Which networks this wallet signs on and which accounts it pays from. Free.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text" as const, text: wallet ? wallet.describe : NO_WALLET }],
    }),
  );

  server.registerTool(
    "sign_x402_payment",
    {
      title: "Sign an x402 payment request",
      description:
        "Takes the payment-required response an x402 service returned (the JSON with an " +
        "`accepts` list) and returns a signed payment for one of the accepted rails. Pass " +
        "the result back to the service as its `payment` argument, or as the " +
        "PAYMENT-SIGNATURE header over HTTP. Signing commits funds; only call this when " +
        "the user wants the paid tool to run.",
      inputSchema: {
        paymentRequired: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .describe("The payment-required JSON as returned by the service, or that JSON as a string"),
        network: z
          .string()
          .optional()
          .describe("Prefer this network if offered, e.g. hedera:testnet or eip155:5042002"),
      },
    },
    async ({ paymentRequired, network }) => {
      const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
      if (!wallet) return fail(NO_WALLET);

      let required: PaymentRequired;
      try {
        required = (
          typeof paymentRequired === "string" ? JSON.parse(paymentRequired) : paymentRequired
        ) as PaymentRequired;
      } catch {
        return fail("paymentRequired is not valid JSON.");
      }
      if (!Array.isArray(required.accepts) || required.accepts.length === 0) {
        return fail("paymentRequired has no `accepts` list.");
      }

      // A preferred network narrows the list; an unavailable preference falls back.
      const narrowed = network
        ? { ...required, accepts: required.accepts.filter((a) => a.network === network) }
        : required;
      const candidate = narrowed.accepts.length > 0 ? narrowed : required;

      try {
        const payload = await wallet.client.createPaymentPayload(candidate);
        const chosen = payload.accepted;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  payment: encodePaymentSignatureHeader(payload),
                  network: chosen?.network,
                  amount: chosen?.amount,
                  asset: chosen?.asset,
                  payTo: chosen?.payTo,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return fail(`Could not sign: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  return server;
}

/** Starts the wallet on stdio, reading keys from the environment. */
export async function serveWallet(options: { routerUrl?: string } = {}): Promise<void> {
  const wallet = walletFromEnv({ preferNetwork: process.env.ONCHAINROUTER_PREFER_NETWORK });
  const routerUrl = options.routerUrl ?? process.env.ONCHAINROUTER_URL ?? DEFAULT_ROUTER_URL;
  console.error(
    wallet
      ? `onchainrouter wallet: ${wallet.describe}; paid calls go to ${routerUrl}`
      : `onchainrouter wallet: ${NO_WALLET}`,
  );
  await createWalletServer(wallet, { routerUrl }).connect(new StdioServerTransport());
}
