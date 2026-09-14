import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { changeCustomerPassword } from "@/lib/customers";
import { revokeAllSessions } from "@/lib/db";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

const NEW_PASSWORD_MIN = 6;

export async function POST(request: NextRequest) {
  let body: { currentPassword?: string; newPassword?: string; revokeOthers?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Invalid JSON body."));
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  const revokeOthers = body.revokeOthers !== false;

  if (newPassword.length < NEW_PASSWORD_MIN) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "New password must be at least 6 characters."));
  }
  if (currentPassword.length < 1) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Current password is required."));
  }

  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }

    const updated = await changeCustomerPassword(ctx.customer.id, currentPassword, newPassword);
    if (!updated) {
      await logSecurity(
        "password.change_failed",
        `Wrong current password for ${ctx.customer.userId}`,
        { actorId: ctx.customer.id, ip: ctx.session.ip, deviceFp: ctx.session.deviceFp },
      );
      return apiFail(new ApiError(401, "INVALID_CREDENTIALS", "Your current password is incorrect."));
    }

    // Keep the current session, revoke all others (defense against a stolen
    // credential being used elsewhere).
    if (revokeOthers) {
      const { deleteSession, createSession } = await import("@/lib/db");
      const currentToken = token;
      await revokeAllSessions(ctx.customer.id);
      // The current session is re-issued so the user stays signed in here.
      const replacement = await createSession(
        ctx.customer.id,
        "customer",
        7 * 24 * 60 * 60 * 1000,
        { ip: ctx.session.ip ?? undefined, userAgent: ctx.session.userAgent ?? undefined },
      );
      await deleteSession(currentToken, undefined).catch(() => undefined);
      return apiOk({ changed: true, replacementToken: replacement });
    }

    await logSecurity(
      "password.changed",
      `Password changed for ${ctx.customer.userId}`,
      { actorId: ctx.customer.id, ip: ctx.session.ip, deviceFp: ctx.session.deviceFp },
    );
    return apiOk({ changed: true });
  } catch (err) {
    return apiFail(err);
  }
}