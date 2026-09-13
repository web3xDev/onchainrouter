# Plan

Working plan for OnchainRouter, written at the start of the build and updated as
decisions land. Kept in the repo so the reasoning behind the code is reviewable, not
just the code.

---

## 1. The problem

An AI agent can reason its way to "I need to know who holds this token." It cannot
act on that.

Every onchain data provider is shaped for humans: sign up, create an account, get an
API key, pick a subscription tier, put the key in a config file. An agent hits that
wall and stops, and a human has to step in for a task the agent could otherwise
finish on its own.

The paywall is the wrong shape too. A subscription assumes a persistent relationship
with a known customer. An agent wants one call, once, for a fraction of a cent, and
may never come back.

## 2. What we are building

**OnchainRouter: the onchain tool router for AI agents.**

One MCP interface. An agent connects once, discovers what onchain capabilities are
available, calls the one it needs, and pays for that single call with x402. No
signup, no API key, no subscription.

```
OnchainRouter handles:   Discovery → Routing → Payment → Execution
The agent handles:        Reasoning → Decision → Interpretation
```

That separation is the product. We are not trying to make the agent smarter. We are
removing the reason it has to stop.

## 3. Design decisions

Decisions are listed with what we gave up, because the tradeoff is the interesting
part.

### 3.1 The agent pays; the router is a catalogue, not a cashier

The agent spends its own money. You give it a wallet the way you would give a
contractor a company card, and it spends within limits you set.

That decides what this project must not do. A router that held the key and paid on the
agent's behalf would be an intermediary nobody asked for. It would put our balance in
the middle of someone else's transaction and quietly turn a payment protocol into a
billing relationship. So the MCP server carries no key and no funds pass through it.
It advertises what exists and what each capability costs, and stops.

```
Agent           holds a wallet, decides, signs, pays
  │ MCP
MCP server      catalogue: what exists, what it costs, where to pay
  │ HTTP + x402
OnchainRouter  402 → verify → settle
  │
Hedera / Arc
```

A language model cannot compute a signature itself, but that is not a limitation of
this design: it is how every agent action works. An agent cannot fetch a page either;
it calls a tool that fetches. Signing is the same: the agent calls its wallet, and the
wallet is under its control. Wallet kits exist for exactly this, and each network has
one:

| Network | Agent wallet |
|---|---|
| Hedera | Hedera Agent Kit |
| Arc | Circle Agent Stack |

**Given up:** the router cannot guarantee a call succeeds, because it does not control
whether the agent can pay. An unfunded agent gets a price and nothing else. That is the
right failure, and better than a router that fronts the money and invoices later.

**One exception, deliberately.** The Playground funds a wallet of its own, because a
visitor without one still needs to see the thing work. It is the only place a key of
ours exists.

### 3.2 Three ways to arrange payment, and the operator picks

The money is always the caller's. What varies is whose process holds the signing
material, and that is a judgment call about trust rather than a technical one, so it
is left to whoever runs the server.

| Arrangement | Key lives | Suits |
|---|---|---|
| Quote only (default) | nowhere here | an agent that already has a wallet |
| Server settles via Circle | inside Circle | one-step calls without a key on disk |
| Server settles with a raw key | in a config file | quick local work, nothing more |

The first is the default because it is the only one where a mistake in this code
cannot cost anyone money. The second is the recommended way to have the server pay:
Circle holds the key and enforces limits beside it, so the credentials here command a
wallet rather than being one. The third works and is honestly labelled as the weakest.

**Given up:** three paths is more surface than one, and the quote-only default means
the common case takes two round trips rather than one. Both are worth it: a router
that quietly required your private key would be the wrong default no matter how
convenient.

**The Playground is the one exception.** It funds a wallet of its own so a visitor
without one can still see the thing work. It is not a separate demo stack: it drives
the same MCP server and the same API a real agent would, so what it shows is what
actually happens. Anonymous spending needs limits, so it is capped and rate-limited.

### 3.3 Multiple payment networks, one interface

A paid call advertises several networks in a single 402 response. The agent pays on
whichever one it already holds funds on.

This is not a feature bolted on for breadth. It is the honest consequence of the
premise: if the point is that an agent should not have to prepare in advance, then it
should not have to hold funds on a chain we happened to pick.

Tools stay unaware of this. A tool never learns which rail paid for it.

```
PaymentRail
├── HederaRail   settles through Blocky402
└── ArcRail      settles through Circle
```

**Given up:** two settlement paths to keep working instead of one.

