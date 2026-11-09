import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Hex } from "viem";
import { verifyChallenge } from "@/lib/privacy/auth";
import { buildPrivacyReport } from "@/lib/privacy/report";
import { availableNetworks } from "@/lib/chain";
import { rateLimit } from "@/lib/budget";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const Body = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  network: z.string(),
  nonce: z.string(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!availableNetworks().includes(body.network as never)) {
    return NextResponse.json({ error: "Network not available." }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`privacy:${ip}`, config.scansPerIpPerHour, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  // Ownership gate: the report is only built after the signature proves control of the wallet.
  const ok = await verifyChallenge(body.address, body.nonce, body.signature as Hex);
  if (!ok) {
    return NextResponse.json({ error: "Signature did not verify. The report is only generated for a wallet whose owner signs the challenge." }, { status: 401 });
  }

  try {
    const report = await buildPrivacyReport(body.network as never, body.address);
    // Returned to the owner only, in this response. Not stored or indexed unless the owner opts in.
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
