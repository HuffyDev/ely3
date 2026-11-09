import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReport } from "@/lib/reports";
import { enqueue } from "@/lib/queue";
import { availableNetworks } from "@/lib/chain";
import { rateLimit } from "@/lib/budget";
import { config } from "@/lib/config";
import { ensureWorker } from "@/lib/bootstrap";

export const runtime = "nodejs";

const Body = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  network: z.string(),
});

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: NextRequest) {
  ensureWorker();
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid address and network." }, { status: 400 });
  }

  const networks = availableNetworks();
  if (!networks.includes(body.network as never)) {
    return NextResponse.json({ error: `Network "${body.network}" is not available. Configure its RPC in .env.` }, { status: 400 });
  }

  if (!rateLimit(`scan:${clientIp(req)}`, config.scansPerIpPerHour, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many scans from this address in the last hour. Try again later." }, { status: 429 });
  }

  const id = createReport("contract", body.network as never, body.address, "user");
  enqueue("contract_scan", { reportId: id, network: body.network, address: body.address }, 1);
  return NextResponse.json({ id });
}
