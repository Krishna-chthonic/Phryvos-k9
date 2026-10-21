import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import {
  reachWeb,
  reachGithub,
  reachReddit,
  reachYouTube,
  reachTweet,
  reachRss,
} from "@/lib/agent/reach-service";

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json || !json.target) {
    return NextResponse.json({ error: "Missing required 'target' parameter" }, { status: 400 });
  }

  const { channel, target, maxChars } = json;

  return vaultRoute(async () => {
    try {
      let data: any = null;

      switch (channel) {
        case "github":
          data = await reachGithub(target);
          break;
        case "reddit":
          data = await reachReddit(target);
          break;
        case "youtube":
          data = await reachYouTube(target);
          break;
        case "twitter":
          data = await reachTweet(target);
          break;
        case "rss":
          data = await reachRss(target, maxChars || 10);
          break;
        case "web":
        default:
          data = await reachWeb(target, maxChars || 20_000);
          break;
      }

      return NextResponse.json({ success: true, channel: channel || "web", data });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
