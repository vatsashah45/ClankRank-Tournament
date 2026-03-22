import { WALLET_ADDRESS_REGEX, CHAINS } from "./constants.js";
import type { Chain } from "./types.js";

export function isValidWalletAddress(address: string): boolean {
  return WALLET_ADDRESS_REGEX.test(address);
}

export function isValidChain(chain: string): chain is Chain {
  return (CHAINS as readonly string[]).includes(chain);
}

export function isValidAgentId(agentId: string): boolean {
  return typeof agentId === "string" && agentId.trim().length > 0;
}
