# Detection benchmark

Generated 2026-11-09T11:18:30.191Z by `npm run benchmark`. Measured against WHITEHAT's own contracts on a private local chain. **These are measured results, not claims.**

Evidence key: **C** = Confirmed on fork · L = Likely (static) · R = Review (AI) · · = not detected.

## Headline

- Expected vulnerability classes across the suite: **12**
- Detected (any level, either mode): **12/12**
- Of those, reproduced **Confirmed on fork**: **10**
- Missed: **0** 
- False positives on clean contracts (confirmed or high/critical): **0** (none)

## Per-contract (source mode / bytecode-only mode)

| Contract | Expected | reentrancy | mint | blacklist | sell | fees | access | upgrade | oracle-manip | v4-hook | signatures | ext-call | Grade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ReentrantVault | reentrancy | **C**◎ | · | · | · | · | · | · | · | · | · | · | F/F |
| ✓ SafeVault | clean | · | · | · | · | · | · | · | · | · | · | · | A/A |
| RugToken | hidden-mint, blacklist, sell-restriction, fees | · | **C**◎ | **C**◎ | **C**◎ | **C**◎ | · | · | · | · | · | · | F/F |
| MintBackdoorToken | hidden-mint | · | **C**◎ | · | · | · | · | · | · | · | · | · | C/C |
| OpenInitProxy | access-control, upgradeability | · | · | · | · | · | **C**◎ | **C**◎ | · | · | · | · | F/F |
| SpotOracleLender | oracle-manipulation | · | · | · | · | · | · | · | L◎ | · | · | · | B/B |
| ✓ CleanOracleLender | clean | · | · | · | · | · | · | · | · | · | · | · | A/A |
| FeeHook | uniswap-v4-hook, sell-restriction | · | · | L/· | **C**◎ | · | · | · | · | **C**◎ | · | · | D/D |
| SignatureGate | signatures | · | · | · | · | · | · | · | · | · | L/·◎ | · | A/A |
| ✓ PlainToken | clean | · | · | · | · | · | · | · | · | · | · | · | A/A |
| ✓ CleanOwnableToken | clean | · | · | · | · | · | · | · | · | · | · | · | A/A |

◎ marks a class this contract was built to exhibit (should be detected). ✓ marks a known-clean control (should stay empty).

## All findings per contract

### ReentrantVault
- [CONFIRMED_ON_FORK] critical — Funds can be drained by reentrancy _(source, bytecode)_

### SafeVault (clean control)
- No findings (no issues found by these checks).

### RugToken
- [CONFIRMED_ON_FORK] high — Owner can mint unlimited tokens _(source, bytecode)_
- [CONFIRMED_ON_FORK] high — Owner can freeze any holder _(source, bytecode)_
- [CONFIRMED_ON_FORK] high — Owner can stop all selling _(source, bytecode)_
- [CONFIRMED_ON_FORK] high — Owner can raise the sell tax to 100% _(source, bytecode)_
- [LIKELY] low — Has a blacklist mapping _(source)_

### MintBackdoorToken
- [CONFIRMED_ON_FORK] high — Owner can mint unlimited tokens _(source, bytecode)_

### OpenInitProxy
- [CONFIRMED_ON_FORK] critical — Anyone can take ownership _(source, bytecode)_
- [CONFIRMED_ON_FORK] high — One key can replace the contract's code _(source, bytecode)_
- [LIKELY] low — Writes the proxy implementation slot directly _(source)_
- [LIKELY] low — Bytecode contains a self-destruct _(source, bytecode)_

### SpotOracleLender
- [LIKELY] high — Prices from a spot AMM pool a trade can move _(source, bytecode)_

### CleanOracleLender (clean control)
- No findings (no issues found by these checks).

### FeeHook
- [CONFIRMED_ON_FORK] high — Hook owner can block swaps for any address _(source, bytecode)_
- [CONFIRMED_ON_FORK] medium — Hook callback accepts any caller _(source, bytecode)_
- [LIKELY] low — Has a blacklist mapping _(source)_

### SignatureGate
- [LIKELY] info — Relies on ECDSA signatures (ecrecover) _(source)_

### PlainToken (clean control)
- No findings (no issues found by these checks).

### CleanOwnableToken (clean control)
- No findings (no issues found by these checks).

## Quantum readiness demonstration

Deployer 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266: nonce 17, publicKeyExposed=true, isContract=false. Key recovery from first tx: matches address.

## Honest limitations

- **Oracle manipulation** is detected at **Likely** from the spot-price source (getReserves/slot0 in a pricing/borrow path), in both source and bytecode mode. It is **not** reproduced on a fork: a confirming PoC is contract-specific. We do not claim a confirmed oracle exploit.
- Detection is measured on WHITEHAT's own contracts. Real-world contracts vary; these numbers describe this suite, not a general accuracy rate.
- Bytecode-only mode has less context than verified source; where the two columns differ, that gap is shown.
- AI review (Review level) is not exercised here (budget 0 in CI); it only ever adds leads, never confirmations.