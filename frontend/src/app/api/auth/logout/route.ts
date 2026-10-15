import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session";
import { STAFF_FACE_COOKIE } from "@/lib/staffFace";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(STAFF_FACE_COOKIE);
  return res;
}
