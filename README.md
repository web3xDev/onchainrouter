# OnchainRouter

**Onchain tools for AI agents.** Call an onchain tool, pay a cent, get the result.

Live at **[onchainrouter.io](https://onchainrouter.io)** · MCP at `https://onchainrouter.io/mcp` · npm: [`onchainrouter`](https://www.npmjs.com/package/onchainrouter) · [llms.txt](https://onchainrouter.io/llms.txt)

AI agents connect once through MCP and gain access to a network of onchain
capabilities, paying per call with x402. No signup, no API keys, no subscriptions.

> **OnchainRouter handles:** Discovery → Routing → Payment → Execution
> **The agent handles:** Reasoning → Decision → User interaction

**0% commission.** Every tool names the address its revenue lands on, per rail, and
each call settles straight from the agent's wallet to it. The router is never in the
middle of the money: no invoice, no payout run, no minimum. Its own tools settle to its
own addresses; a submitted tool settles to its author.

**Any x402 endpoint on Hedera or Arc can be listed.** A tool does not have to live in
this repo. Give the router an endpoint that already answers 402 and it is relayed: the
endpoint's own 402 goes out to the caller, the caller's signed payment goes back in, and
settlement happens at the endpoint, to its address. The router verifies nothing and
holds nothing. `external()` in `lib/tools/registry.ts` is the whole listing, and the
submit page reads price, rails and payout live from the endpoint's 402 before it lets
you file one. An endpoint quoting only some other network is refused there, since
nothing on this router could pay it. Not on x402 yet? `npm install onchainrouter` and
wrap the function with `paid()`: one call, both rails, your address in the 402. Agents
can list tools too, through the free `submit_tool` on MCP or `POST /api/submit`.

**No answer, no charge.** A tool that cannot give a verdict says so, and the payment
signed for that call is never settled. You buy answers, not attempts. Both transports
enforce it: HTTP refuses to settle on any 4xx, MCP on `isError`, and a tool with
nothing to say deliberately takes that path.

Built at ETHOnline 2026 (From Scratch track).

---

## Status

Everything below is running against live data and settling real payments on testnet.

| | |
|---|---|
| ✅ | One 402 offering both Hedera and Arc; the agent pays on whichever it holds |
| ✅ | Payment settled on Hedera testnet via Blocky402, verified on HashScan |
| ✅ | Payment settled on Arc testnet via Circle Gateway, verified by balance |
| ✅ | Arc signed by a Circle agent wallet, so the key never reaches this machine |
| ✅ | `lending_rates`: best rate across every indexed lending protocol on a chain |
| ✅ | `governance_power`: how concentrated a protocol's voting power is |
| ✅ | `withdrawal_risk`: whether a deposit can actually leave a market, and how much |
| ✅ | `liquidation_pressure`: whether borrowers are being liquidated right now, and how much room the terms leave |
| ✅ | `protocol_health`: growing or draining, and whether it earns anything |
| ✅ | `governance_pulse`: whether governance is still deciding, and whether votes clear quorum |
| ✅ | Remote MCP at `/mcp`: one URL, agent pays from its own wallet over x402 |
| ✅ | `onchainrouter` on npm: `paid()` to sell, `pay()` to buy, `npx onchainrouter wallet` for chat clients |
| ✅ | Site: landing, catalogue, tool pages, connect, submit, FAQ, `/llms.txt` for agents |
| ✅ | Playground, funded by us, so it can be tried without a wallet |
| ✅ | Coverage measured rather than claimed (`npm run probe`) |
| ✅ | No answer, no charge: a call with no verdict is never settled |
| ✅ | Per-tool payout: each tool settles straight to its author, 0% commission |
| ✅ | External x402 endpoints listed and relayed, over HTTP and MCP |

---

## Architecture

![How a paid call settles](./docs/architecture.svg)

The agent calls a tool, gets a 402 naming both rails and the author's address, has its
own wallet sign, and calls again. The router verifies, runs the tool, and only then
lets the facilitator settle, straight to the author. No answer, no settlement.

A six-slide presentation is at [docs/presentation.pdf](./docs/presentation.pdf).

## How payment works

```
Agent
  │  HTTP
  ▼
POST /api/tools/lending-rates
  │
  ├─ 402 Payment Required   (accepts: hedera:testnet)
  │
  ├─ agent signs a partially-signed TransferTransaction
  │
  ├─ Blocky402 verifies, adds the fee-payer signature, submits
  │
  ▼
200 { "assessment": "Best supply rate: 4.51% on compound-v3…" }
```

The facilitator sponsors network fees, so the agent needs no HBAR for gas beyond
the payment itself. Settlement details reach the client through its
`onPaymentResponse` hook.

---

## Connect your agent

### By URL

The router is a remote MCP server. An x402-aware client connects to `/mcp`, lists the
tools for free, and pays for each call from its own wallet. The router never holds a
key; it receives a signed payment inside the tool call and settles it.

```ts
const agent = wrapMCPClientWithPayment(new Client({ name: "my-agent", version: "1.0.0" }), paymentClient);
await agent.connect(new StreamableHTTPClientTransport(new URL("https://onchainrouter.io/mcp")));
const result = await agent.callTool("lending_rates", { asset: "USDC", chain: "base" });
```

`npm run mcp:remote` is a working copy of that: it connects, gets the payment-required
error, signs on whichever rail is configured, and prints the receipt and the answer.
Malformed arguments are rejected before the payment step, so a typo costs nothing.

### From a chat client, with a wallet beside it

Claude Code does not sign anything itself, and does not need to: give it a wallet as a
second MCP server. Claude calls the wallet's `call_paid_tool`; the wallet calls the
router, gets the 402, signs it and sends the paid call in one step, then returns the
answer with a receipt. One tool call, a few seconds. (The wallet also exposes
`sign_x402_payment` for the manual three-step flow and for other x402 services.)
`.mcp.json` in this repo registers exactly that pair.

```
claude mcp add --transport http onchainrouter https://onchainrouter.io/mcp
claude mcp add onchain-wallet \
  -e HEDERA_AGENT_ACCOUNT_ID=0.0.x -e HEDERA_AGENT_PRIVATE_KEY=0x... \
  -e ARC_AGENT_PRIVATE_KEY=0x... \
  -- npx -y onchainrouter wallet
```

`npx onchainrouter wallet` is the published reference wallet (source in
`packages/onchainrouter`; `mcp/wallet.ts` is the same thing run from this checkout). One
tool, `sign_x402_payment`, backed by the keys in the environment. It knows nothing about
the router; it signs x402 requests, so any x402 service can be paid through it.
`npm run mcp:wallet:check` replays the three steps with a plain MCP client and no x402
library on the client side.

### What backs the wallet

The reference wallet reads `.env.local` and signs with whatever is there.

**Circle agent wallet.** `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_ID`
and `CIRCLE_WALLET_ADDRESS`. The private key stays inside Circle and never reaches the
machine; these credentials command it rather than being it.

**Local key.** `HEDERA_AGENT_ACCOUNT_ID` and `HEDERA_AGENT_PRIVATE_KEY` for Hedera,
`ARC_AGENT_PRIVATE_KEY` for Arc. Simplest, and the key sits on the machine, which is
the trade you are making.

**Something else.** The router speaks standard x402. Any wallet MCP or x402 client that
signs payment requests works in place of the reference one.

> Whichever you choose, fund a wallet that exists only for this. Never point it at a
> key you would mind losing. Per-payment caps are set in
> [`lib/payment/agent-wallet.ts`](./lib/payment/agent-wallet.ts) and default to 0.2 HBAR
> and $0.05.

On start the wallet says what it can sign with:

```
onchain-wallet: Arc via Circle agent wallet 0x266b…, Hedera via local key 0.0.10407265
onchain-wallet: no wallet configured
```

---

### Where the wallet lives

The agent has its own wallet, the way a contractor has a company card: it spends on
its own, within limits someone set.

Nothing on the router side holds that key. No wallet, no balance, no funds passing
through. A router that paid on your agent's behalf would put its balance in the middle
of your transaction and turn a payment protocol into a billing relationship.

```
Agent            decides, calls, carries the signed payment back
  │  MCP                       │  MCP
OnchainRouter   /mcp          Wallet MCP   signs x402 requests
  payment required             (the agent's own; never meets the router)
  verify → run → settle
  │
Hedera / Arc
```

A model cannot compute a signature itself, but that is how every agent action works.
It cannot fetch a page either, it calls a tool that fetches. Signing is the same. The
reference wallet signs Arc through a Circle agent wallet (the key stays with Circle)
and Hedera with a local ECDSA key; any other x402 signer can stand in for it.

> The Playground is the one exception: it funds a wallet of its own so the work can be
> tried without one of yours.
>
> `scripts/pay.ts` signs with a raw key on purpose. It is a smoke test for the payment
> rail, not the architecture.

---

## Setup

### 1. Wallets

Create **two ECDSA accounts** at [portal.hedera.com](https://portal.hedera.com) and
fund both with testnet HBAR.

- **agent** pays for tool calls
- **service** receives payments

### 2. Configure

```bash
cp .env.example .env.local
```

Fill in the two account ids and the agent's private key.

Defaults pay in **native HBAR**, which needs no HTS token association. Switch to
USDC (`X402_ASSET=usdc`) only after associating the service wallet with token
`0.0.429274`, otherwise settlement fails with `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`.

Arc is optional and switches on once `ARC_SERVICE_ADDRESS` is set. For the paying
side, either put a funded key in `ARC_AGENT_PRIVATE_KEY`, or run `npm run circle:setup`
with a `CIRCLE_API_KEY` to create a Circle agent wallet and have it written into
`.env.local`. Fund that address from [faucet.circle.com](https://faucet.circle.com),
then `npm run arc:deposit` once: Gateway spends from a deposited balance, not from the
wallet itself.

### 3. Run

```bash
npm install
npm run dev        # terminal 1, the router
npm run pay        # terminal 2, the paying agent
```

A successful run prints the settlement and a HashScan link.

---

## Facilitator

```
https://api.testnet.blocky402.com
```

Settlement runs through Blocky402, which sponsors the network fee so a paying agent
needs no gas of its own. Confirmed against `/supported`, which advertises
`{"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}}`.

The endpoint is worth stating explicitly: Hedera's reference implementation defaults
**testnet** to `x402.org/facilitator` and reaches for Blocky402 only on mainnet, so
copying it verbatim settles somewhere other than where you meant to. The testnet URL
itself is documented at blocky402.com/docs/testnet. See [HARNESS-NOTES.md](./HARNESS-NOTES.md).

---

## Layout

```
app/
  page.tsx                  landing page
  tools/page.tsx            the catalogue
  tools/[slug]/page.tsx     one page per tool, generated from the registry
  connect/, submit/         connect an agent, list an endpoint
  playground/               run a tool against a wallet we fund
  api/tools/route.ts        the catalogue, free to read
  api/tools/[slug]/route.ts every paid tool, one handler
  api/probe/route.ts        reads an endpoint's 402 before it can be listed
  api/playground/route.ts   the only place the router spends its own money
lib/
  tools/registry.ts         every tool declared once; external() lists an x402 endpoint
  relay.ts                  carries a 402 out and a signed payment in, touches nothing
  graph/verified.ts         what `npm run probe` measured as live
  x402.ts                   facilitator, resource server, pricing
  payment/agent-wallet.ts   builds a paying fetch from whatever is configured
mcp/wallet.ts               reference wallet as an MCP server: sign_x402_payment
lib/mcp/remote.ts           remote MCP server, served at /mcp, caller pays over x402
app/mcp/route.ts            the /mcp endpoint
scripts/
  pay.ts                    paying-agent test client, HTTP
  mcp-remote-check.ts       paying-agent test client, remote MCP with x402 library
  mcp-wallet-check.ts       chat-client test: plain MCP, pays via the wallet server
  probe-coverage.ts         measures which subgraphs still answer
HARNESS-NOTES.md            Hedera DX notes
```

---

## Sponsors

| Layer | Sponsor |
|---|---|
| Data | The Graph. Subgraphs on standardized (Messari) schemas |
| Payment | Hedera. x402 via Blocky402 |
| Payment | Arc. x402 via Circle, Circle Agent Stack wallet |

---

## License

[AGPL-3.0-or-later](./LICENSE)
