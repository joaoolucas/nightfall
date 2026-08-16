"use client";

import { useEffect, useMemo, useState } from "react";
import { num } from "starknet";
import styles from "../../../uni.module.css";
import * as constants from "@/utils/constants";
import {
  formatTokenAmount,
  parseTokenAmount,
  PortagePrivacyService,
  privacyErrorMessage,
  type PrivacySubmission,
} from "@/utils/strk20";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { StrkCoin } from "../../TokenIcons";
import SelectWallet from "./SelectWallet";

const TOKEN = constants.addrSTRK;
type TabKey = "shield" | "send" | "unshield" | "balances";
type ActionResult = {
  status: "pending" | "ok" | "submitted" | "error";
  title: string;
  note?: string;
  transactionHash?: string;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "shield", label: "Shield" },
  { key: "send", label: "Private send" },
  { key: "unshield", label: "Unshield" },
  { key: "balances", label: "Balance" },
];

function shortHex(value: string): string {
  const hex = num.toHex(value);
  return hex.length <= 15 ? hex : `${hex.slice(0, 8)}…${hex.slice(-5)}`;
}

function resultFromSubmission(submission: PrivacySubmission): ActionResult {
  if (submission.status === "confirmed") {
    return {
      status: "ok",
      title: "Privacy transaction confirmed",
      transactionHash: submission.transactionHash,
    };
  }
  return {
    status: "submitted",
    title: "Submitted — confirmation is still pending",
    note: "The RPC confirmation window ended, but the transaction may still settle. Check Voyager instead of submitting it again.",
    transactionHash: submission.transactionHash,
  };
}

