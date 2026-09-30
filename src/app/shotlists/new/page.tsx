import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Shotlist" };

export default function NewShotlist() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <h1 className="text-center text-4xl font-semibold">New Shotlist</h1>
    </div>
  );
}
