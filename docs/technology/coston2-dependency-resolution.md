# Coston2 dependency resolution (local observation)

Status: `observed`, not a PayGuard deployment or release manifest.

On 2026-08-09, the local read-only resolver queried the official Flare Contract
Registry at block `33797118` using the supported Coston2 RPC
`https://coston2-api.flare.network/ext/C/rpc`. The registry address is the
canonical Flare registry, not a PayGuard contract. The lookup returned the
following non-zero addresses and non-empty runtime bytecode:

| Registry name | Address returned | Runtime bytes at observation |
|---|---|---:|
| `FlareContractRegistry` | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` | 3197 |
| `FdcHub` | `0x48aC463d7975828989331F4De43341627b9c5f1D` | 10065 |
| `FdcVerification` | `0x906507E0B64bcD494Db73bd0459d1C667e14B933` | 170 |
| `FdcRequestFeeConfigurations` | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` | 6173 |
| `FdcInflationConfigurations` | `0x5C670a6950111D6f38B0D7cAdEB58D534fd9D209` | 7165 |
| `FlareSystemsManager` | `0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52` | 24278 |
| `Relay` | `0xa10B672D1c62e5457b17af63d4302add6A99d7dE` | 12676 |
| `FtsoV2` | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` | 170 |
| `AssetManagerFXRP` | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` | 217 |
| `MasterAccountController` | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` | 250 |

The same public observation is recorded in
[`evidence/coston2/coston2-dependency-resolution.json`](../../evidence/coston2/coston2-dependency-resolution.json).
Refresh it with the read-only pinned command (add `--write` only when a new
public observation is intended):

```sh
pnpm coston2:dependencies:observe
pnpm coston2:dependencies:record
```

The source-of-truth rule is the registry lookup, not this table. A future
release check must resolve the registry again, record the block and runtime
code hash, verify ABI/constructor or proxy wiring, and bind the result to the
PayGuard release commit. These observations do not verify PayGuard contracts,
FCC machine registration, FDC credentials, a Smart Account transaction, an
XRPL payment, or any production capability.

Official references:

- [Flare Contract Registry](https://dev.flare.network/network/guides/flare-contracts-registry)
- [FDC reference](https://dev.flare.network/fdc/reference)
- [FTSOv2 guide](https://dev.flare.network/ftso/guides/build-first-app)
- [FAssets reference](https://dev.flare.network/fassets/reference)
- [Smart Accounts reference](https://dev.flare.network/smart-accounts/reference)
