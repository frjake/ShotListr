-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotlistId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Script_shotlistId_fkey" FOREIGN KEY ("shotlistId") REFERENCES "Shotlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Script_shotlistId_key" ON "Script"("shotlistId");
