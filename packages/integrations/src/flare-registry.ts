import { getAddress, isAddress, zeroAddress, type Hex } from "viem";

export const COSTON2_CHAIN_ID = 114n;
export const FLARE_CONTRACT_REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Hex;

export const FLARE_CONTRACT_REGISTRY_ABI = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "name", type: "string" }],
  outputs: [{ name: "contractAddress", type: "address" }],
}] as const;

export const DEFAULT_COSTON2_DEPENDENCIES = [
  "FdcHub",
  "FdcVerification",
  "FdcRequestFeeConfigurations",
  "FdcInflationConfigurations",
  "FlareSystemsManager",
  "Relay",
  "FtsoV2",
  "AssetManagerFXRP",
  "MasterAccountController",
] as const;

export type FlareDependencyName = typeof DEFAULT_COSTON2_DEPENDENCIES[number];

export interface FlareRegistryReader {
  readContract(args: {
    address: Hex;
    abi: typeof FLARE_CONTRACT_REGISTRY_ABI;
    functionName: "getContractAddressByName";
    args: readonly [string];
  }): Promise<unknown>;
}

export interface Coston2DependencyResolution {
  chainId: typeof COSTON2_CHAIN_ID;
  registry: Hex;
  addresses: Readonly<Partial<Record<FlareDependencyName, Hex>>>;
}

export type FlareRegistryFailure = "RPC_UNAVAILABLE" | "REGISTRY_INVALID" | "DEPENDENCY_INVALID";

export class FlareRegistryError extends Error {
  constructor(readonly reason: FlareRegistryFailure, message: string, readonly dependency?: string) {
    super(message);
    this.name = "FlareRegistryError";
  }
}

export async function resolveCoston2Dependencies(
  reader: FlareRegistryReader,
  dependencies: readonly FlareDependencyName[] = DEFAULT_COSTON2_DEPENDENCIES,
): Promise<Coston2DependencyResolution> {
  validateDependencyList(dependencies);
  const addresses = {} as Record<FlareDependencyName, Hex>;
  for (const dependency of dependencies) {
    let value: unknown;
    try {
      value = await reader.readContract({
        address: FLARE_CONTRACT_REGISTRY_ADDRESS,
        abi: FLARE_CONTRACT_REGISTRY_ABI,
        functionName: "getContractAddressByName",
        args: [dependency],
      });
    } catch {
      throw new FlareRegistryError("RPC_UNAVAILABLE", `Coston2 registry read failed for ${dependency}`, dependency);
    }
    addresses[dependency] = normalizeRegistryAddress(value, dependency);
  }
  return { chainId: COSTON2_CHAIN_ID, registry: FLARE_CONTRACT_REGISTRY_ADDRESS, addresses };
}

function validateDependencyList(dependencies: readonly FlareDependencyName[]): void {
  if (dependencies.length === 0 || dependencies.length > DEFAULT_COSTON2_DEPENDENCIES.length) {
    throw new FlareRegistryError("REGISTRY_INVALID", "at least one supported Coston2 dependency is required");
  }
  const supported = new Set<string>(DEFAULT_COSTON2_DEPENDENCIES);
  const seen = new Set<string>();
  for (const dependency of dependencies) {
    if (!supported.has(dependency) || seen.has(dependency)) {
      throw new FlareRegistryError("REGISTRY_INVALID", `unsupported or duplicate Coston2 dependency: ${String(dependency)}`);
    }
    seen.add(dependency);
  }
}

function normalizeRegistryAddress(value: unknown, dependency: FlareDependencyName): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new FlareRegistryError("DEPENDENCY_INVALID", `registry returned an invalid address for ${dependency}`, dependency);
  }
  return getAddress(value) as Hex;
}
