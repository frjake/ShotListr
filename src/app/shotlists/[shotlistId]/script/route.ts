import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scriptContentType } from "@/lib/scripts";

/** Downloads a shotlist's script, exactly as uploaded. Only the shotlist's owner can get it. */
export async function GET(_req: Request, ctx: RouteContext<"/shotlists/[shotlistId]/script">) {
  const { shotlistId } = await ctx.params;
  const user = await getCurrentUser();
  // 404 rather than 401/403, so other people can't tell whether a shotlist exists.
  const script = user
    ? await prisma.script.findFirst({ where: { shotlistId, shotlist: { userId: user.id } } })
    : null;
  if (!script) return new Response("Not found", { status: 404 });

  const asciiName = script.fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(script.data, {
    headers: {
      "Content-Type": scriptContentType(script.fileName),
      "Content-Length": String(script.size),
      // Always a download, never shown in the page, and never sniffed as something else.
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(script.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
