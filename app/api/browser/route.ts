import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { OpenBrowserEngine } from "@/lib/browser/openbrowser-engine";
import { getDot } from "@/lib/dots-service";
import { verifyDotBrowserPermission } from "@/lib/browser/browser-guard";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session") || "default";

  return vaultRoute(async (ctx) => {
    // If session corresponds to a Dot, enforce tool permission boundary
    const dot = getDot(ctx, sessionId);
    if (dot && !verifyDotBrowserPermission(dot.tools)) {
      return NextResponse.json(
        { error: { code: "tool_disabled", message: `Browser tool is not enabled for ${dot.name}` } },
        { status: 403 }
      );
    }

    const session = OpenBrowserEngine.getOrCreateSession(sessionId);
    return NextResponse.json({
      session: {
        sessionId: session.sessionId,
        currentUrl: session.currentUrl,
        title: session.title,
        status: session.status,
        elementCount: session.interactiveElements.length,
        interactiveElements: session.interactiveElements,
        pageTextSnippet: session.pageText.slice(0, 3000),
        lastAction: session.lastAction,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json || !json.action) {
    return NextResponse.json({ error: "Missing required 'action' in body" }, { status: 400 });
  }

  const sessionId = json.sessionId || "default";

  return vaultRoute(async (ctx) => {
    // If session corresponds to a Dot, enforce tool permission boundary
    const dot = getDot(ctx, sessionId);
    if (dot && !verifyDotBrowserPermission(dot.tools)) {
      return NextResponse.json(
        { error: { code: "tool_disabled", message: `Browser tool is not enabled for ${dot.name}` } },
        { status: 403 }
      );
    }

    try {
      let session: any;

      switch (json.action) {
        case "navigate":
          if (!json.url) throw new Error("Missing 'url' parameter for navigate action.");
          session = await OpenBrowserEngine.navigate(sessionId, json.url);
          break;
        case "click":
          if (json.elementId === undefined) throw new Error("Missing 'elementId' parameter for click action.");
          session = await OpenBrowserEngine.click(sessionId, Number(json.elementId));
          break;
        case "type":
          if (json.elementId === undefined || json.text === undefined) {
            throw new Error("Missing 'elementId' or 'text' for type action.");
          }
          session = OpenBrowserEngine.type(sessionId, Number(json.elementId), String(json.text));
          break;
        case "submit":
          session = await OpenBrowserEngine.submit(sessionId, json.elementId ? Number(json.elementId) : undefined);
          break;
        case "goBack":
          session = await OpenBrowserEngine.goBack(sessionId);
          break;
        case "reset":
          OpenBrowserEngine.resetSession(sessionId);
          session = OpenBrowserEngine.getOrCreateSession(sessionId);
          break;
        default:
          throw new Error(`Unknown browser action: ${json.action}`);
      }

      return NextResponse.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          currentUrl: session.currentUrl,
          title: session.title,
          status: session.status,
          elementCount: session.interactiveElements.length,
          interactiveElements: session.interactiveElements,
          pageTextSnippet: session.pageText.slice(0, 3000),
          lastAction: session.lastAction,
        },
      });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
