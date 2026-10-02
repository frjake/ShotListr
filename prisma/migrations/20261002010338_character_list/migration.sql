-- CreateTable
CREATE TABLE "ShotlistCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "ShotlistCharacter_shotlistId_fkey" FOREIGN KEY ("shotlistId") REFERENCES "Shotlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShotlistCharacter_shotlistId_position_key" ON "ShotlistCharacter"("shotlistId", "position");
