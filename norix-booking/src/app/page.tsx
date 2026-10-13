import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <div className="home-in">
        <div className="home-mark">N</div>
        <h1>Norix Booking</h1>
        <p>Reservations and appointments for restaurants, salons, spas and services in Ghana.</p>
        <div className="home-links">
          <Link href="/kozo">Kozo · book a table</Link>
          <Link href="/kozo/3d">Kozo · 3D seat view</Link>
          <Link href="/kozo/host">Kozo · host screen (staff)</Link>
        </div>
      </div>
    </main>
  );
}
