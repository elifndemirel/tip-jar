"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet, WalletError } from "@/hooks/useWallet";
import {
  buildSendTipTx,
  submitSignedTx,
  fetchTips,
  buildLeaderboard,
  TipEntry,
  TxStatus,
} from "@/lib/contract";
import { xlmToStroops, shortAddress } from "@/lib/stellar";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";
const POLL_INTERVAL = 8000;

// ── Error messages ───────────────────────────────────────────────────────────
const ERROR_MESSAGES: Record<WalletError, { title: string; hint: string }> = {
  WALLET_NOT_FOUND: {
    title: "Wallet not found",
    hint: "Install the Freighter or LOBSTR extension, then try again.",
  },
  USER_REJECTED: {
    title: "Transaction rejected",
    hint: "You closed the wallet window without approving the transaction.",
  },
  INSUFFICIENT_BALANCE: {
    title: "Insufficient balance",
    hint: "You can get testnet XLM from friendbot.stellar.org.",
  },
  UNKNOWN: {
    title: "Unexpected error",
    hint: "Check your network connection and try again.",
  },
};

export default function Home() {
  const wallet = useWallet();

  // Form state
  const [amount, setAmount] = useState("1");
  const [message, setMessage] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Feed state
  const [tips, setTips] = useState<TipEntry[]>([]);
  const [loadingTips, setLoadingTips] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load + polling
  const loadTips = useCallback(async () => {
    const data = await fetchTips();
    setTips(data.reverse()); // Newest first
    setLoadingTips(false);
  }, []);

  useEffect(() => {
    loadTips();
    pollRef.current = setInterval(loadTips, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadTips]);

  const leaderboard = buildLeaderboard(tips);
  const totalXlm = tips.reduce((s, t) => s + parseFloat(t.amount), 0).toFixed(2);

  // ── Send tip ──────────────────────────────────────────────────────────────
  async function handleSendTip() {
    if (!wallet.address) return;
    setTxStatus("building");
    setTxHash(null);
    setTxError(null);

    try {
      const stroops = xlmToStroops(amount);
      const xdr = await buildSendTipTx(wallet.address, stroops, message);

      setTxStatus("signing");
      const signedXdr = await wallet.signTransaction(xdr);

      setTxStatus("submitting");
      const hash = await submitSignedTx(signedXdr);

      setTxHash(hash);
      setTxStatus("success");
      setMessage("");
      loadTips();
    } catch (err: any) {
      setTxStatus("error");
      setTxError(err?.message ?? "Unknown error");

      // Wallet hook error types
      const we: WalletError = err?.walletError ?? "UNKNOWN";
      if (we !== "UNKNOWN") {
        setTxError(ERROR_MESSAGES[we].title + ": " + ERROR_MESSAGES[we].hint);
      }
    }
  }

  const statusLabel: Record<TxStatus, string> = {
    idle: "Send",
    building: "Building…",
    signing: "Approve in your wallet…",
    submitting: "Submitting to network…",
    success: "Sent ✓",
    error: "Try again",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b0f19", color: "#e8e6f0", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: "1px solid #1e2336", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>💸</span>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px" }}>tip jar</span>
          <span style={{ fontSize: 11, background: "#1e2b4a", color: "#7b9ef0", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>TESTNET</span>
        </div>

        {wallet.address ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#7d8ba8" }}>{shortAddress(wallet.address)}</span>
            <button onClick={wallet.disconnect} style={btnStyle("#1e2336", "#e8e6f0")}>Disconnect</button>
          </div>
        ) : (
          <button onClick={wallet.connect} disabled={wallet.connecting} style={btnStyle("#3d6ef5", "#fff")}>
            {wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </header>

      {/* ── Wallet Error Banner ── */}
      {wallet.error && (
        <div style={{ background: "#2a1a1a", borderLeft: "3px solid #e05252", margin: "16px 24px", padding: "12px 16px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#e05252", fontSize: 14 }}>{ERROR_MESSAGES[wallet.error].title}</div>
            <div style={{ color: "#9a7d7d", fontSize: 13, marginTop: 2 }}>{ERROR_MESSAGES[wallet.error].hint}</div>
          </div>
          <button onClick={wallet.clearError} style={{ background: "none", border: "none", color: "#7d5a5a", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── Left column: Send + Stats ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Stats card */}
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 16 }}>
              <StatBox label="Total XLM" value={`${totalXlm} XLM`} />
              <StatBox label="Tip count" value={String(tips.length)} />
            </div>
          </div>

          {/* Send form */}
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: "#c8c4e0" }}>Send a Tip</h2>

            {!wallet.address && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#4a5270" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                <div style={{ fontSize: 14 }}>Connect a wallet to send a tip</div>
              </div>
            )}

            {wallet.address && (
              <>
                <label style={labelStyle}>Amount (XLM)</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {["0.5", "1", "5", "10"].map((v) => (
                    <button key={v} onClick={() => setAmount(v)}
                      style={{ flex: 1, padding: "8px 0", background: amount === v ? "#3d6ef5" : "#1a1f30", border: "1px solid " + (amount === v ? "#3d6ef5" : "#2a3050"), borderRadius: 8, color: amount === v ? "#fff" : "#7d8ba8", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all .15s" }}>
                      {v}
                    </button>
                  ))}
                </div>
                <input
                  type="number" min="0.1" step="0.1" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={inputStyle}
                  placeholder="or enter a custom amount"
                />

                <label style={{ ...labelStyle, marginTop: 14 }}>Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={256}
                  rows={3}
                  placeholder="Great work! 🙌"
                  style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
                />
                <div style={{ fontSize: 11, color: "#3a4060", textAlign: "right", marginTop: 4 }}>{message.length}/256</div>

                <button
                  onClick={handleSendTip}
                  disabled={txStatus === "building" || txStatus === "signing" || txStatus === "submitting"}
                  style={{ ...btnStyle("#3d6ef5", "#fff"), width: "100%", marginTop: 16, padding: "13px 0", fontSize: 15, fontWeight: 700, opacity: (txStatus === "building" || txStatus === "signing" || txStatus === "submitting") ? 0.7 : 1 }}>
                  {statusLabel[txStatus]}
                </button>

                {/* TX status indicator */}
                {txStatus !== "idle" && (
                  <TxStatusBar status={txStatus} hash={txHash} error={txError} />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right column: Feed + Leaderboard ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: "#c8c4e0" }}>🏆 Top Tippers</h2>
              {leaderboard.map((entry, i) => (
                <div key={entry.address} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < leaderboard.length - 1 ? "1px solid #1a1f30" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: i === 0 ? "#f5c842" : "#3a4270", fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                    <a href={`https://stellar.expert/explorer/testnet/account/${entry.address}`} target="_blank" rel="noopener" style={{ color: "#7b9ef0", fontSize: 13, textDecoration: "none", fontFamily: "monospace" }}>
                      {shortAddress(entry.address)}
                    </a>
                  </div>
                  <span style={{ fontWeight: 700, color: "#e8e6f0", fontSize: 13 }}>{entry.total.toFixed(2)} XLM</span>
                </div>
              ))}
            </div>
          )}

          {/* Live feed */}
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#c8c4e0" }}>Live Feed</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2da44e" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2da44e", display: "inline-block" }}></span>
                Live
              </div>
            </div>

            {loadingTips && (
              <div style={{ color: "#3a4060", fontSize: 14, textAlign: "center", padding: "24px 0" }}>Loading…</div>
            )}

            {!loadingTips && tips.length === 0 && (
              <div style={{ color: "#3a4060", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🫙</div>
                <div>No tips yet. Be the first!</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
              {tips.map((tip, i) => (
                <TipCard key={i} tip={tip} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#111624", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#3a5080", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#e8e6f0" }}>{value}</div>
    </div>
  );
}

function TipCard({ tip }: { tip: TipEntry }) {
  const date = new Date(tip.timestamp * 1000);
  const timeStr = isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ background: "#111624", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #2a3a6a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tip.message ? 6 : 0 }}>
        <a href={`https://stellar.expert/explorer/testnet/account/${tip.tipper}`} target="_blank" rel="noopener"
          style={{ color: "#7b9ef0", fontSize: 12, fontFamily: "monospace", textDecoration: "none" }}>
          {shortAddress(tip.tipper)}
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, color: "#f0e87d", fontSize: 13 }}>{tip.amount} XLM</span>
          {timeStr && <span style={{ fontSize: 11, color: "#2a3a5a" }}>{timeStr}</span>}
        </div>
      </div>
      {tip.message && (
        <div style={{ fontSize: 13, color: "#8b8fb0", lineHeight: 1.4 }}>{tip.message}</div>
      )}
    </div>
  );
}

function TxStatusBar({ status, hash, error }: { status: TxStatus; hash: string | null; error: string | null }) {
  const colors: Record<TxStatus, string> = {
    idle: "transparent",
    building: "#1a2340",
    signing: "#1a2340",
    submitting: "#1a2a1a",
    success: "#0d2414",
    error: "#2a0d0d",
  };
  const icons: Record<TxStatus, string> = {
    idle: "", building: "⏳", signing: "✍️", submitting: "📡", success: "✅", error: "❌",
  };

  return (
    <div style={{ marginTop: 14, background: colors[status], borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <div style={{ color: status === "error" ? "#e05252" : status === "success" ? "#4ade80" : "#7b9ef0" }}>
        {icons[status]} {status === "error" ? error : status === "success" ? "Transaction completed successfully!" :
          status === "building" ? "Building transaction…" :
          status === "signing" ? "Waiting for wallet approval…" :
          "Submitting to the Stellar network…"}
      </div>
      {hash && (
        <a href={`${EXPLORER}${hash}`} target="_blank" rel="noopener"
          style={{ color: "#3d6ef5", fontSize: 11, fontFamily: "monospace", textDecoration: "none", display: "block", marginTop: 6, wordBreak: "break-all" }}>
          {hash} ↗
        </a>
      )}
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "#141826",
  border: "1px solid #1e2336",
  borderRadius: 14,
  padding: "22px 20px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#3a5080",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d1020",
  border: "1px solid #1e2336",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#e8e6f0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity .15s",
  };
}