### 3.4 Tools return judgments, not rows

A tool that forwards a query result is not worth paying for; the agent could have run
that query itself. What is worth paying for is the interpretation.

So `lending_rates` does not return a table of markets. It returns:

```
Best supply rate: 4.86% on compound-v3, backed by $375.4M of liquidity.
iron-bank reports 75.10%, far outside what every live market on this
chain pays. Read as stale data from an abandoned protocol, not an
offer. Next best is aave-v3 at 3.62%, 1.23 points behind.
```

The second sentence is the one worth paying for. The table alone would have ranked an
abandoned protocol first, and an agent acting on it would have lost money.

**Given up:** opinionated output is harder to defend than raw data. Every tool has to
state its reasoning so the agent can weigh it, and say when confidence is low.

### 3.5 Standardized schemas over per-protocol integrations

Each protocol's own subgraph names things differently, so a query written against one
does not run against another. Building a tool that way means one integration per
protocol, forever.

Building against a standardized schema instead means the same tool logic runs across
every protocol that publishes to it. For a router that wants breadth with a small
number of tools, that is the whole game.

**Given up:** standardized schemas expose less than a bespoke one. Some tools will
eventually need protocol-specific data and will have to pay that cost then.

### 3.6 Rails before tools

The first two days build no real tools at all, only a placeholder that returns a
constant.

The reasoning: payment is the part that can fail in ways we cannot design around.
Tools are the part we control. If the payment path does not work, nothing else
matters, so it gets proven first, against a tool deliberately too boring to hide a
failure.

**Given up:** nothing demoable for two days.

### 3.7 Scope deliberately cut

Not built: provider onboarding, admin approval queues, provider dashboards, revenue
accounting, user accounts, marketplace management, analytics.

Each of those is a real part of a marketplace and none of them are part of proving
that an agent can discover, pay for, and use an onchain capability. Three tools that
genuinely work say more than a marketplace shell around ten that do not.

---

## 4. Notable findings

Things learned during the build that were not obvious from the documentation. The
running log lives in [HARNESS-NOTES.md](./HARNESS-NOTES.md).

**The reference implementation points at a different testnet facilitator than the one
we need.** Hedera's x402 proof-of-concept defaults testnet settlement to
`x402.org/facilitator` and only uses Blocky402 on mainnet. Blocky402's testnet endpoint
is documented at blocky402.com/docs/testnet. Confirmed by querying
`https://api.testnet.blocky402.com/supported`, which returns:

```json
{"x402Version":2,"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}}
```

**The standard EVM scheme cannot pay through Circle Gateway.** Arc settles through
Circle's Gateway, which expects the EIP-712 signature to name the Gateway Wallet
contract. `@x402/evm`'s `ExactEvmScheme` never reads `extra.verifyingContract` from
the facilitator: in its compiled code that field is always derived locally, as
`PERMIT2_ADDRESS`, or the token address, or its own batch-settlement contract. The
signature would therefore be valid but over the wrong domain, and Circle would reject
it. Circle publishes `GatewayEvmScheme` for exactly this, and says so in its own
source comment: the base scheme "returns requirements unchanged, dropping
`supportedKind.extra`."

Worth noting for anyone diagnosing this: it is not an Arc quirk or a testnet quirk.
Circle's facilitator advertises the same Gateway Wallet address on all twelve
networks it supports, so any chain routed through Gateway behaves this way.

**Circle's package ships stale inlined types.** `@circle-fin/x402-batching` bundles
type definitions generated against an older `@x402/core`, so its `FacilitatorClient`
is structurally incompatible with the installed one (`resource.description` optional
in one, required in the other). Only one `@x402/core` is actually installed, so this
is a declaration mismatch rather than a runtime one, and is asserted through with a
comment rather than worked around.

**The x402 client refuses unfamiliar assets by default.** Payment attempts in native
HBAR were rejected client-side before ever reaching the network: spend controls allow
only assets in the SDK's default table, which on Hedera is USDC alone. The fix is to
allowlist the asset explicitly with a per-payment cap. This is a good default, since an
agent wallet should carry an allowlist rather than a blank cheque, but the failure
surfaces as a payload-creation error rather than a policy decision, which sends you
looking in the wrong place.

