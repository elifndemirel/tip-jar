import * as StellarSdk from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

// Set this after deploying your contract
export const CONTRACT_ID = "CC6ZGQ2662LAAIILMZ255KUBKLOD6LTKRQUB3IZQ4DRXCLCVVKKAAWKN";

// Testnet Native XLM SAC address
export const NATIVE_TOKEN_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const rpc = new StellarSdk.rpc.Server(RPC_URL);
export const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

// stroops → XLM
export function stroopsToXlm(stroops: bigint | number): string {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

// XLM → stroops
export function xlmToStroops(xlm: string): bigint {
  return BigInt(Math.round(parseFloat(xlm) * 10_000_000));
}

// Shortened address display
export function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
