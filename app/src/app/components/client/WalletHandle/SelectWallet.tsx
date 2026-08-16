"use client";
import styles from "../../../uni.module.css";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { useEffect, useState } from "react";
import { walletV6, validateAndParseAddress, constants as SNconstants, WalletAccountV6 } from "starknet";
import { WALLET_API } from "@starknet-io/types-js";
import { myFrontendProviders } from "@/utils/constants";
import { detectPrivacyCapability } from "@/utils/strk20";
import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type {
  WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-wallet-standard/features';


// Normalize wallet identifiers so starknetkit's connector id / SWO name
// ("argentX", "Ready", "Braavos") can be matched against the wallet-standard
// wallet's display name ("Argent X", "Braavos", ...).
function normalizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function SelectWallet({ variant = "ctaBig" }: { variant?: "nav" | "ctaBig" }) {

  const setMyWallet = useStoreWallet(state => state.setMyStarknetWalletObject);

  const setMyWalletAccount = useStoreWallet(state => state.setMyWalletAccount);
  const { setCurrentFrontendProviderIndex } = useFrontendProvider(state => state);

  const isConnected = useStoreWallet(state => state.isConnected);
  const setConnected = useStoreWallet(state => state.setConnected);
  const address = useStoreWallet(state => state.address);

  const setWalletApi = useStoreWallet(state => state.setWalletApiList);
  const setPrivacyCapability = useStoreWallet(state => state.setPrivacyCapability);

  const setChain = useStoreWallet(state => state.setChain);
  const setAddressAccount = useStoreWallet(state => state.setAddressAccount);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Detected Starknet wallets, in render state so the picker updates as wallets register.
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);

  // Create the discovery store once on mount so wallets have time to register
  // before the user opens the picker. eip1193Adapters:[] keeps MetaMask out entirely
  // (no EIP-6963 MetaMask bridging / Snap probing).
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    setWallets(store.getWallets().slice());
    const unsub = store.subscribe((next) => setWallets(next.slice()));
    return () => unsub();
  }, []);

  // Show every detected wallet except MetaMask (its Snap probing spams an unlock popup)
  // and Braavos (excluded from this starter's picker).
  const pickable = wallets.filter((w) => {
    const id = normalizeId(w.name);
    return !id.includes("metamask") && !id.includes("braavos");
  });

  // Connect using the provider for the wallet's actual chain, then perform a
  // metadata-only privacy capability check. No balances are read here.
  async function handleSelectedWallet(selectedWallet: WalletWithStarknetFeatures) {
    setMyWallet(selectedWallet);
    // starknet.js 10.4.0 aliases wallet-standard 6.0.2 internally; discovery
    // 6.0.3 is runtime-compatible but has a distinct declaration identity.
    const compatibleWallet = selectedWallet as unknown as Parameters<typeof walletV6.requestAccounts>[0];
    const result = await walletV6.requestAccounts(compatibleWallet);
    if (!Array.isArray(result) || !result[0]) {
      throw new Error("This wallet did not return a Starknet account.");
    }

    const chainId = (await walletV6.requestChainId(compatibleWallet)) as string;
    const providerIndex = chainId === SNconstants.StarknetChainId.SN_MAIN
      ? 0
      : chainId === SNconstants.StarknetChainId.SN_SEPOLIA
        ? 2
        : 1;
    const myWA = await WalletAccountV6.connect(myFrontendProviders[providerIndex], compatibleWallet);
    setMyWalletAccount(myWA);
    setAddressAccount(validateAndParseAddress(result[0]));
    setChain(chainId);
    setCurrentFrontendProviderIndex(providerIndex);

    const permissions = await walletV6.getPermissions(compatibleWallet) as WALLET_API.Permission[];
    const isConnectedWallet = permissions.includes(WALLET_API.Permission.ACCOUNTS);
    setConnected(isConnectedWallet);

    const capability = await detectPrivacyCapability(selectedWallet);
    setWalletApi(capability.versions);
    setPrivacyCapability(capability.supported, capability.reason);
  }

  // Open the wallet picker so the user can choose (Ready, Xverse, ...).
  const openPicker = () => {
    setError("");
    setPickerOpen(true);
  };

  // Connect the wallet the user picked from the modal.
  //
  // We deliberately do NOT use starknetkit's connect() here: it bundles
  // get-starknet-core, whose MetaMask detection (waitForMetaMaskProvider, retries:3)
  // repeatedly dispatches EIP-6963 discovery and probes MetaMask's Starknet Snap,
  // spamming its unlock popup. eip1193Adapters:[] above keeps MetaMask out of discovery
  // entirely, and only the picked wallet ever receives a request().
  async function selectWallet(w: WalletWithStarknetFeatures) {
    setError("");
    setConnecting(true);
    try {
      await handleSelectedWallet(w);
      setPickerOpen(false);
    } catch (err: any) {
      console.log("Wallet connection failed.\n", err);
      setError(err?.message ?? "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const picker = pickerOpen ? (
    <div className={styles.modalOverlay} onClick={() => !connecting && setPickerOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Connect a wallet</span>
          <button
            className={styles.modalClose}
            onClick={() => setPickerOpen(false)}
            aria-label="Close"
            disabled={connecting}
          >
            ×
          </button>
        </div>

        {pickable.length ? (
          <div className={styles.walletList}>
            {pickable.map((w) => (
              <button
                key={w.name}
                className={styles.walletRow}
                onClick={() => selectWallet(w)}
                disabled={connecting}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.walletIcon} src={w.icon} alt="" />
                <span className={styles.walletName}>{w.name}</span>
                <span className={styles.walletGo}>{connecting ? "…" : "→"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.walletHint}>
            No Starknet wallet detected. Install{" "}
            <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a> or{" "}
            <a href="https://www.xverse.app/" target="_blank" rel="noreferrer">Xverse</a>.
          </div>
        )}

        {error ? <div className={styles.errorText}>{error}</div> : null}
      </div>
    </div>
  ) : null;

  // Nav variant: a compact Connect pill, or the connected address with disconnect.
  if (variant === "nav") {
    if (isConnected && address) {
      return (
        <button
          className={styles.addrPill}
          onClick={() => setConnected(false)}
          title="Disconnect"
        >
          <span className={styles.addrDot} />
          {shortAddr}
          <span className={styles.addrDisconnect}>Disconnect</span>
        </button>
      );
    }
    return (
      <>
        <button className={styles.connectPill} onClick={openPicker}>
          Connect
        </button>
        {picker}
      </>
    );
  }

  // Default (ctaBig): the large solid connect CTA shown in the panel until a
  // wallet is connected.
  return (
    <>
      <button className={styles.btnCta} onClick={openPicker}>
        Connect a Wallet
      </button>
      {picker}
    </>
  );
}
