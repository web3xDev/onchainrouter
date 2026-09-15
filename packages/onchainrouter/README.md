# onchainrouter

Sell an API to AI agents over x402, or pay for one. Hedera and Arc, testnet.

Three things in one package:

| | |
|---|---|
| `onchainrouter/server` | `paid()`: put an x402 paywall in front of a function |
| `onchainrouter` | `createWallet()`, `pay()`: an agent wallet that pays 402s |
| `npx onchainrouter wallet` | the same wallet as an MCP server, for Claude Code and other chat clients |

Nothing here holds funds. A payment goes from the caller's wallet to the address in the 402, settled by a public facilitator (Blocky402 on Hedera, Circle Gateway on Arc). No API key, no account.

```
npm install onchainrouter
```

## Sell: `paid()`

```ts
import { paid } from "onchainrouter/server";

export const POST = paid(
  {
    price: { hbar: "0.1", usdc: "0.01" },
    payTo: { hedera: "0.0.12345", arc: "0xYourArcAddress" },
    description: "Liquidation risk for a lending position",
  },
  async (input) => {
    const result = await yourExistingLogic(input);
    if (!result) return null;   // no answer: caller gets a 404, is not charged
    return result;
  },
);
```

That is a complete Next.js route handler. It is also a plain `(Request) => Promise<Response>`, so it works in Hono, Bun, Deno, Cloudflare Workers, or behind two lines of Express.

What the caller sees:

- unpaid call: `402` with the price, the rails you set, and your address;
- paid call: your handler runs; the payment settles only on a `2xx`;
- handler returns `null`: `404 { answer: null, charged: false }`, not settled;
- handler throws: `502`, not settled.

Offer one rail or both. A rail needs both a price and a `payTo`; leave either out and it is not advertised. Prices are in HBAR and USDC, not atomic units.

Validate before the paywall so a bad request never gets quoted:

```ts
import { z } from "zod";

const Input = z.object({ position: z.string() });

paid({ ..., parse: (body) => Input.parse(body) }, async (input) => { ... });
```

Then list it on [onchainrouter.io/submit](https://onchainrouter.io/submit). The form reads price, rails and address off your 402.

## Pay: `createWallet()` and `pay()`

```ts
import { createWallet, pay } from "onchainrouter";

const wallet = createWallet({
  hedera: { accountId: "0.0.12345", privateKey: "0x..." },   // ECDSA key
  arc: { privateKey: "0x..." },                               // or a Circle wallet, below
  maxPerCall: { hbar: "0.2", usdc: "0.05" },                  // defaults
});

const { status, data, receipt } = await pay(
  "https://onchainrouter.io/api/tools/lending-rates",
  { asset: "USDC", chain: "base" },
  wallet,
);

receipt?.explorer;   // https://hashscan.io/testnet/transaction/...
```

`wallet.fetch` is a drop-in `fetch` that pays 402s, for anything `pay()` does not cover. `walletFromEnv()` builds the same wallet from `HEDERA_AGENT_ACCOUNT_ID`, `HEDERA_AGENT_PRIVATE_KEY`, `ARC_AGENT_PRIVATE_KEY` or the `CIRCLE_*` variables.

Arc through a Circle developer-controlled wallet, so the key never sits on your machine:

```ts
arc: { circle: { apiKey, entitySecret, walletId, address } }
```

Spend caps are per payment. A service asking for more than the cap is refused before anything is signed.

## Chat clients: `npx onchainrouter wallet`

Claude Code cannot sign a payment. Give it this wallet as its one MCP server; it talks to the router itself:

```
claude mcp add onchainrouter \
  -e HEDERA_AGENT_ACCOUNT_ID=0.0.12345 -e HEDERA_AGENT_PRIVATE_KEY=0x... \
  -e ARC_AGENT_PRIVATE_KEY=0x... \
  -- npx -y onchainrouter wallet
```

The wallet exposes four tools:

- `call_paid_tool(tool, args, network?)`: calls a tool on the router and pays for it in the same step. One tool call from the chat model; the 402, the signature and the paid retry happen inside the wallet, milliseconds apart. Returns the answer plus a receipt (network, payer, transaction, explorer link). This is the one to use.
- `list_router_tools()`: names and arguments of every router tool, free.
- `sign_x402_payment(paymentRequired, network?)`: signs any x402 payment request and returns the payload, for services other than the router or for the manual three-step flow.
- `wallet_info()`: which rails this wallet can sign on.

The router defaults to `https://onchainrouter.io/mcp`; override with `--router <url>` or `ONCHAINROUTER_URL`. `ONCHAINROUTER_PREFER_NETWORK=hedera:testnet` (or `eip155:5042002`) picks a rail when both are offered.

Why one step matters: a Hedera x402 signature is only valid for about two minutes. A chat model that signs, then thinks, then calls again can miss that window. `call_paid_tool` never does.

Fund a wallet that exists only for this. Never point it at a key you would mind losing.

## Networks

Testnet only in this release: `hedera:testnet` (native HBAR, gas sponsored by Blocky402) and `eip155:5042002` (Arc, USDC through Circle Gateway; deposit once with Gateway, then payments are gasless).

## License

AGPL-3.0-or-later. Source: [github.com/web3xDev/onchainrouter](https://github.com/web3xDev/onchainrouter).
