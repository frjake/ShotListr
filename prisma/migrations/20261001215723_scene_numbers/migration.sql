-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShotlistRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sceneNumber" TEXT NOT NULL DEFAULT '',
    "intExt" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "time" TEXT NOT NULL DEFAULT '',
    "characters" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "framing" TEXT NOT NULL DEFAULT '',
    "angle" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ShotlistRow_shotlistId_fkey" FOREIGN KEY ("shotlistId") REFERENCES "Shotlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShotlistRow" ("angle", "characters", "description", "framing", "id", "intExt", "kind", "location", "position", "shotlistId", "subject", "time") SELECT "angle", "characters", "description", "framing", "id", "intExt", "kind", "location", "position", "shotlistId", "subject", "time" FROM "ShotlistRow";
DROP TABLE "ShotlistRow";
ALTER TABLE "new_ShotlistRow" RENAME TO "ShotlistRow";
CREATE UNIQUE INDEX "ShotlistRow_shotlistId_position_key" ON "ShotlistRow"("shotlistId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: existing scenes get 1, 2, 3… in row order (what was shown before numbers were stored).
UPDATE "ShotlistRow"
SET "sceneNumber" = CAST((
  SELECT COUNT(*) FROM "ShotlistRow" AS earlier
  WHERE earlier."shotlistId" = "ShotlistRow"."shotlistId"
    AND earlier."kind" = 'SCENE'
    AND earlier."position" <= "ShotlistRow"."position"
) AS TEXT)
WHERE "kind" = 'SCENE';
