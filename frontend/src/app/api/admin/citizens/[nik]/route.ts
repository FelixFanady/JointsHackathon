import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { deleteProfile, resolveProfileGeo, savePinGeo, saveProfile, type CitizenProfile } from "@/lib/citizenProfile";
import { deleteActivity } from "@/lib/citizenActivity";

type Ctx = { params: Promise<{ nik: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });
  const b = await req.json().catch(() => null);

  // --- Base columns that really exist on `citizens` ---
  const patch: { full_name?: string; active?: boolean } = {};
  if (typeof b?.full_name === "string") {
    const n = b.full_name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 100) return NextResponse.json({ error: "Nama harus 2-100 karakter." }, { status: 400 });
    patch.full_name = n;
  }
  if (typeof b?.active === "boolean") patch.active = b.active;

  // --- Profile fields: validated, then stored in the settings-backed store ---
  const profile: CitizenProfile = {};
  let hasProfile = false;
  if ("email" in (b ?? {})) {
    const v = (b.email ?? "").toString().trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
    if (v.length > 120) return NextResponse.json({ error: "Email terlalu panjang." }, { status: 400 });
    profile.email = v || null;
    hasProfile = true;
  }
  if ("phone" in (b ?? {})) {
    const v = (b.phone ?? "").toString().trim();
    if (v && !/^\+?[0-9][0-9\s-]{6,19}$/.test(v)) return NextResponse.json({ error: "Nomor HP tidak valid." }, { status: 400 });
    profile.phone = v || null;
    hasProfile = true;
  }
  if ("birth_date" in (b ?? {})) {
    const v = (b.birth_date ?? "").toString().trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });
    profile.birth_date = v || null;
    hasProfile = true;
  }
  if ("address" in (b ?? {})) {
    profile.address = (b.address ?? "").toString().trim().slice(0, 400) || null;
    hasProfile = true;
  }
  if ("photo" in (b ?? {})) {
    const v = b.photo;
    if (v === null || v === "") {
      profile.photo = null;
      profile.face = null; // no photo -> the citizen must enrol their face again in the app
    } else if (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v)) {
      if (v.length > 360000) return NextResponse.json({ error: "Foto terlalu besar. Coba foto lain." }, { status: 400 });
      profile.photo = v;
      profile.face = { source: "admin", enrolled_at: new Date().toISOString() };
    } else {
      return NextResponse.json({ error: "Foto tidak valid." }, { status: 400 });
    }
    hasProfile = true;
  }

  if (!Object.keys(patch).length && !hasProfile) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  if (Object.keys(patch).length) {
    const { error } = await db().from("citizens").update(patch).eq("nik", nik);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (hasProfile) {
    // Profile data is encrypted (lib/crypto.ts). Without the right key the save cannot run at all;
    // say so plainly instead of a raw 500.
    let err: string | null;
    try {
      err = await saveProfile(nik, profile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[citizens] profile save failed for ${nik}:`, msg);
      return NextResponse.json(
        {
          error: msg.includes("DATA_ENCRYPTION_KEY")
            ? "Data profil tidak bisa disimpan: kunci enkripsi (DATA_ENCRYPTION_KEY) belum dipasang di server."
            : "Data profil tidak bisa disimpan: data lama tidak bisa dibuka dengan kunci enkripsi yang dipasang.",
        },
        { status: 503 },
      );
    }
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    // Address changed -> work out its district/city on the street map (best-effort, after responding).
    // A map pin from the picker is exact; otherwise the text is geocoded.
    if ("address" in profile) {
      const lat = Number(b?.pin?.lat);
      const lng = Number(b?.pin?.lng);
      const pinned = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !!profile.address;
      void (pinned ? savePinGeo(nik, { lat, lng }, profile.address as string) : resolveProfileGeo(nik)).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });
  const { error } = await db().from("citizens").delete().eq("nik", nik);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await deleteProfile(nik); // best-effort cleanup of the profile row
  await deleteActivity(nik); // and the activity row
  return NextResponse.json({ ok: true });
}
