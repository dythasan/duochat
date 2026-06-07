const { Client } = require('pg')

const sql = `
-- CreateTable duochat_push_subscriptions
CREATE TABLE IF NOT EXISTS "duochat_push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duochat_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "duochat_push_subscriptions_endpoint_key" ON "duochat_push_subscriptions"("endpoint");

-- AddForeignKey (if not exists)
DO $$ BEGIN
  ALTER TABLE "duochat_push_subscriptions" ADD CONSTRAINT "duochat_push_subscriptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "duochat_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('Connected to database')
  await client.query(sql)
  console.log('Push subscriptions table created successfully')
  await client.end()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
