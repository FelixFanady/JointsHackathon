import { redirect } from "next/navigation";

export default function SupportRedirect() {
  redirect("/admin/users");
}
