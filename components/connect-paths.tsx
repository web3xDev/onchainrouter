"use client";

import { useState } from "react";
import { Code } from "@/components/code";

type Path = "sdk" | "claude";

export function ConnectPaths({ base }: { base: string }) {
  const [path, setPath] = useState<Path>("sdk");

  return (
    <div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={path === "sdk"} onClick={() => setPath("sdk")}>
          Your own agent
        </button>
        <button type="button" aria-pressed={path === "claude"} onClick={() => setPath("claude")}>
          Claude Code
        </button>
      </div>

      {path === "sdk" ? (
        <>
          <p>
            One package: a wallet on Hedera and Arc, and a call that pays the 402 for you.
          </p>
          <div style={{ marginBottom: 10 }}>
            <Code lang="sh">{`npm install onchainrouter`}</Code>
          </div>
          <Code lang="ts">
            {`import { createWallet, pay } from "onchainrouter";

const wallet = createWallet({
  hedera: { accountId: "0.0.12345", privateKey: "0x..." },
  arc: { privateKey: "0x..." },
});

const { data, receipt } = await pay(
  "${base}/api/tools/lending-rates",
  { asset: "USDC", chain: "base" },
  wallet,
);`}
          </Code>
          <p className="hint" style={{ marginTop: 10 }}>
            Over MCP instead: <code>wrapMCPClientWithPayment(mcpClient, wallet.client)</code>{" "}
            and connect to <code>{base}/mcp</code>.
          </p>
        </>
      ) : (
        <>
          <p>The router, plus a wallet MCP. Ask a question; the wallet calls the tool and pays for it in one step. Keys stay in your environment.</p>
          <Code lang="sh">
            {`claude mcp add --transport http onchainrouter ${base}/mcp

claude mcp add onchain-wallet \\
  -e HEDERA_AGENT_ACCOUNT_ID=0.0.x -e HEDERA_AGENT_PRIVATE_KEY=0x... \\
  -e ARC_AGENT_PRIVATE_KEY=0x... \\
  -- npx -y onchainrouter wallet`}
          </Code>
        </>
      )}
    </div>
  );
}
