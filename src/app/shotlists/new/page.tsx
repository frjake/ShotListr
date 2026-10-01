import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROW_KIND } from "@/lib/constants";
import { emptyRow } from "@/lib/rows";
import { NewShotlistEditor } from "./NewShotlistEditor";

export const metadata: Metadata = { title: "New Shotlist" };

export default async function NewShotlist() {
  await requireUser("/shotlists/new");
  return (
    <NewShotlistEditor
      heading="New Shotlist"
      initialTitle=""
      initialRows={[{ ...emptyRow(ROW_KIND.SCENE), sceneNumber: "1" }, emptyRow(ROW_KIND.SHOT)]}
    />
  );
}
