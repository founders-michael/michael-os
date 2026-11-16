import assert from "node:assert/strict";
import test from "node:test";
import { checkProfileImage, detectProfileImageType, PROFILE_IMAGE_MAX_BYTES } from "./profile-image";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

test("type comes from the bytes", () => {
  assert.equal(detectProfileImageType(png), "image/png");
  assert.equal(detectProfileImageType(jpeg), "image/jpeg");
  assert.equal(detectProfileImageType(webp), "image/webp");
  assert.equal(detectProfileImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(detectProfileImageType(new TextEncoder().encode("<html><script>")), null);
  assert.equal(detectProfileImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), null, "RIFF but not WebP");
});

test("empty, oversized and unsupported files are refused with their own code", () => {
  assert.deepEqual(checkProfileImage(png), { ok: true, contentType: "image/png" });
  assert.equal((checkProfileImage(new Uint8Array()) as { code: string }).code, "IMAGE_EMPTY");
  const big = new Uint8Array(PROFILE_IMAGE_MAX_BYTES + 1);
  big.set(png);
  assert.equal((checkProfileImage(big) as { code: string }).code, "IMAGE_TOO_LARGE");
  const atLimit = new Uint8Array(PROFILE_IMAGE_MAX_BYTES);
  atLimit.set(png);
  assert.equal(checkProfileImage(atLimit).ok, true);
  assert.equal((checkProfileImage(new TextEncoder().encode("GIF89a")) as { code: string }).code, "IMAGE_TYPE_UNSUPPORTED");
});
