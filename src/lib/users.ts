import bcrypt from 'bcryptjs'

export const USERS = [
  {
    id: 'user-hasan-001',
    username: 'hasan',
    password: 'hasan123',
  },
  {
    id: 'user-partner-002',
    username: 'partner',
    password: 'partner123',
  },
]

export async function validateUser(username: string, password: string) {
  const user = USERS.find((u) => u.username === username)
  if (!user) return null
  if (user.password === password) {
    return { id: user.id, username: user.username }
  }
  return null
}

export function getOtherUser(username: string) {
  return USERS.find((u) => u.username !== username) || null
}
