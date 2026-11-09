/**
 * Operator console (CLI). The human-approval surface for disclosures and the ledger.
 * WHITEHAT never sends a notice, publishes a summary, pays a bounty, or moves funds on its own —
 * every one of those is a manual step the operator takes here.
 *
 * Usage:
 *   npm run operator -- disclosures
 *   npm run operator -- proofs <reportId>
 *   npm run operator -- create-disclosure <reportId> <network> <target> <severity> "<internal title>" [contact]
 *   npm run operator -- approve-notice <id>
 *   npm run operator -- mark-notified <id> ["note"]
 *   npm run operator -- mark-fixed <id> ["note"]
 *   npm run operator -- publish <id> "<plain-language summary>"
 *   npm run operator -- ledger
 *   npm run operator -- ledger-add <in|out> <category> <amount> <asset> [txHash] ["note"]
 */
import "./load-env.ts";
import { secrets } from "../src/lib/config";
import { timingSafeEqualStr } from "../src/lib/crypto";
import * as disc from "../src/lib/disclosure/workflow";
import { readProofs } from "../src/lib/disclosure/proofs";
import { addLedgerEntry, ledgerView } from "../src/lib/ledger";

const ACTOR = "operator-cli";

function requireToken() {
  const expected = secrets.operatorToken();
  const given = process.env.OPERATOR_TOKEN_ARG || process.env.OPERATOR_TOKEN || "";
  if (!expected) throw new Error("OPERATOR_TOKEN is not set in .env. Set it before using the operator console.");
  if (!timingSafeEqualStr(expected, given)) throw new Error("Operator token mismatch.");
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  requireToken();

  switch (cmd) {
    case "disclosures": {
      for (const d of disc.list()) console.log(`${d.id}  ${d.status.padEnd(16)} ${d.severity.padEnd(8)} ${d.network} ${d.target}  "${d.internalTitle}"`);
      break;
    }
    case "proofs": {
      const proofs = readProofs(args[0]);
      console.log(JSON.stringify(proofs, null, 2));
      break;
    }
    case "create-disclosure": {
      const [reportId, network, target, severity, title, contact] = args;
      const d = disc.createDisclosure({ reportId, network, target, severity: severity as never, internalTitle: title, contact }, ACTOR);
      console.log(`Created ${d.id} (status ${d.status}).`);
      break;
    }
    case "approve-notice":
      console.log(JSON.stringify(disc.approveNotice(args[0], ACTOR), null, 2));
      break;
    case "mark-notified":
      console.log(JSON.stringify(disc.markNotified(args[0], ACTOR, args[1]), null, 2));
      break;
    case "mark-fixed":
      console.log(JSON.stringify(disc.markFixed(args[0], ACTOR, args[1]), null, 2));
      break;
    case "publish":
      console.log(JSON.stringify(disc.approvePublish(args[0], ACTOR, args[1] ?? ""), null, 2));
      break;
    case "events":
      console.log(JSON.stringify(disc.events(args[0]), null, 2));
      break;
    case "ledger": {
      const v = ledgerView();
      console.log(`AI spent today: $${v.aiSpentTodayUsd.toFixed(4)}`);
      console.log("Totals by asset:", v.totalsByAsset);
      for (const e of v.entries) console.log(`${new Date(e.at).toISOString()} ${e.direction} ${e.category} ${e.amount} ${e.asset} ${e.txHash ?? ""} ${e.note ?? ""}`);
      break;
    }
    case "ledger-add": {
      const [direction, category, amount, asset, txHash, note] = args;
      addLedgerEntry({ direction: direction as never, category: category as never, amount, asset, txHash, note });
      console.log("Added ledger entry.");
      break;
    }
    default:
      console.log("Unknown command. See the header of scripts/operator.ts for usage.");
  }
}

main().catch((e) => {
  console.error("Error:", (e as Error).message);
  process.exit(1);
});
