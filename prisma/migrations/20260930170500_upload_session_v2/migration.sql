-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "cipherSize" BIGINT,
ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

