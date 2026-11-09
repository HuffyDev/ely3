import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReport } from "@/lib/reports";
import { enqueue } from "@/lib/queue";
import { availableNetworks } from "@/lib/chain";
import { rateLimit } from "@/lib/budget";
import { config } from "@/lib/config";
import { ensureWorker } from "@/lib/bootstrap";

export const runtime = "nodejs";

const Body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), network: z.string() });

export async function POST(req: NextRequest) {
  ensureWorker();
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid wallet address and network." }, { status: 400 });
  }
  if (!availableNetworks().includes(body.network as never)) {
    return NextResponse.json({ error: "Network not available." }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`wallet:${ip}`, config.scansPerIpPerHour, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  // Public wallet report = quantum readiness only. Privacy reports go through the signed flow.
  const id = createReport("wallet", body.network as never, body.address, "user");
  enqueue("wallet_scan", { reportId: id }, 1);
  return NextResponse.json({ id });
}
