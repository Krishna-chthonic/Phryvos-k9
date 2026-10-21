export type WorkflowNodeType =
  | "trigger_schedule"
  | "trigger_webhook"
  | "trigger_manual"
  | "ai_script"
  | "ai_video_gen"
  | "ai_tts_voice"
  | "ffmpeg_stitch"
  | "youtube_publish"
  | "telegram_notify"
  | "bash_script"
  | "web_scrape";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  status?: "idle" | "running" | "completed" | "failed";
  lastOutput?: any;
  durationMs?: number;
  error?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: "video" | "social" | "devops" | "automation";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

export const BUILTIN_WORKFLOW_TEMPLATES: Workflow[] = [
  {
    id: "ai-video-youtube-autopilot",
    name: "🎬 AI Video & YouTube Auto-Publisher",
    description: "Generates trending video script, synthesizes voiceover, renders video with FFmpeg, and auto-uploads to YouTube with Telegram alert.",
    category: "video",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "node_trigger",
        type: "trigger_schedule",
        name: "⏰ Daily 10 AM Schedule",
        position: { x: 50, y: 150 },
        config: { cron: "0 10 * * *", intervalDesc: "Daily at 10:00 AM" },
      },
      {
        id: "node_script",
        type: "ai_script",
        name: "🧠 Viral Shorts Script Writer",
        position: { x: 300, y: 150 },
        config: {
          prompt: "Write a high-retention 45-second YouTube Shorts script about trending AI breakthroughs. Structure with: Hook (3s), 3 surprising facts (35s), CTA (7s).",
          targetLengthSec: 45,
        },
      },
      {
        id: "node_tts",
        type: "ai_tts_voice",
        name: "🎙️ Edge-TTS Voiceover Generator",
        position: { x: 580, y: 60 },
        config: {
          voice: "en-US-ChristopherNeural",
          rate: "+5%",
          inputSource: "node_script",
        },
      },
      {
        id: "node_video_gen",
        type: "ai_video_gen",
        name: "🎥 AI Video Generator (Kling / Runway API)",
        position: { x: 580, y: 250 },
        config: {
          platform: "kling_api",
          aspectRatio: "9:16",
          style: "hyper-realistic cinematic",
          inputSource: "node_script",
        },
      },
      {
        id: "node_ffmpeg",
        type: "ffmpeg_stitch",
        name: "🎬 FFmpeg Video & Audio Stitcher",
        position: { x: 860, y: 150 },
        config: {
          resolution: "1080x1920",
          addCaptions: true,
          burnSubtitles: true,
          audioSource: "node_tts",
          videoSource: "node_video_gen",
        },
      },
      {
        id: "node_youtube",
        type: "youtube_publish",
        name: "📺 YouTube Auto-Uploader",
        position: { x: 1140, y: 80 },
        config: {
          privacyStatus: "public",
          category: "Science & Technology",
          tags: ["#shorts", "#ai", "#tech", "#innovation"],
          videoSource: "node_ffmpeg",
        },
      },
      {
        id: "node_telegram",
        type: "telegram_notify",
        name: "📱 Telegram Broadcast Alert",
        position: { x: 1140, y: 240 },
        config: {
          message: "🚀 Video successfully generated and published to YouTube! Title: {{nodes.node_script.output.title}}",
          includePreview: true,
        },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger", target: "node_script" },
      { id: "e2", source: "node_script", target: "node_tts" },
      { id: "e3", source: "node_script", target: "node_video_gen" },
      { id: "e4", source: "node_tts", target: "node_ffmpeg" },
      { id: "e5", source: "node_video_gen", target: "node_ffmpeg" },
      { id: "e6", source: "node_ffmpeg", target: "node_youtube" },
      { id: "e7", source: "node_ffmpeg", target: "node_telegram" },
    ],
  },
  {
    id: "channel-maintenance-autopilot",
    name: "🤖 24/7 Channel Maintenance & Auto-Reply",
    description: "Monitors YouTube comments, auto-generates helpful replies, tracks retention analytics, and reports to Telegram.",
    category: "social",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "m_trigger",
        type: "trigger_schedule",
        name: "⏰ Every 3 Hours Check",
        position: { x: 50, y: 120 },
        config: { cron: "0 */3 * * *", intervalDesc: "Every 3 Hours" },
      },
      {
        id: "m_scrape",
        type: "web_scrape",
        name: "📥 Fetch Recent YouTube Comments",
        position: { x: 300, y: 120 },
        config: { action: "fetch_unreplied_comments", maxResults: 20 },
      },
      {
        id: "m_reply_ai",
        type: "ai_script",
        name: "💬 AI Engagement & Reply Drafter",
        position: { x: 560, y: 120 },
        config: {
          prompt: "Analyze user comments. Draft polite, enthusiastic, engaging replies for positive comments, and helpful answers for tech questions. Flag spam.",
        },
      },
      {
        id: "m_notify",
        type: "telegram_notify",
        name: "📱 Telegram Daily Channel Brief",
        position: { x: 820, y: 120 },
        config: {
          message: "📊 Channel Maintenance Pass Done: Replied to {{nodes.m_reply_ai.output.replyCount}} comments. Flagged {{nodes.m_reply_ai.output.spamCount}} spam.",
        },
      },
    ],
    edges: [
      { id: "me1", source: "m_trigger", target: "m_scrape" },
      { id: "me2", source: "m_scrape", target: "m_reply_ai" },
      { id: "me3", source: "m_reply_ai", target: "m_notify" },
    ],
  },
  {
    id: "web-repurpose-shorts",
    name: "🌐 URL/Blog to Video Repurposer",
    description: "Takes any article, blog post, or tweet link, extracts key insights, creates a video montage, and schedules publishing.",
    category: "automation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "w_trigger",
        type: "trigger_manual",
        name: "⚡ Manual URL Trigger",
        position: { x: 50, y: 140 },
        config: { inputLabel: "Target Article / Tweet URL" },
      },
      {
        id: "w_reach",
        type: "web_scrape",
        name: "🌐 Agent-Reach Scraper",
        position: { x: 300, y: 140 },
        config: { url: "{{input.url}}" },
      },
      {
        id: "w_reformat",
        type: "ai_script",
        name: "🧠 60s Video Script Transformer",
        position: { x: 560, y: 140 },
        config: {
          prompt: "Turn this scraped article into an addictive 60-second video script with visual prompts.",
        },
      },
      {
        id: "w_voice",
        type: "ai_tts_voice",
        name: "🎙️ Voiceover Audio",
        position: { x: 820, y: 70 },
        config: { voice: "en-US-GuyNeural" },
      },
      {
        id: "w_stitch",
        type: "ffmpeg_stitch",
        name: "🎬 Local FFmpeg Assembly",
        position: { x: 820, y: 220 },
        config: { resolution: "1080x1920" },
      },
      {
        id: "w_alert",
        type: "telegram_notify",
        name: "📱 Telegram Review & Approve",
        position: { x: 1080, y: 140 },
        config: {
          message: "🎬 Repurposed video ready for review: {{nodes.w_stitch.output.filePath}}",
        },
      },
    ],
    edges: [
      { id: "we1", source: "w_trigger", target: "w_reach" },
      { id: "we2", source: "w_reach", target: "w_reformat" },
      { id: "we3", source: "w_reformat", target: "w_voice" },
      { id: "we4", source: "w_reformat", target: "w_stitch" },
      { id: "we5", source: "w_voice", target: "w_stitch" },
      { id: "we6", source: "w_stitch", target: "w_alert" },
    ],
  },
];
