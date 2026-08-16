import { num, walletV6 } from "starknet";
import type { ProviderInterface, WalletAccountV6 } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";

export const STRK20_MIN_WALLET_API = "0.10.3";
export const STRK_DECIMALS = 18;
export const STRK20_POOL_MAINNET =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

export type PrivacyCapability = {
  supported: boolean;
  versions: string[];
  reason?: string;
};

export type PrivacySubmission = {
  transactionHash: string;
  status: "confirmed" | "submitted";
  receipt?: unknown;
};

function versionTuple(version: string): [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : null;
}

export function versionAtLeast(version: string, minimum = STRK20_MIN_WALLET_API): boolean {
  const current = versionTuple(version);
  const target = versionTuple(minimum);
  if (!current || !target) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== target[index]) return current[index] > target[index];
  }
  return true;
}

/** Capability detection is metadata-only and never prompts for balance access. */
export async function detectPrivacyCapability(
  wallet: WalletWithStarknetFeatures,
): Promise<PrivacyCapability> {
  // starknet.js 10.4.0 internally aliases wallet-standard 6.0.2 while discovery
  // 6.0.3 exposes the same runtime shape with newer declaration identities.
  const compatibleWallet = wallet as unknown as Parameters<typeof walletV6.supportedWalletApi>[0];
  try {
    const versions = (await walletV6.supportedWalletApi(compatibleWallet)).map(String);
    const supported = versions.some((version) => versionAtLeast(version));
    return {
      supported,
      versions,
      reason: supported
        ? undefined
        : `Wallet API ${STRK20_MIN_WALLET_API} or newer is required. Use Ready for testing.`,
    };
  } catch {
    // Older wallets may expose only supportedSpecs. It is safe metadata, but only
    // an explicit Wallet API version at/above the STRK20 release enables actions.
    try {
      const versions = (await walletV6.supportedSpecs(compatibleWallet)).map(String);
      const supported = versions.some((version) => versionAtLeast(version));
      return {
        supported,
        versions,
        reason: supported
          ? undefined
          : `This wallet does not advertise STRK20 Wallet API ${STRK20_MIN_WALLET_API}. Use Ready for testing.`,
      };
    } catch {
      return {
        supported: false,
        versions: [],
        reason: "This wallet does not advertise STRK20 support. Use Ready for testing.",
      };
    }
  }
}

export function parseTokenAmount(input: string, decimals = STRK_DECIMALS): bigint {
  const value = input.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error("Enter a positive numeric amount.");
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new Error(`This token supports at most ${decimals} decimal places.`);
  }
  const amount = BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return amount;
}

export function formatTokenAmount(amount: bigint, decimals = STRK_DECIMALS): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function normalizeAddress(address: string): string {
  try {
    return num.toHex(BigInt(address));
  } catch {
    throw new Error("Enter a valid Starknet address.");
  }
}

export function sameAddress(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

export function privacyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (/screen|sanction|compliance|blocked depositor|rejected deposit/.test(lower)) {
    return "The deposit was declined by protocol-enforced screening. No private action was completed.";
  }
  if (/reject|denied|cancel/.test(lower)) return "The wallet request was rejected.";
  if (/insufficient|balance|fee/.test(lower)) {
    return "The wallet reported insufficient funds or pool fee coverage. Review the amount and current fee.";
  }
  return raw || "The privacy action failed.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class PortagePrivacyService {
  constructor(
    private readonly wallet: WalletAccountV6,
    private readonly provider: ProviderInterface,
  ) {}

  /** Pool fee is read onchain; callers must not hardcode it. Mainnet only. */
  async readPoolFee(): Promise<bigint> {
    const response = await this.provider.callContract({
      contractAddress: STRK20_POOL_MAINNET,
      entrypoint: "get_fee_amount",
      calldata: [],
    });
    if (!response[0]) throw new Error("The pool did not return its current fee.");
    return BigInt(response[0]);
  }

  /** This read is intentionally called only after a user's explicit click. */
  readBalances(tokens: string[] = []) {
    return this.wallet.strk20Balances(tokens);
  }

  shield(token: string, amount: bigint) {
    return this.submit([{ type: "deposit", token, amount: num.toHex(amount) }]);
  }

  transfer(token: string, amount: bigint, recipient: string) {
    return this.submit([
      {
        type: "transfer",
        token,
        amount: num.toHex(amount),
        recipient: normalizeAddress(recipient),
      },
    ]);
  }

  unshield(token: string, amount: bigint, recipient: string) {
    return this.submit([
      {
        type: "withdraw",
        token,
        amount: num.toHex(amount),
        recipient: normalizeAddress(recipient),
      },
    ]);
  }

  private async submit(actions: WALLET_API.STRK20_ACTION[]): Promise<PrivacySubmission> {
    const response = await this.wallet.strk20InvokeTransaction(actions);
    const transactionHash = response.transaction_hash;
    try {
      const receipt = await withTimeout(
        this.provider.waitForTransaction(transactionHash, {
          retries: 40,
          retryInterval: 3_000,
        }),
        120_000,
      );
      if (!receipt) return { transactionHash, status: "submitted" };
      const value = receipt as { execution_status?: string; value?: { execution_status?: string } };
      if ((value.execution_status ?? value.value?.execution_status) === "REVERTED") {
        throw new Error("The submitted transaction reverted onchain.");
      }
      return { transactionHash, status: "confirmed", receipt };
    } catch (error) {
      // A known revert is final. RPC visibility/timeouts after submission are not:
      // retain the hash and let the user follow it in the explorer.
      if (/revert/i.test(error instanceof Error ? error.message : String(error))) throw error;
      return { transactionHash, status: "submitted" };
    }
  }
}
