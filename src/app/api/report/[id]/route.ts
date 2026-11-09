import { NextRequest, NextResponse } from "next/server";
import { getReport } from "@/lib/reports";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getReport(id);
  if (!row) return NextResponse.json({ error: "No such report." }, { status: 404 });
  return NextResponse.json({
    id: row.id,
    status: row.status,
    kind: row.kind,
    network: row.network,
    target: row.target,
    error: row.error,
    report: row.json ? JSON.parse(row.json) : null,
  });
}
