-- CreateTable
CREATE TABLE "Shotlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shotlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShotlistRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "Shotlist_userId_idx" ON "Shotlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShotlistRow_shotlistId_position_key" ON "ShotlistRow"("shotlistId", "position");
