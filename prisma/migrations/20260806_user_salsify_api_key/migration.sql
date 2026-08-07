-- Salsify API keys are per-user; the global key on SalsifyConfig is retained
-- but no longer read.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "salsifyApiKey" TEXT;
ALTER TABLE "SalsifyConfig" ALTER COLUMN "apiKey" SET DEFAULT '';
