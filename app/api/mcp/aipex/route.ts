import { NextRequest, NextResponse } from "next/server";
import { aipexBridge } from "@/lib/browser/aipex-bridge";

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json || !json.jsonrpc || !json.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: json?.id ?? null, error: { code: -32600, message: "Invalid Request" } },
      { status: 400 },
    );
  }

  const { id, method, params } = json;

  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "AIPex Browser Automation Bridge",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
            resources: {},
          },
        },
      });

    case "ping":
      return NextResponse.json({ jsonrpc: "2.0", id, result: {} });

    case "tools/list":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: aipexBridge.getMcpTools(),
        },
      });

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        let toolOutput: any = null;

        switch (toolName) {
          case "aipex_list_tabs":
            toolOutput = aipexBridge.listTabs();
            break;
          case "aipex_switch_tab":
            toolOutput = aipexBridge.switchTab(Number(args.tabId));
            break;
          case "aipex_new_tab":
            toolOutput = aipexBridge.newTab(String(args.url), args.title);
            break;
          case "aipex_close_tab":
            toolOutput = { success: aipexBridge.closeTab(Number(args.tabId)) };
            break;
          case "aipex_eval_script":
            toolOutput = await aipexBridge.evalScript(Number(args.tabId), String(args.code));
            break;
          default:
            return NextResponse.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Tool '${toolName}' not found.` },
            });
        }

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2),
              },
            ],
          },
        });
      } catch (callErr) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: callErr instanceof Error ? callErr.message : String(callErr),
              },
            ],
          },
        });
      }
    }

    default:
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method '${method}' not found.` },
      });
  }
}
