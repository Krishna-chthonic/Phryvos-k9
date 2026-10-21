import { NextResponse } from "next/server";
import { FREE_FRONTIER_MODELS } from "@/lib/ai/free-frontier-service";

export async function GET() {
  const data = FREE_FRONTIER_MODELS.map((m) => ({
    id: m.id,
    object: "model",
    created: 1700000000,
    owned_by: m.provider,
    permission: [],
    root: m.id,
    parent: null,
  }));

  return NextResponse.json({
    object: "list",
    data,
  });
}
