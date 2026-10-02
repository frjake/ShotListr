import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShotlistEditor } from "@/components/ShotlistEditor";
import { getCurrentUser, requireUser } from "@/lib/auth";
import type { RowKind } from "@/lib/constants";
import { cleanRow } from "@/lib/rows";
import { readSceneLink, readShotLink, reanchorRows } from "@/lib/scriptLinks";
import { getOwnedShotlist } from "@/lib/shotlists";
import { storedScriptText } from "@/lib/scriptStore";

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

  // Links made against an earlier draft of the script (e.g. replaced, then left without saving) are
  // found again in the current one before the editor sees them; the next save keeps the result.
  let rows = shotlist.rows.map((r) => cleanRow({ ...r, kind: r.kind as RowKind }));
  if (shotlist.script) {
    const stale = rows.some((r) => {
      const link = readSceneLink(r.scriptLink) ?? readShotLink(r.scriptLink);
      return link && link.v !== shotlist.script!.version;
    });
    const text = stale ? await storedScriptText(shotlist.id, user.id) : null;
    if (text) rows = reanchorRows(rows, text.doc, text.version).rows;
  }

  return (
    <ShotlistEditor
      id={shotlist.id}
      heading="Edit Shotlist"
      initialTitle={shotlist.title}
      initialRows={rows}
      initialScript={shotlist.script && { fileName: shotlist.script.fileName, size: shotlist.script.size }}
      initialCharacters={shotlist.characters.map((c) => c.name)}
    />
  );
}
