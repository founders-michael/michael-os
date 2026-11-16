import { accountErrorResponse, getProfileImage, removeProfileImage, saveProfileImage } from "@/lib/account-service";
import { checkProfileImage, PROFILE_IMAGE_MAX_BYTES } from "@/lib/profile-image";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

const UNAUTHENTICATED = "Sign in with an account that has LifestyleOS access.";

/**
 * The signed-in user's own uploaded photo. There is no user id in the URL:
 * each user can only ever reach their own. The `?v=` the identity adds is a
 * cache key only. The image is served with its sniffed type, `nosniff` and a
 * sandboxing CSP so the browser never treats it as anything but an image.
 */
export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });
  try {
    const image = await getProfileImage(userId);
    if (!image) return Response.json({ error: "No profile photo has been uploaded.", code: "IMAGE_NOT_FOUND" }, { status: 404 });
    return new Response(image.data, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.data.byteLength),
        // Private to this browser; the versioned URL changes when the photo does.
        "Cache-Control": "private, max-age=31536000, immutable",
        Vary: "Cookie, Authorization",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return accountErrorResponse(error, "account-image");
  }
}

/** The request body is the image file itself. */
export async function PUT(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > PROFILE_IMAGE_MAX_BYTES) return Response.json({ error: "That image is larger than 2 MB. Choose a smaller one.", code: "IMAGE_TOO_LARGE" }, { status: 413 });

  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = new Uint8Array(await request.arrayBuffer()); } catch { return Response.json({ error: "We couldn't read that image. Try again." }, { status: 400 }); }

  const check = checkProfileImage(bytes);
  if (!check.ok) return Response.json({ error: check.message, code: check.code }, { status: check.code === "IMAGE_TOO_LARGE" ? 413 : 400 });

  try {
    return privateJson({ account: await saveProfileImage(userId, bytes, check.contentType) });
  } catch (error) {
    return accountErrorResponse(error, "account-image");
  }
}

/** Removes the upload; the sign-in provider's photo, or initials, shows again. */
export async function DELETE() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: UNAUTHENTICATED }, { status: 401 });
  try {
    return privateJson({ account: await removeProfileImage(userId) });
  } catch (error) {
    return accountErrorResponse(error, "account-image");
  }
}
