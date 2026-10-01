import type { Metadata } from "next";
import { ShotlistEditor } from "@/components/ShotlistEditor";
import { requireUser } from "@/lib/auth";
import { ROW_KIND } from "@/lib/constants";
import { emptyRow } from "@/lib/rows";

export const metadata: Metadata = { title: "New Shotlist" };

export default async function NewShotlist() {
  await requireUser("/shotlists/new");
  return (
    <ShotlistEditor
      heading="New Shotlist"
      initialTitle=""
      initialRows={[{ ...emptyRow(ROW_KIND.SCENE), sceneNumber: "1" }, emptyRow(ROW_KIND.SHOT)]}
    />
  );
}
