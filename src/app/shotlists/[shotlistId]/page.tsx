import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShotlistEditor } from "@/components/ShotlistEditor";
import { getCurrentUser, requireUser } from "@/lib/auth";
import type { RowKind } from "@/lib/constants";
import { cleanRow } from "@/lib/rows";
import { getOwnedShotlist } from "@/lib/shotlists";

export async function generateMetadata(props: PageProps<"/shotlists/[shotlistId]">): Promise<Metadata> {
  const { shotlistId } = await props.params;
  const user = await getCurrentUser();
  const shotlist = user ? await getOwnedShotlist(shotlistId, user.id) : null;
  return { title: shotlist?.title ?? "Shotlist" };
}

export default async function EditShotlist(props: PageProps<"/shotlists/[shotlistId]">) {
  const { shotlistId } = await props.params;
  const user = await requireUser(`/shotlists/${shotlistId}`);
  const shotlist = await getOwnedShotlist(shotlistId, user.id);
  if (!shotlist) notFound();

  return (
    <ShotlistEditor
      id={shotlist.id}
      heading="Edit Shotlist"
      initialTitle={shotlist.title}
      initialRows={shotlist.rows.map((r) => cleanRow({ ...r, kind: r.kind as RowKind }))}
      initialScript={shotlist.script}
    />
  );
}
