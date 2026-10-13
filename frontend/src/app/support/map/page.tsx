import MapLoader from "./MapLoader";

export const metadata = { title: "Peta Pemantauan — SiagaKu Support" };

export default function MapPage() {
  return (
    <main className="main flush">
      <MapLoader />
    </main>
  );
}
