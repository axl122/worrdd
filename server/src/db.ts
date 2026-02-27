import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/worrdd'

export async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

// User Schema
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  picture: { type: String },
  
  // Friends
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Stats
  totalGamesPlayed: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  highestRoundScore: { type: Number, default: 0 },
  
  // Game History (last 50 games)
  gameHistory: [{
    date: { type: Date, default: Date.now },
    gameMode: String,
    roundsPlayed: Number,
    finalPosition: Number,
    score: Number,
    wordsSubmitted: Number
  }],
  
  // Achievements
  achievements: [{
    id: String,
    unlockedAt: { type: Date, default: Date.now }
  }],
  
  // Settings
  settings: {
    darkMode: { type: Boolean, default: false },
    soundEnabled: { type: Boolean, default: true }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
})

export const User = mongoose.model('User', userSchema)

export type UserDocument = mongoose.Document & {
  googleId: string
  email: string
  name: string
  picture?: string
  friends: string[]
  friendRequests: string[]
  sentRequests: string[]
  totalGamesPlayed: number
  totalWins: number
  totalScore: number
  highestRoundScore: number
  gameHistory: any[]
  achievements: any[]
  settings: {
    darkMode: boolean
    soundEnabled: boolean
  }
  createdAt: Date
  lastLogin: Date
}
