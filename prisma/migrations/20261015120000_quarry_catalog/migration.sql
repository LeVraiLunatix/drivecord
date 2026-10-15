-- CreateTable
CREATE TABLE "CatalogProject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "iconToken" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT 'release',
    "gameVersions" TEXT[],
    "loaders" TEXT[],
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'published',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogFile" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha1" TEXT NOT NULL,
    "sha512" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CatalogFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProject_slug_key" ON "CatalogProject"("slug");

-- CreateIndex
CREATE INDEX "CatalogProject_status_projectType_idx" ON "CatalogProject"("status", "projectType");

-- CreateIndex
CREATE INDEX "CatalogProject_status_downloads_idx" ON "CatalogProject"("status", "downloads");

-- CreateIndex
CREATE INDEX "CatalogProject_ownerId_idx" ON "CatalogProject"("ownerId");

-- CreateIndex
CREATE INDEX "CatalogVersion_projectId_status_idx" ON "CatalogVersion"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVersion_projectId_versionNumber_key" ON "CatalogVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "CatalogFile_versionId_idx" ON "CatalogFile"("versionId");

-- CreateIndex
CREATE INDEX "CatalogFile_shareToken_idx" ON "CatalogFile"("shareToken");

-- AddForeignKey
ALTER TABLE "CatalogVersion" ADD CONSTRAINT "CatalogVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CatalogProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogFile" ADD CONSTRAINT "CatalogFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
