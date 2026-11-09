import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { issueChallenge, pruneChallenges } from "@/lib/privacy/auth";

export const runtime = "nodejs";

const Body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid wallet address." }, { status: 400 });
  }
  pruneChallenges();
  const { nonce, message, expiresAt } = issueChallenge(body.address);
  return NextResponse.json({ nonce, message, expiresAt });
}
