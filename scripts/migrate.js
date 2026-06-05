const { Client } = require('pg')

const sql = `
-- CreateEnum (if not exists)
DO $$ BEGIN
  CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable duochat_users
CREATE TABLE IF NOT EXISTS "duochat_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duochat_users_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "duochat_users_username_key" ON "duochat_users"("username");

-- CreateTable duochat_messages
CREATE TABLE IF NOT EXISTS "duochat_messages" (
    "id" TEXT NOT NULL,
    "content" TEXT,
    "imageData" TEXT,
    "imageType" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,

    CONSTRAINT "duochat_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKeys (if not exists)
DO $$ BEGIN
  ALTER TABLE "duochat_messages" ADD CONSTRAINT "duochat_messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "duochat_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "duochat_messages" ADD CONSTRAINT "duochat_messages_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "duochat_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Insert hardcoded users
INSERT INTO "duochat_users" ("id", "username", "password") VALUES
  ('user-hasan-001', 'hasan', 'hasan123'),
  ('user-partner-002', 'partner', 'partner123')
ON CONFLICT ("id") DO NOTHING;
`

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('Connected to database')
  await client.query(sql)
  console.log('Tables created successfully')
  await client.end()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
