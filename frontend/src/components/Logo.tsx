import Image from "next/image";

export default function Logo() {
  return (
    <div className="logo">
      <Image src="/logo.png" alt="" width={96} height={96} priority />
    </div>
  );
}
