"use client";
import { useState, useCallback } from "react";
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";

// Singleton kit instance
let kit: StellarWalletsKit | null = null;
function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

export type WalletError =
  | "WALLET_NOT_FOUND"
  | "USER_REJECTED"
  | "INSUFFICIENT_BALANCE"
  | "UNKNOWN";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: WalletError | null;
  errorMessage: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    connecting: false,
    error: null,
    errorMessage: null,
  });

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null, errorMessage: null }));
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null, errorMessage: null }));
    try {
      const k = getKit();
      await k.openModal({
        onWalletSelected: async (option) => {
          try {
            k.setWallet(option.id);
            const { address } = await k.getAddress();
            setState({ address, connecting: false, error: null, errorMessage: null });
          } catch (err: any) {
            // Error Type 1: Wallet not found / not installed
            setState({
              address: null,
              connecting: false,
              error: "WALLET_NOT_FOUND",
              errorMessage: "Wallet not found. Please install Freighter or LOBSTR.",
            });
          }
        },
      });
    } catch (err: any) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: "WALLET_NOT_FOUND",
        errorMessage: "Could not initiate wallet connection.",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, connecting: false, error: null, errorMessage: null });
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      try {
        const k = getKit();
        const { signedTxXdr } = await k.signTransaction(xdr);
        return signedTxXdr;
      } catch (err: any) {
        const msg: string = err?.message || "";
        // Error Type 2: User rejected the transaction
        if (
          msg.toLowerCase().includes("reject") ||
          msg.toLowerCase().includes("cancel") ||
          msg.toLowerCase().includes("declined")
        ) {
          throw Object.assign(new Error("Transaction was rejected."), {
            walletError: "USER_REJECTED" as WalletError,
          });
        }
        throw Object.assign(new Error("Signing failed."), {
          walletError: "UNKNOWN" as WalletError,
        });
      }
    },
    []
  );

  return { ...state, connect, disconnect, signTransaction, clearError };
}
