-- Multiple photos per announcement (albums)
ALTER TABLE "submissions" ADD COLUMN "photo_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "submissions" SET "photo_file_ids" = ARRAY["photo_file_id"] WHERE "photo_file_id" IS NOT NULL;
UPDATE "submissions" SET "photo_file_ids" = ARRAY[]::TEXT[] WHERE "photo_file_ids" IS NULL;
ALTER TABLE "submissions" ALTER COLUMN "photo_file_ids" SET NOT NULL;
ALTER TABLE "submissions" DROP COLUMN "photo_file_id";
