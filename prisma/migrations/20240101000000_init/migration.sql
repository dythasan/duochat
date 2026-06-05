-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE');

-- CreateTable
CREATE TABLE "duochat_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duochat_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duochat_messages" (
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

-- CreateIndex
CREATE UNIQUE INDEX "duochat_users_username_key" ON "duochat_users"("username");

-- AddForeignKey
ALTER TABLE "duochat_messages" ADD CONSTRAINT "duochat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "duochat_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duochat_messages" ADD CONSTRAINT "duochat_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "duochat_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
