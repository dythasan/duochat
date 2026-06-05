import { NextRequest, NextResponse } from 'next/server'
import { validateUser } from '@/lib/users'
import { signToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { USERS } from '@/lib/users'

// Ensure users exist in DB
async function ensureUsersExist() {
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        username: user.username,
        password: user.password,
      },
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const user = await validateUser(username, password)
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Ensure both users exist in DB
    await ensureUsersExist()

    const token = signToken({ userId: user.id, username: user.username })

    return NextResponse.json({
      token,
      user: { id: user.id, username: user.username },
    })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
