/**
 * Rules for an uploaded profile photo, shared by the upload control and the
 * route so both refuse the same files.
 *
 * The type is decided by the file's own bytes, never by its name or the
 * declared Content-Type: a renamed HTML or SVG file must not be stored and
 * later served as an image. SVG is not accepted at all, since it can carry
 * script.
 */

export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ProfileImageType = (typeof PROFILE_IMAGE_TYPES)[number];
/** For the file picker's `accept` attribute. */
export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_TYPES.join(",");
export const PROFILE_IMAGE_RULES_TEXT = "PNG, JPEG or WebP, up to 2 MB.";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectProfileImageType(bytes: Uint8Array): ProfileImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type ProfileImageCheck =
  | { ok: true; contentType: ProfileImageType }
  | { ok: false; code: "IMAGE_EMPTY" | "IMAGE_TOO_LARGE" | "IMAGE_TYPE_UNSUPPORTED"; message: string };

export function checkProfileImage(bytes: Uint8Array): ProfileImageCheck {
  if (bytes.byteLength === 0) return { ok: false, code: "IMAGE_EMPTY", message: "Choose an image to upload." };
  if (bytes.byteLength > PROFILE_IMAGE_MAX_BYTES) return { ok: false, code: "IMAGE_TOO_LARGE", message: "That image is larger than 2 MB. Choose a smaller one." };
  const contentType = detectProfileImageType(bytes);
  if (!contentType) return { ok: false, code: "IMAGE_TYPE_UNSUPPORTED", message: "Use a PNG, JPEG or WebP image." };
  return { ok: true, contentType };
}
