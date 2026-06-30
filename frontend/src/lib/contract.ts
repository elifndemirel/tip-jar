import * as StellarSdk from "@stellar/stellar-sdk";
import {
  rpc,
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  stroopsToXlm,
} from "./stellar";

export type TxStatus = "idle" | "building" | "signing" | "submitting" | "success" | "error";

export interface TipEntry {
  tipper: string;
  amount: string;   // XLM
  message: string;
  timestamp: number;
}

// ── Send a tip ───────────────────────────────────────────────────────────────
export async function buildSendTipTx(
  senderAddress: string,
  amountStroops: bigint,
  message: string
): Promise<string> {
  const account = await rpc.getAccount(senderAddress);
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "send_tip",
        StellarSdk.Address.fromString(senderAddress).toScVal(),
        StellarSdk.nativeToScVal(amountStroops, { type: "i128" }),
        StellarSdk.nativeToScVal(message, { type: "string" })
      )
    )
    .setTimeout(180)
    .build();

  // Simulate — estimates resources and surfaces contract errors
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    // Error Type 3: Insufficient balance or contract-level error
    const err = sim.error ?? "";
    if (err.includes("InsufficientBalance") || err.includes("balance")) {
      throw Object.assign(new Error("Insufficient XLM balance."), {
        walletError: "INSUFFICIENT_BALANCE",
      });
    }
    throw new Error(`Simulation error: ${err}`);
  }

  return StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR();
}

export async function submitSignedTx(signedXdr: string): Promise<string> {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE
  ) as StellarSdk.Transaction;

  const res = await rpc.sendTransaction(tx);
  if (res.status === "ERROR") {
    throw new Error(`Submission error: ${JSON.stringify(res.errorResult)}`);
  }

  // Poll for confirmation
  let poll = await rpc.getTransaction(res.hash);
  let attempts = 0;
  while (poll.status === "NOT_FOUND" && attempts < 20) {
    await new Promise((r) => setTimeout(r, 1500));
    poll = await rpc.getTransaction(res.hash);
    attempts++;
  }

  if (poll.status !== "SUCCESS") {
    throw new Error(`Transaction failed: ${poll.status}`);
  }

  return res.hash;
}

// ── Read tip history ───────────────────────────────────────────────────────────
export async function fetchTips(): Promise<TipEntry[]> {
  try {
    const response = await fetch(
      `https://soroban-testnet.stellar.org`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "simulateTransaction",
          params: {
            transaction: await buildReadTx(),
          },
        }),
      }
    );
    const data = await response.json();
    if (data.error || !data.result?.results?.[0]?.xdr) return [];

    const val = StellarSdk.xdr.ScVal.fromXDR(
      data.result.results[0].xdr,
      "base64"
    );
    const native = StellarSdk.scValToNative(val);
    if (!Array.isArray(native)) return [];

    return native.map((t: any) => ({
      tipper: t.tipper?.toString() ?? "",
      amount: stroopsToXlm(Number(t.amount ?? 0)),
      message: t.message ?? "",
      timestamp: Number(t.timestamp ?? 0),
    }));
  } catch {
    return [];
  }
}

async function buildReadTx(): Promise<string> {
  // Any funded testnet account works here as the simulation source
  const account = await rpc.getAccount(
    "GAQDNTRNBRZR4ZUFTXJKBXUWZILJTVTZKFY2QD7YKJHI6SSOUX26A3VP"
  );
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_tips"))
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

// ── Leaderboard — top tippers ────────────────────────────────────────────────
export function buildLeaderboard(
  tips: TipEntry[]
): { address: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const t of tips) {
    map[t.tipper] = (map[t.tipper] ?? 0) + parseFloat(t.amount);
  }
  return Object.entries(map)
    .map(([address, total]) => ({ address, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}
