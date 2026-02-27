import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { User, UserDocument } from './db.js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

const client = new OAuth2Client(GOOGLE_CLIENT_ID)

export interface AuthUser {
  id: string
  googleId: string
  email: string
  name: string
  picture?: string
}

// Verify Google ID token
export async function verifyGoogleToken(idToken: string): Promise<{ email: string; name: string; picture?: string; googleId: string } | null> {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    })
    
    const payload = ticket.getPayload()
    if (!payload) return null
    
    return {
      email: payload.email || '',
      name: payload.name || '',
      picture: payload.picture,
      googleId: payload.sub
    }
  } catch (error) {
    console.error('Google token verification failed:', error)
    return null
  }
}

// Create or update user from Google login
export async function loginWithGoogle(idToken: string): Promise<{ user: AuthUser; token: string } | null> {
  const googleUser = await verifyGoogleToken(idToken)
  if (!googleUser) return null
  
  let user = await User.findOne({ googleId: googleUser.googleId })
  
  if (user) {
    // Update existing user
    user.name = googleUser.name
    user.picture = googleUser.picture
    user.lastLogin = new Date()
    await user.save()
  } else {
    // Create new user
    user = await User.create({
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture
    })
  }
  
  // Generate JWT
  const token = jwt.sign(
    { userId: user._id, googleId: user.googleId },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
  
  return {
    user: {
      id: user._id.toString(),
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture || undefined
    },
    token
  }
}

// Verify JWT token
export function verifyToken(token: string): { userId: string; googleId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; googleId: string }
  } catch {
    return null
  }
}

// Get user by ID
export async function getUserById(userId: string): Promise<UserDocument | null> {
  return User.findById(userId)
}

// Get user by Google ID
export async function getUserByGoogleId(googleId: string): Promise<UserDocument | null> {
  return User.findOne({ googleId })
}

// Update user stats after game
export async function updateUserStats(
  userId: string,
  stats: {
    gameMode: string
    roundsPlayed: number
    finalPosition: number
    score: number
    wordsSubmitted: number
    isWin: boolean
  }
) {
  const user = await User.findById(userId)
  if (!user) return
  
  user.totalGamesPlayed += 1
  user.totalScore += stats.score
  if (stats.isWin) user.totalWins += 1
  if (stats.score > user.highestRoundScore) user.highestRoundScore = stats.score
  
  user.gameHistory.unshift({
    gameMode: stats.gameMode,
    roundsPlayed: stats.roundsPlayed,
    finalPosition: stats.finalPosition,
    score: stats.score,
    wordsSubmitted: stats.wordsSubmitted
  })
  
  // Keep only last 50 games
  if (user.gameHistory.length > 50) {
    user.gameHistory.splice(50)
  }
  
  await user.save()
  return user
}

// Friend system with database
export async function sendFriendRequest(userId: string, friendId: string) {
  if (userId === friendId) return { error: 'Cannot add yourself' }
  
  const user = await User.findById(userId)
  const friend = await User.findById(friendId)
  
  if (!user || !friend) return { error: 'User not found' }
  
  // Check if already friends
  if (user.friends.includes(friend._id)) {
    return { error: 'Already friends' }
  }
  
  // Check if already sent request
  if (user.sentRequests.includes(friend._id)) {
    return { error: 'Request already sent' }
  }
  
  // Check if they sent us a request
  if (user.friendRequests.includes(friend._id)) {
    // Accept the request
    user.friendRequests = user.friendRequests.filter(id => !id.equals(friend._id))
    friend.sentRequests = friend.sentRequests.filter(id => !id.equals(user._id))
    user.friends.push(friend._id)
    friend.friends.push(user._id)
    await user.save()
    await friend.save()
    return { success: true, status: 'accepted' }
  }
  
  // Send new request
  user.sentRequests.push(friend._id)
  friend.friendRequests.push(user._id)
  await user.save()
  await friend.save()
  
  return { success: true, status: 'pending' }
}

export async function acceptFriendRequest(userId: string, friendId: string) {
  const user = await User.findById(userId)
  const friend = await User.findById(friendId)
  
  if (!user || !friend) return { error: 'User not found' }
  
  if (!user.friendRequests.includes(friend._id)) {
    return { error: 'No pending request' }
  }
  
  user.friendRequests = user.friendRequests.filter(id => !id.equals(friend._id))
  friend.sentRequests = friend.sentRequests.filter(id => !id.equals(user._id))
  user.friends.push(friend._id)
  friend.friends.push(user._id)
  
  await user.save()
  await friend.save()
  
  return { success: true }
}

export async function rejectFriendRequest(userId: string, friendId: string) {
  const user = await User.findById(userId)
  const friend = await User.findById(friendId)
  
  if (!user || !friend) return { error: 'User not found' }
  
  user.friendRequests = user.friendRequests.filter(id => !id.equals(friend._id))
  friend.sentRequests = friend.sentRequests.filter(id => !id.equals(user._id))
  
  await user.save()
  await friend.save()
  
  return { success: true }
}

export async function removeFriend(userId: string, friendId: string) {
  const user = await User.findById(userId)
  const friend = await User.findById(friendId)
  
  if (!user || !friend) return { error: 'User not found' }
  
  user.friends = user.friends.filter(id => !id.equals(friend._id))
  friend.friends = friend.friends.filter(id => !id.equals(user._id))
  
  await user.save()
  await friend.save()
  
  return { success: true }
}

export async function getFriends(userId: string) {
  const user = await User.findById(userId).populate('friends', 'name picture email')
  if (!user) return []
  
  return user.friends.map((f: any) => ({
    id: f._id.toString(),
    name: f.name,
    picture: f.picture,
    email: f.email
  }))
}

export async function searchUsers(query: string, excludeUserId: string) {
  const users = await User.find({
    $and: [
      { _id: { $ne: excludeUserId } },
      {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      }
    ]
  }).limit(10)
  
  return users.map(u => ({
    id: u._id.toString(),
    name: u.name,
    picture: u.picture,
    email: u.email
  }))
}
