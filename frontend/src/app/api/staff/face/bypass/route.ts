import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isBypassed } from "@/lib/faceBypass";
import { issueBypassToken, staffFaceCookie } from "@/lib/staffFace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.search = "";
  const user = await getCurrentUser();
  if (!user) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!(await isBypassed("staff", user.id))) {
    url.pathname = "/verify-face";
    return NextResponse.redirect(url);
  }
  url.pathname = user.role === "admin" ? "/admin" : "/support/reports";
  const res = NextResponse.redirect(url);
  res.cookies.set(staffFaceCookie(issueBypassToken(user.id)));
  return res;
}
