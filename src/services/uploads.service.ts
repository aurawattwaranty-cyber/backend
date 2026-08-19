import crypto from "node:crypto";
import { config } from "../config.js";
import type { WarrantyPhoto } from "../types.js";
import { AppError } from "../utils/errors.js";

export interface UploadEvidenceInput {
  requirementId: string;
  requirementLabel: string;
  fileName: string;
  dataUrl: string;
}

function requireCloudinaryConfig(): void {
  if (
    !config.cloudinaryCloudName.trim() ||
    !config.cloudinaryApiKey.trim() ||
    !config.cloudinaryApiSecret.trim()
  ) {
    throw new AppError(
      "Cloudinary is not configured. Add the Cloudinary keys to backend/.env.",
      500,
      "cloudinary_not_configured",
    );
  }
}

function parseDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
  sizeBytes: number;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new AppError(
      "Upload the photo again. The file data could not be processed.",
      400,
      "invalid_upload",
    );
  }

  const mimeType = match[1]?.trim();
  const base64 = match[2]?.trim();
  if (!mimeType || !base64) {
    throw new AppError(
      "Upload the photo again. The file data could not be processed.",
      400,
      "invalid_upload",
    );
  }

  return {
    mimeType,
    base64,
    sizeBytes: Buffer.from(base64, "base64").byteLength,
  };
}

function buildSignature(params: Record<string, string>): string {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(`${payload}${config.cloudinaryApiSecret}`)
    .digest("hex");
}

async function uploadToCloudinary(input: {
  dataUrl: string;
  publicId: string;
}): Promise<{ secureUrl: string; publicId: string; bytes: number }> {
  requireCloudinaryConfig();
  const parsed = parseDataUrl(input.dataUrl);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    timestamp,
    folder: config.cloudinaryFolder,
    public_id: input.publicId,
  };

  const searchParams = new URLSearchParams({
    file: input.dataUrl,
    api_key: config.cloudinaryApiKey,
    timestamp,
    folder: config.cloudinaryFolder,
    public_id: input.publicId,
    signature: buildSignature(params),
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/upload`,
    {
      method: "POST",
      body: searchParams,
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new AppError(
      details || "Cloudinary rejected the photo upload.",
      502,
      "cloudinary_upload_failed",
    );
  }

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
  };

  if (!payload.secure_url || !payload.public_id) {
    throw new AppError(
      "Cloudinary did not return a usable image URL.",
      502,
      "cloudinary_upload_failed",
    );
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    bytes: parsed.sizeBytes,
  };
}

async function deleteFromCloudinary(publicId: string): Promise<void> {
  requireCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    timestamp,
    public_id: publicId,
    invalidate: "true",
  };

  const searchParams = new URLSearchParams({
    public_id: publicId,
    invalidate: "true",
    api_key: config.cloudinaryApiKey,
    timestamp,
    signature: buildSignature(params),
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/destroy`,
    {
      method: "POST",
      body: searchParams,
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new AppError(
      details || "Cloudinary could not delete the photo.",
      502,
      "cloudinary_delete_failed",
    );
  }
}

export async function uploadEvidencePhoto(
  input: UploadEvidenceInput,
): Promise<WarrantyPhoto> {
  const requirementId = input.requirementId.trim();
  const requirementLabel = input.requirementLabel.trim();
  const fileName = input.fileName.trim();
  const dataUrl = input.dataUrl.trim();

  if (!requirementId || !requirementLabel || !fileName || !dataUrl) {
    throw new AppError(
      "Provide the photo details and file data before uploading.",
      400,
      "invalid_upload",
    );
  }

  const publicId = `${config.cloudinaryFolder}/${requirementId}/${Date.now()}-${crypto.randomUUID()}`;
  const uploaded = await uploadToCloudinary({ dataUrl, publicId });

  return {
    requirementId,
    requirementLabel,
    fileName,
    url: uploaded.secureUrl,
    sizeBytes: uploaded.bytes,
    uploadedAt: new Date().toISOString(),
    storageId: uploaded.publicId,
  };
}

export async function deleteEvidencePhoto(publicId: string): Promise<void> {
  const storageId = publicId.trim();
  if (!storageId) return;
  await deleteFromCloudinary(storageId);
}
