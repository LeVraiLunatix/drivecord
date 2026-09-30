-- AlterTable
ALTER TABLE "DriveFile" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- AlterTable
ALTER TABLE "UploadChunk" ADD COLUMN     "sha256" TEXT;

