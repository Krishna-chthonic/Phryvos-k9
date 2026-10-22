import { z } from "zod";

export const ALLOWED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_TOTAL_ATTACHMENTS_SIZE_BYTES = 10 * 1024 * 1024; // 10MB total
export const MAX_ATTACHMENTS_COUNT = 4;

/**
 * Validates a base64 string and detects its actual image MIME from magic bytes.
 */
export function verifyImageMagicBytes(base64Data: string, declaredMime?: string): {
  valid: boolean;
  detectedMime?: AllowedImageMime;
  error?: string;
} {
  if (!base64Data || typeof base64Data !== "string") {
    return { valid: false, error: "Missing or invalid base64 data" };
  }

  // Basic base64 character set check on the prefix
  const cleanB64 = base64Data.trim();
  const prefix = cleanB64.slice(0, 32);

  let detectedMime: AllowedImageMime | undefined;

  // PNG magic bytes: 89 50 4E 47 (base64 starts with iVBORw0KGgo)
  if (prefix.startsWith("iVBORw0KGgo")) {
    detectedMime = "image/png";
  }
  // JPEG magic bytes: FF D8 FF (base64 starts with /9j/)
  else if (prefix.startsWith("/9j/")) {
    detectedMime = "image/jpeg";
  }
  // WEBP magic bytes: RIFF....WEBP (base64 starts with UklGR and has WEBP at bytes 8-11)
  else if (prefix.startsWith("UklGR")) {
    try {
      const buf = Buffer.from(cleanB64.slice(0, 24), "base64");
      if (
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP"
      ) {
        detectedMime = "image/webp";
      }
    } catch {
      /* decode failure */
    }
  }
  // GIF magic bytes: GIF87a or GIF89a (base64 starts with R0lGOD)
  else if (prefix.startsWith("R0lGOD")) {
    detectedMime = "image/gif";
  }

  if (!detectedMime) {
    return {
      valid: false,
      error: "Unsupported file signature or corrupted image header",
    };
  }

  if (declaredMime && declaredMime !== detectedMime) {
    // Check if declared MIME is one of allowed types
    if (!ALLOWED_IMAGE_MIMES.includes(declaredMime as AllowedImageMime)) {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' is not allowed`,
      };
    }
    // Spoofed extension check
    return {
      valid: false,
      error: `MIME type mismatch: declared '${declaredMime}' but payload is '${detectedMime}'`,
    };
  }

  return { valid: true, detectedMime };
}

/**
 * Calculate raw binary size from base64 string
 */
export function estimateBase64Bytes(base64Data: string): number {
  const len = base64Data.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64Data.endsWith("==")) padding = 2;
  else if (base64Data.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

export const ImagePartSchema = z
  .object({
    type: z.literal("image"),
    dataBase64: z.string().min(1, "Empty image data"),
    mediaType: z.enum(ALLOWED_IMAGE_MIMES).optional(),
    url: z.string().optional(),
    name: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const byteSize = estimateBase64Bytes(data.dataBase64);
    if (byteSize > MAX_ATTACHMENT_SIZE_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Image exceeds maximum size of 5MB (got ${(byteSize / 1024 / 1024).toFixed(2)}MB)`,
      });
      return;
    }

    const check = verifyImageMagicBytes(data.dataBase64, data.mediaType);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.error || "Invalid image payload",
      });
    }
  });

export const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "Empty text part"),
});

export const ChatMessagePartSchema = z.union([TextPartSchema, ImagePartSchema]);

export const ChatMessageContentSchema = z.union([
  z.string().min(1).max(50_000),
  z
    .array(ChatMessagePartSchema)
    .min(1)
    .max(50)
    .superRefine((parts, ctx) => {
      const imageParts = parts.filter(
        (p): p is z.infer<typeof ImagePartSchema> => p.type === "image",
      );
      if (imageParts.length > MAX_ATTACHMENTS_COUNT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Too many attachments: maximum is ${MAX_ATTACHMENTS_COUNT}, received ${imageParts.length}`,
        });
        return;
      }

      let totalBytes = 0;
      for (const img of imageParts) {
        totalBytes += estimateBase64Bytes(img.dataBase64);
      }
      if (totalBytes > MAX_TOTAL_ATTACHMENTS_SIZE_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Total attachments size exceeds 10MB limit (got ${(totalBytes / 1024 / 1024).toFixed(2)}MB)`,
        });
      }
    }),
]);

export const SendMessageBodySchema = z.object({
  content: ChatMessageContentSchema.optional(),
  model: z.string().min(1).max(100).optional(),
  regenerate: z.boolean().optional(),
  noRag: z.boolean().optional(),
  effort: z.enum(["low", "medium", "high", "max", "xhigh", "ultra"]).optional(),
  mode: z
    .enum(["thinking", "flash", "research", "coding", "creative", "study", "general"])
    .optional(),
});

export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
