import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { dshChassis } from "@/lib/plugins/dsh-chassis";

export async function GET() {
  return vaultRoute(() => {
    const plugins = dshChassis.listPlugins().map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      category: p.category,
      enabled: p.enabled,
      author: p.author,
      isCore: !!p.isCore,
      hookTypes: [
        p.hooks?.beforeTurn ? "beforeTurn" : null,
        p.hooks?.onToolCall ? "onToolCall" : null,
        p.hooks?.onStep ? "onStep" : null,
        p.hooks?.afterTurn ? "afterTurn" : null,
      ].filter(Boolean),
    }));

    return NextResponse.json({
      plugins,
      totalCount: plugins.length,
      activeCount: dshChassis.getActivePluginCount(),
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json || typeof json.pluginId !== "string" || typeof json.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  return vaultRoute(() => {
    let success = false;
    if (json.enabled) {
      success = dshChassis.enablePlugin(json.pluginId);
    } else {
      success = dshChassis.disablePlugin(json.pluginId);
    }

    if (!success) {
      return NextResponse.json(
        { error: "Cannot modify this plugin (core or not found)" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      pluginId: json.pluginId,
      enabled: json.enabled,
    });
  });
}