**HTS token association is a hidden prerequisite.** Paying in USDC requires the
receiving account to be associated with the token first, or settlement fails with
`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. There is no equivalent concept on EVM chains, so a
developer arriving from there reads the failure as a broken integration rather than a
missing setup step. We default to native HBAR, which needs no association, so the
first payment can be proven without that detour.

---

## 5. Build log

### 7 Sept: payment rail

Project scaffolded. x402 resource server wired to the Blocky402 testnet facilitator.
A single deliberately-boring endpoint, `POST /api/tools/test`, gated behind payment.

Verified: the endpoint returns a well-formed 402 whose `accepts` array carries
`hedera:testnet`, the `exact` scheme, and a fee payer that the facilitator itself
supplied, which is what confirms the facilitator handshake actually happened rather
than being assumed.

**Closed the loop with a real payment.** An agent paid 0.1 HBAR for a tool call and
received the result:

```
status  : 200
settled : success
payer   : 0.0.10407265
network : hedera:testnet
```

On-chain, the transfer shows the agent debited, the service credited, and the
facilitator's own account paying the network fee, which is the part that confirms
the facilitator is genuinely in the path rather than assumed to be.

Three obstacles on the way, none of them where we expected: `dotenv` does not read
`.env.local`, the client's spend controls rejected HBAR as a non-default asset, and
`new x402Client(config)` silently ignores a config object because the constructor
takes a selector function. Configuration goes through `setSpendControls` instead.

**Revised the wallet model.** The plan originally described the MCP server as the
place the wallet lives, which conflated two separate things: where signing happens
(the MCP server, necessarily, since a model cannot sign) and what the wallet *is*.
The wallet belongs to the agent and should be managed by a wallet kit that enforces
policy (Hedera Agent Kit on Hedera, Circle Agent Stack on Arc), not a private key in
a config file. Section 3.1 now says that. The smoke-test client written today uses a
raw key deliberately: it exists to prove the payment path, not to be the architecture.

**Started the second rail early.** Arc wired in alongside Hedera: one resource server,
two facilitators, two schemes, and a single route that advertises both networks in one
402. The paying client registers both rails and `PAY_NETWORK` forces a choice.

Arc is advertised only when a receiving address is configured, so the Hedera rail is
never blocked by Arc setup being incomplete. Hedera re-verified end to end after the
refactor: still settling.

The detour worth recording: the standard EVM scheme looked like it should work and
does not, for a reason only visible in compiled code. That cost an hour and would
have cost a day if found later. See findings.

**Both rails settling.** Arc closed the same day. A single 402 now advertises Hedera
and Arc together, and the agent pays on whichever it is pointed at:

```
network : hedera:testnet       network : eip155:5042002
settled : success              settled : success
```

The Arc option carries `extra.verifyingContract` through to the client, which is the
whole reason `GatewayEvmScheme` exists and the visible proof it is doing its job.

Two more detours, both environment rather than logic. `BatchFacilitatorClient`
defaults to the mainnet Gateway API, so a testnet build fails with a message about
scheme support that never mentions the environment. And the deposit step is real: USDC
in the wallet is not spendable until it sits inside Gateway, so `npm run arc:deposit`
now does that in one command.

### 8 Sept: first Graph-backed tool

*pending*

**First tool live on real data.** `lending-rates` answers where to lend or borrow an
asset by asking every indexed lending protocol on a chain the same standardized
question. On Ethereum it reaches 27 deployments, 24 answer, 23 have a market.

Two things had to be verified before any of it was written, and the order mattered.

**Which data actually exists.** Holder distribution, the basis of the token-risk tool
sketched earlier, is not in these schemas at all; they model protocols, not tokens.
That tool was designed from imagination and had to go. Lending, by contrast, is
richly covered: markets, positions, rates, LTVs, utilisation.

**Which deployments actually work.** Schema coverage is not availability. Of ten DEX
deployments sampled, three returned nothing and one reported a pool holding $406
quadrillion. Lending held up far better: eight of ten answered with figures that
match reality ($24.7B and 4.5M users on Aave v3). So the first tool was built on
lending, not on the DEX data the plan originally assumed.

**And then the tool was wrong anyway.** Its first answer recommended Iron Bank at a
75% USDC supply rate, an abandoned protocol still publishing to its subgraph, whose
$21.6M of reported liquidity sailed past the depth check. Depth alone does not make a
rate real. Rates that sit far outside what every live market on the chain pays are now
treated as artefacts, and the tool explains what it discarded rather than silently
dropping it. It now answers Compound v3 at 5.14%, and says why not Iron Bank.

That failure is the argument for the whole product in one line: the raw query returns
75%, and acting on it loses money.

**Second tool, and the MCP server.** `governance-power` measures a protocol's delegate
table against its own quorum: how few delegates could carry a vote between them, how
much the top ten hold, how much of that has never voted. Governance turned out to be
the cleanest data available: it carries no prices, so none of the inflated figures
that spoil some DeFi subgraphs can occur there.

It was wrong on its first run too, in a quieter way than the last one: it pulled
twenty-five delegates, wrote a sentence about ten, and counted across all twenty-five.
"Nine of them have never voted" should have been one. Both tools have now shipped
wrong in their first version, and both times the raw data caught it. A tool that
writes a sentence needs that sentence checked against the numbers behind it.

**The MCP server is a catalogue, not a cashier.** It advertises what exists and what
each capability costs, then stops. No key is configured in it and no funds pass through
it. An agent that spends should spend its own money, and a router holding the money
would be an intermediary nobody asked for.

The loop is proven end to end: ask over MCP, receive a price, sign from the agent's own
wallet, ask again with the receipt, receive the data. The payment settles on chain and
the server never sees the key.

**Both rails verified, and they settle differently.** Hedera clears per transaction,
visible immediately on HashScan. Arc clears through Circle Gateway in batches, visible
as a Gateway balance moving from 4.98 to 4.97 USDC against a $0.01 price. Same
interface, two settlement models, and a tool never learns which one paid.

**The Arc rail now signs through a Circle agent wallet.** The key is held by Circle and
never exists on this machine; the payment layer asks for a signer, and the adapter
forwards each EIP-712 request to Circle and returns the signature. Verified by the
wallet's own Gateway balance moving from 3.00 to 2.99 USDC against a $0.01 price, with
the settlement recording that address as the payer.

Two details worth keeping. Circle takes typed data as a JSON string, so the BigInt
fields EIP-712 uses have to be written as decimal strings and the `EIP712Domain` type
has to be stated explicitly: viem infers both, a raw payload cannot. And Gateway lets
one address fund another's balance, so the local key deposits on the agent wallet's
behalf and the Circle-held wallet never needs USDC or gas of its own. It only signs.

### 8 Sept: one registry, and the site

Every tool now comes from a single declaration. The HTTP route, the MCP server and the
catalogue on the site read the same entry, so a new capability is one edit rather than
three kept in sync by hand. A catalogue that can drift from what the router serves is
not a catalogue, it is a brochure.

Two things moved in front of the paywall while doing it. An unknown tool slug used to
return 402, so an agent could pay for a tool that does not exist; a malformed argument
did too, so it could pay to be told it made a typo. Both are answered for free now, and
only a well-formed call to a real tool reaches the price.

The site is the product rather than a proof page: the landing page is the catalogue
with search and filters, each tool has a page documenting the arguments the endpoint
actually validates (read from the same zod shape, so the docs cannot drift), connect
explains the three payment arrangements, and submit opens a prefilled issue instead of
collecting addresses into a database nobody audits.

**Coverage was a claim, not a measurement.** The catalogue advertised 22 governance
protocols because 22 subgraphs are listed on the network. Seven of them serve nothing.
An agent asking about Aave would have paid, waited, and got a 502. `npm run probe` now
calls every subgraph, writes down what answered, and the catalogue reads from that.
Fifteen governance protocols, fifty of fifty-nine lending deployments. The probe runs
sequentially with a retry, because firing all twenty-two at the gateway at once gets
some throttled, and a throttled protocol looks exactly like a dead one.

### 9 Sept: Playground

Done early. The one place the router spends its own money, so the work can be tried
without a wallet of your own. Real settlement on either rail, capped per visitor and
per day, and the Arc receipt is shown as a Gateway transfer id rather than linked to an
explorer that would not resolve it.

### 10 Sept: the MCP loop, and a second kind of dead market

First end-to-end run from a Claude Code session: Claude called `lending_rates` over
MCP, the server paid on Hedera, the answer came back. Claude then added "Rari Fuse is
dead post-hack, don't touch it" from its own memory, because the tool had returned
Rari Fuse as trustworthy.

The rate check catches an abandoned protocol whose numbers drifted somewhere absurd.
It does not catch one whose numbers froze looking normal. Rari Fuse publishes 3% on
USDC beside $8M of TVL, and its last recorded activity was four years ago. The
indexer sits at the chain head, so the subgraph looks fresh; only the market's own
last daily snapshot says nobody has touched it.

Each market now carries `lastActivityDays`, and anything past 30 days is stale and
excluded. Rari Fuse, Euler (1277 days, hacked in 2023) and Morpho Aave v3 (525 days)
fall out on Ethereum. On WETH it is the staleness check, not the rate check, that
catches Iron Bank: 27% listed, no activity in 77 days. The two checks cover different
failure modes and both are needed.

The lesson is the one from 8 Sept again. A tool that needs the calling model to know
which protocols are dead is not finished.

### 10 Sept, later: one URL

The local MCP server needs a clone and a config file. That is a program to install,
and the pitch was a URL to add. `/mcp` is now the router as a remote MCP server:
stateless, one fresh server per request, tools registered from the same registry and
gated by the same resource server as the HTTP API, so the price cannot differ between
the two ways in.

Payment travels inside the tool call, in `_meta`, the way `@x402/mcp` defines it. The
caller's client gets a payment-required error carrying both rails, signs with its own
wallet, and calls again. Verified from `scripts/mcp-remote-check.ts` acting as a
stranger's agent: Hedera settled, Arc settled from the Circle wallet, and a bad
protocol name was rejected by schema validation before any payment happened.

I first wrote here that a chat client cannot sign, so Claude Code would still need
the local paying server. That was wrong, and the correction came from the question
"why do you assume Claude has no wallet? maybe someone gave it one." A chat client
does not sign; a wallet beside it does. `mcp/wallet.ts` is that wallet as an MCP
server with one tool, `sign_x402_payment`. The router's payment-required result now
carries a second text item saying, in words, sign this and call again with `payment`.
Verified with `scripts/mcp-wallet-check.ts`: a plain MCP client, no x402 library,
three calls, settled on both rails. This is the architecture that was asked for from
the start: the router holds nothing, the wallet is the agent's, and they never meet.

The local paying server, `mcp/server.ts`, is gone. It was the arrangement objected
to at the very start, a process that carried the agent's wallet and paid on its
behalf, and once the wallet became the agent's own MCP it only muddied the message.
The router now has exactly one MCP shape: remote, holding nothing.

**No answer, no charge.** The question was "what is the incentive for an agent to
use these tools", and the answer that survived was the simplest: you pay for a verdict,
not for an attempt. A raw data API charges for an empty result set. Here a tool that
cannot recommend anything throws `NoAnswer`, which travels as 404 over HTTP and as
`isError` over MCP, and neither transport settles on those. Verified on both: a
payment was signed for an asset with no market, and the receipt shows it was never
settled. It cost nothing to build because x402 already refuses to settle a failed
call; the work was making "I do not know" a deliberate outcome rather than an
accident.

**0% commission, paid straight to the author.** The supply side needed an incentive
too, and cashback for callers was the wrong shape: fractions of a cent, a ledger to
keep, and a router that suddenly sends money. What a marketplace actually needs is
tool authors, and what an author wants is to be paid without asking. Each tool now
names its payout address per rail and the 402 quotes that address, resolved from the
slug at request time on HTTP and per tool on MCP. Verified on Arc: the same endpoint
quoted two different addresses for two tools, and a payment to the second one settled
from the Circle wallet to it. The router never touches the money, which makes 0% the
natural number rather than a promotion.

### 11 Sept: the router routes

Two attempts at "how does someone else list a tool", one wrong, one right.

The wrong one: a turnstile. The author gives a plain API URL and the router puts an
x402 paywall in front of it. It worked in an hour and it was Flash402 with an MCP on
top, which is a product that already exists, is mine, and is closed source for a
reason. Reverted before it was pushed.

The right one came from the question "why would we turn people's data into tools at
all". The router lists x402 endpoints that already exist and relays them: the
endpoint's own 402 goes out to the caller, the caller's signed payment comes back and
is carried to the endpoint as its header, and the endpoint settles to its own address.
The router verifies nothing, holds nothing, and takes nothing. Verified against a real
x402 endpoint over HTTP, over MCP with the x402 client, and over MCP with the wallet
MCP doing the three steps. The submit page now reads price, rails and payout live from
the endpoint's 402 and refuses to file a listing for anything that does not answer
402.

This is what "router" should have meant from the start. The two tools that run here
are two listings that happen to be hosted by the operator.

### 11 Sept, evening: three more tools

Withdrawal risk, protocol health, governance pulse. Each answers a "should I act"
question over data already proven to serve: the lending markets, the standardized
daily financials, the proposal history.

Three data problems surfaced in the first hour, all caught by reading the sentence
the tool produced against the raw numbers:

- aave-v3 on ethereum reported "$58,061 billion in fees over 30 days". One daily
  snapshot carries a value ten million times its neighbours. Revenue is now summed
  over days within twenty times the median, scaled back to thirty, and the sentence
  says how many days were discarded.
- Moonwell on base read as "$0 free of $9M, 100% lent out" because that subgraph
  publishes TVL net of borrows. Utilisation is now borrows over deposits, which is
  what the question means.
- The deepest pool on base changed between two calls because compound-v3's indexer
  dropped one request. fanOut and the single-deployment tools now retry once. A
  verdict must not depend on which indexer was slow this second.

Governance pulse refuses to answer when a subgraph has seen no proposal for over a
year. Compound shows 591 days, Gitcoin 1,128. Dormant governance and governance
that moved to a contract the subgraph does not watch produce the same data, so the
tool says it cannot tell, and charges nothing.

### 11 Sept: agent wallets and polish

The router stopped paying for anyone. The server-pays MCP mode went, and with it any
key on the router side; the agent's wallet became an MCP server of its own
(`mcp/wallet.ts`, one tool: `sign_x402_payment`), so a chat client with no x402
library can still pay. Per-tool payout landed: every registry entry names its own
addresses, the 402 carries them, and a test tool paid to a different Arc address
settled there. External x402 endpoints can be listed and are relayed as is over HTTP
and MCP; the submit page reads their 402 before it lets you file one. Two more tools
(`protocol_health`, `governance_pulse`), lending coverage widened from six chains to
nineteen indexed and nine live, a probe that measures it, and a day of design passes on
the site.

### 12 Sept: documentation, package, deploy

The `onchainrouter` npm package: `paid()` puts an x402 paywall in front of any
function on the author's own server, `pay()` and `createWallet()` are the agent side,
and `npx onchainrouter wallet` is the chat-client wallet from the registry rather than
a checkout. That closed the gap left by refusing to proxy plain APIs: anyone with an
API can list a tool. Listing opened to agents too, through a free `submit_tool` on MCP
and `POST /api/submit`, both returning a prefilled issue and the registry line a PR
would add. A sixth tool, `liquidation_pressure`, which no longer trusts the subgraph's
`isActive` flag after finding aave-v3's WETH market marked inactive with billions
borrowed. Submit page rebuilt as four steps; FAQ, docs page, `/llms.txt`, mobile nav.
Two claims in the Hedera notes withdrawn after re-checking the sources. Deployed to
Vercel at onchainrouter.io; package published; every path re-verified against the
live site with real settlements on both rails.

### 13 Sept: video and submission

Video, 2 to 4 minutes; submission with The Graph, Hedera and Arc partner prizes.

---

## 6. How AI was used

Used throughout, as an accelerator and a research assistant. Being specific about
where, since the line matters.

**Where it helped most**

- Reading unfamiliar SDK surfaces quickly. The x402 packages are new enough that their
  behaviour was faster to establish by reading the shipped type definitions and the
  reference implementation than by searching for documentation.
- Boilerplate: project scaffolding, config, the shape of a first route handler.
- Drafting prose (this file, the README, the friction notes) from decisions already
  made.

**Where the decisions were made by hand**

- The product thesis, and the choice to be agent-first rather than building a web app
  with an agent bolted on.
- Resolving the MCP-and-402 question by moving the x402 client into the MCP server
  rather than trying to push payment semantics through a protocol that has no room for
  them.
- Correcting that resolution when it drifted. The first write-up concluded "the wallet
  lives in the MCP server," which quietly turned a signing detail into a custody model
  and would have shipped a private key in a config file as the product. The wallet
  belongs to the agent, governed by a wallet kit. The distinction was not caught by
  reviewing the generated text; it was caught by knowing what the product was supposed
  to be.
- Choosing standardized schemas over per-protocol integrations, and accepting the
  narrower data surface that comes with it.
- Ordering the build rails-first, and defining "done" for day one as a real
  transaction hash rather than a working-looking demo.
- Cutting marketplace scope.

**Where AI output was rejected**

The first pass at the facilitator configuration followed the official reference
implementation, which would have silently settled testnet payments through the wrong
facilitator. Catching that took reading the reference's `.env.example` against the
requirement rather than trusting the generated code, and then verifying the correct
endpoint against a live `/supported` response.

That pattern, generated code that is plausible, compiles, and is subtly wrong about
something only the docs or the network can tell you, is the main reason every
integration here is verified against a live response before it is called done.