export default function WalletAccountV6Tag() {
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const wallet = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const privacySupported = useStoreWallet((state) => state.privacySupported);
  const privacyReason = useStoreWallet((state) => state.privacyCapabilityReason);
  const walletApiList = useStoreWallet((state) => state.walletApiList);

  const [tab, setTab] = useState<TabKey>("shield");
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [balanceRows, setBalanceRows] = useState<{ token: string; amount: string }[]>([]);
  const [poolFee, setPoolFee] = useState<string | null>(null);
  const [feeUnavailable, setFeeUnavailable] = useState(false);

  const provider = constants.myFrontendProviders[providerIndex];
  const service = useMemo(
    () => wallet && provider ? new PortagePrivacyService(wallet, provider) : null,
    [wallet, provider],
  );
  const networkName = constants.Strk20Networks[providerIndex];
  const isStrk20Network = networkName !== undefined;
  const canRun = Boolean(isConnected && privacySupported && isStrk20Network && service);

  useEffect(() => {
    setRecipient((current) => current || connectedAddress);
  }, [connectedAddress]);

  // Public onchain fee read: no wallet data or balance consent is requested.
  useEffect(() => {
    let active = true;
    setPoolFee(null);
    setFeeUnavailable(false);
    if (!service || providerIndex !== 0 || !privacySupported) return;
    service.readPoolFee()
      .then((fee) => active && setPoolFee(`${formatTokenAmount(fee)} STRK`))
      .catch(() => active && setFeeUnavailable(true));
    return () => { active = false; };
  }, [service, providerIndex, privacySupported]);

  const explorerUrl = (hash: string) => providerIndex === 0
    ? `https://voyager.online/tx/${hash}`
    : `https://sepolia.voyager.online/tx/${hash}`;

  async function runAction() {
    if (!service || !canRun) return;
    setBusy(true);
    setResult({ status: "pending", title: "Confirm the request in your wallet…" });
    setBalanceRows([]);
    try {
      if (tab === "balances") {
        // Deliberate user action: this is the only place shielded balances are read.
        const response = await service.readBalances([]);
        setBalanceRows(response.map((entry) => ({
          token: String(entry.token),
          amount: formatTokenAmount(BigInt(entry.balance)),
        })));
        setResult({
          status: "ok",
          title: response.length ? "Private balance shared by your wallet" : "No shielded balances found",
          note: "Balance access happened only because you requested it.",
        });
        return;
      }

      const parsedAmount = parseTokenAmount(amount);
      let submission: PrivacySubmission;
      if (tab === "shield") submission = await service.shield(TOKEN, parsedAmount);
      else if (tab === "send") submission = await service.transfer(TOKEN, parsedAmount, recipient);
      else submission = await service.unshield(TOKEN, parsedAmount, connectedAddress);
      setResult(resultFromSubmission(submission));
    } catch (error) {
      setResult({ status: "error", title: "Privacy action not completed", note: privacyErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const actionCopy: Record<TabKey, { title: string; hint: string; cta: string }> = {
    shield: {
      title: "Move public STRK into your private balance",
      hint: "Public amount · two wallet prompts: ERC-20 approval, then pool deposit",
      cta: "Shield STRK",
    },
    send: {
      title: "Send from your shielded balance",
      hint: "Sender, recipient and amount stay private inside the pool",
      cta: "Send privately",
    },
    unshield: {
      title: "Return STRK to your public wallet",
      hint: "The withdrawal recipient and amount become public",
      cta: "Unshield STRK",
    },
    balances: {
      title: "Ask your wallet for shielded balances",
      hint: "This explicit action opens the wallet's balance-consent prompt",
      cta: "Share balance",
    },
  };
  const active = actionCopy[tab];

  return (
    <section className={styles.panel} aria-labelledby="privacy-title">
      <div className={styles.privacyHead}>
        <div>
          <p className={styles.privacyKicker}>PORTAGE ECONOMY</p>
          <h2 id="privacy-title" className={styles.privacyTitle}>Private STRK, honest boundaries</h2>
        </div>
        <span className={`${styles.privacyStatus} ${privacySupported ? styles.privacyStatusOn : ""}`}>
          {privacySupported ? "Private actions ready" : "Public mode"}
        </span>
      </div>

      <div className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.key}
            className={`${styles.tab} ${tab === item.key ? styles.tabActive : ""}`}
            onClick={() => { setTab(item.key); setResult(null); setBalanceRows([]); }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.inputBlock}>
        <div className={styles.inputLabel}>{active.title}</div>
        {tab !== "balances" ? (
          <div className={styles.inputMain}>
            <input
              className={styles.amountInput}
              inputMode="decimal"
              aria-label="STRK amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.0"
              disabled={busy}
            />
            <span className={styles.tokenPill}><span className={styles.tokenDot}><StrkCoin size={22} /></span>STRK</span>
          </div>
        ) : null}
        {tab === "send" ? (
          <input
            className={styles.recipientInput}
            aria-label="Private transfer recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="Recipient 0x…"
            disabled={busy}
          />
        ) : null}
        <div className={styles.subLine}><span>{active.hint}</span></div>
      </div>

      <div className={styles.feeRow}>
        <span>Network / pool fee</span>
        <span className={styles.feeVal}>
          <span className={`${styles.netDot} ${isStrk20Network ? styles.netOkDot : styles.netBadDot}`} />
          {networkName ?? "Unsupported"} · {poolFee ?? (feeUnavailable ? "fee unavailable" : "wallet quotes fee")}
        </span>
      </div>

      {isConnected && !privacySupported ? (
        <div className={styles.warn}>{privacyReason || "This wallet lacks STRK20 support."} Wallet API: {walletApiList.join(", ") || "not advertised"}.</div>
      ) : null}
      {!isStrk20Network ? <div className={styles.warn}>Switch to Starknet Mainnet or Sepolia.</div> : null}

      {isConnected ? (
        <button className={styles.btnCta} disabled={!canRun || busy} onClick={runAction} type="button">
          {busy ? "Working…" : active.cta}
        </button>
      ) : <SelectWallet variant="ctaBig" />}

      {result ? (
        <div className={`${styles.receipt} ${result.status === "error" ? styles.receiptError : result.status === "ok" ? styles.receiptOk : styles.receiptPending}`}>
          <div className={styles.receiptHead}><span className={styles.receiptIcon}>{result.status === "ok" ? "✓" : result.status === "error" ? "!" : "…"}</span>{result.title}</div>
          {result.note ? <p className={styles.resultNote}>{result.note}</p> : null}
          {result.transactionHash ? <a className={styles.receiptLink} href={explorerUrl(result.transactionHash)} target="_blank" rel="noreferrer">{shortHex(result.transactionHash)} ↗ Voyager</a> : null}
          {balanceRows.map((row) => <div className={styles.receiptRow} key={`${row.token}-${row.amount}`}><span className={styles.receiptLabel}>{shortHex(row.token)}</span><span className={styles.receiptValue}>{row.amount}</span></div>)}
        </div>
      ) : null}

      <div className={styles.privacyBoundary}>
        <div><b>Private</b><span>Shielded balance and in-pool sender, recipient and amount.</span></div>
        <div><b>Public</b><span>Shield/unshield legs, timing, revealed creature metadata and NFT owner.</span></div>
      </div>
      <p className={styles.maturityNote}>New notes mature after about 10 blocks. Shield first, wait, then pay privately to avoid correlating the public deposit with the later action.</p>
    </section>
  );
}
