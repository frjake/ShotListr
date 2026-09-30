import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Shotlists" };

export default function MyShotlists() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <h1 className="text-center text-4xl font-semibold">My Shotlists</h1>
    </div>
  );
}
