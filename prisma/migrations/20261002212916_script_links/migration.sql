-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotlistId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "doc" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Script_shotlistId_fkey" FOREIGN KEY ("shotlistId") REFERENCES "Shotlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Script" ("data", "fileName", "id", "shotlistId", "size", "uploadedAt") SELECT "data", "fileName", "id", "shotlistId", "size", "uploadedAt" FROM "Script";
DROP TABLE "Script";
ALTER TABLE "new_Script" RENAME TO "Script";
CREATE UNIQUE INDEX "Script_shotlistId_key" ON "Script"("shotlistId");
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
    "scriptLink" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ShotlistRow_shotlistId_fkey" FOREIGN KEY ("shotlistId") REFERENCES "Shotlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShotlistRow" ("angle", "characters", "description", "framing", "id", "intExt", "kind", "location", "position", "sceneNumber", "shotlistId", "subject", "time") SELECT "angle", "characters", "description", "framing", "id", "intExt", "kind", "location", "position", "sceneNumber", "shotlistId", "subject", "time" FROM "ShotlistRow";
DROP TABLE "ShotlistRow";
ALTER TABLE "new_ShotlistRow" RENAME TO "ShotlistRow";
CREATE UNIQUE INDEX "ShotlistRow_shotlistId_position_key" ON "ShotlistRow"("shotlistId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
