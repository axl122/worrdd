import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { loadDictionary, loadSourceWords } from './words.js'
import * as rooms from './rooms.js'
import * as friends from './friends.js'
import { connectDB } from './db.js'
import * as auth from './auth.js'
import type { 
  RoomStateEvent, 
  RoundStartEvent, 
  WordResultEvent,
  RoundEndEvent,
  GameEndEvent,
  GameStateEvent
} from './types.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
})

const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Auth endpoints
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body
    const result = await auth.loginWithGoogle(idToken)
    
    if (!result) {
      return res.status(401).json({ error: 'Invalid Google token' })
    }
    
    // Set HTTP-only cookie
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })
    
    res.json({ user: result.user })
  } catch (error) {
    console.error('Google auth error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const decoded = auth.verifyToken(token)
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    
    const user = await auth.getUserById(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    
    res.json({
      user: {
        id: user._id.toString(),
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        totalGamesPlayed: user.totalGamesPlayed,
        totalWins: user.totalWins,
        totalScore: user.totalScore,
        highestRoundScore: user.highestRoundScore
      }
    })
  } catch (error) {
    console.error('Auth check error:', error)
    res.status(500).json({ error: 'Failed to verify authentication' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ success: true })
})

// User search endpoint
app.get('/api/users/search', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const { q } = req.query
    if (!q || typeof q !== 'string') {
      return res.json([])
    }
    
    const users = await auth.searchUsers(q, decoded.userId)
    res.json(users)
  } catch (error) {
    console.error('User search error:', error)
    res.status(500).json({ error: 'Search failed' })
  }
})

// Friend endpoints
app.get('/api/friends', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const friends = await auth.getFriends(decoded.userId)
    res.json(friends)
  } catch (error) {
    console.error('Get friends error:', error)
    res.status(500).json({ error: 'Failed to get friends' })
  }
})

app.post('/api/friends/request', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const { friendId } = req.body
    const result = await auth.sendFriendRequest(decoded.userId, friendId)
    res.json(result)
  } catch (error) {
    console.error('Friend request error:', error)
    res.status(500).json({ error: 'Failed to send friend request' })
  }
})

app.post('/api/friends/accept', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const { friendId } = req.body
    const result = await auth.acceptFriendRequest(decoded.userId, friendId)
    res.json(result)
  } catch (error) {
    console.error('Accept friend error:', error)
    res.status(500).json({ error: 'Failed to accept friend request' })
  }
})

app.post('/api/friends/reject', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const { friendId } = req.body
    const result = await auth.rejectFriendRequest(decoded.userId, friendId)
    res.json(result)
  } catch (error) {
    console.error('Reject friend error:', error)
    res.status(500).json({ error: 'Failed to reject friend request' })
  }
})

app.post('/api/friends/remove', async (req, res) => {
  try {
    const token = req.cookies.token
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    
    const decoded = auth.verifyToken(token)
    if (!decoded) return res.status(401).json({ error: 'Invalid token' })
    
    const { friendId } = req.body
    const result = await auth.removeFriend(decoded.userId, friendId)
    res.json(result)
  } catch (error) {
    console.error('Remove friend error:', error)
    res.status(500).json({ error: 'Failed to remove friend' })
  }
})

// Load dictionaries on startup
loadDictionary()
loadSourceWords

// Initialize friends module with IO
friends.setIO(io)

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  
  // ==================== NETWORK EVENTS ====================
  
  // Ping for latency measurement
  socket.on('ping', () => {
    socket.emit('pong')
  })
  
  // ==================== ROOM EVENTS ====================
  
  // Create room
  socket.on('room:create', (data: { name: string }) => {
    // Register player for friends system (creates permanent ID)
    const { playerId } = friends.registerPlayer(socket, data.name)
    
    // Pass permanent playerId to createRoom
    const result = rooms.createRoom(data.name, socket.id, playerId)
    
    const roomState: RoomStateEvent = {
      roomCode: result.room.roomCode,
      hostPlayerId: result.playerId,
      players: Array.from(result.room.players.values()),
      settings: result.room.settings,
      phase: result.room.phase
    }
    
    socket.join(result.room.roomCode)
    socket.emit('room:state', roomState)
    socket.emit('player:id', playerId) // Send permanent player ID to client
    
    console.log(`Room ${result.room.roomCode} created by ${data.name}`)
  })
  
  // Join room
  socket.on('room:join', (data: { roomCode: string; name: string }) => {
    // Register player for friends system (creates permanent ID)
    const { playerId } = friends.registerPlayer(socket, data.name)
    
    const result = rooms.joinRoom(data.roomCode, data.name, socket.id, playerId)
    
    if ('error' in result) {
      socket.emit('error', { message: result.error })
      return
    }
    
    const roomState: RoomStateEvent = {
      roomCode: result.room.roomCode,
      hostPlayerId: result.room.hostPlayerId || null,
      players: Array.from(result.room.players.values()),
      settings: result.room.settings,
      phase: result.room.phase
    }
    
    socket.join(result.room.roomCode)
    socket.emit('room:state', roomState)
    socket.emit('player:id', playerId) // Send permanent player ID to client
    
    // Broadcast updated player list to all in room
    io.to(result.room.roomCode).emit('room:state', roomState)
    
    console.log(`${data.name} joined room ${data.roomCode}`)
  })
  
  // Update settings (host only)
  socket.on('room:updateSettings', (data: { rounds?: number; roundSeconds?: number; minLen?: number; fullBonusEnabled?: boolean; gameMode?: 'classic' | 'guess' | 'scramble' }) => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const newSettings = rooms.updateSettings(room.roomCode, playerId, data)
    if (newSettings) {
      const roomState: RoomStateEvent = {
        roomCode: room.roomCode,
        hostPlayerId: room.hostPlayerId,
        players: Array.from(room.players.values()),
        settings: newSettings,
        phase: room.phase
      }
      io.to(room.roomCode).emit('room:state', roomState)
    }
  })
  
  // Toggle player ready status
  socket.on('player:toggleReady', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const isReady = rooms.togglePlayerReady(room.roomCode, playerId)
    if (isReady === null) return
    
    const roomState: RoomStateEvent = {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: Array.from(room.players.values()),
      settings: room.settings,
      phase: room.phase
    }
    
    io.to(room.roomCode).emit('room:state', roomState)
  })
  
  // Transfer host to another player
  socket.on('room:transferHost', (data: { newHostId: string }) => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get the permanent player ID from friends system
    const playerId = friends.getPlayerId(socket.id)
    if (!playerId) {
      socket.emit('error', { message: 'Player not found' })
      return
    }
    
    const result = rooms.transferHost(room.roomCode, playerId, data.newHostId)
    if (!result.success) {
      socket.emit('error', { message: result.error || 'Failed to transfer host' })
      return
    }
    
    // Broadcast updated room state
    const roomState: RoomStateEvent = {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: Array.from(room.players.values()),
      settings: room.settings,
      phase: room.phase
    }
    
    io.to(room.roomCode).emit('room:state', roomState)
    console.log(`Host transferred to ${data.newHostId} in room ${room.roomCode}`)
  })
  
  // Leave room
  socket.on('room:leave', () => {
    const roomCode = Array.from(socket.rooms)[1] || ''
    if (!roomCode) return
    
    const room = rooms.getRoom(roomCode)
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    
    // Remove player from room
    const result = rooms.removePlayer(roomCode, playerId)
    socket.leave(roomCode)
    
    if (!result.roomEmpty) {
      // Broadcast updated state
      const roomState: RoomStateEvent = {
        roomCode: room.roomCode,
        hostPlayerId: room.hostPlayerId,
        players: Array.from(room.players.values()),
        settings: room.settings,
        phase: room.phase
      }
      io.to(roomCode).emit('room:state', roomState)
      
      if (result.newHostId) {
        console.log(`New host in room ${roomCode}: ${result.newHostId}`)
      }
    }
    
    // Clear player's room state
    socket.emit('room:left')
    console.log(`Player ${playerId} left room ${roomCode}`)
  })
  
  // Use power-up
  socket.on('powerup:use', (data: { type: 'freeze' | 'burn' }) => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const result = rooms.usePowerUp(room.roomCode, playerId, data.type)
    
    if (!result.success) {
      socket.emit('error', { message: 'Cannot use power-up' })
      return
    }
    
    const player = room.players.get(playerId)
    
    if (data.type === 'freeze') {
      // Broadcast freeze to all players
      io.to(room.roomCode).emit('powerup:freeze', {
        usedBy: player?.name || 'Unknown'
      })
    } else if (data.type === 'burn' && result.targetPlayerId) {
      // Broadcast burn to all players
      const target = room.players.get(result.targetPlayerId)
      io.to(room.roomCode).emit('powerup:burn', {
        usedBy: player?.name || 'Unknown',
        targetPlayer: target?.name || 'Unknown',
        pointsLost: result.pointsLost
      })
      
      // Update room state with new scores
      const roomState: RoomStateEvent = {
        roomCode: room.roomCode,
        hostPlayerId: room.hostPlayerId,
        players: Array.from(room.players.values()),
        settings: room.settings,
        phase: room.phase
      }
      io.to(room.roomCode).emit('room:state', roomState)
    }
  })
  
  // ==================== GAME EVENTS ====================
  
  // Start game
  socket.on('game:start', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Emit countdown first
    io.to(room.roomCode).emit('game:countdown', { count: 3 })
    
    // Countdown: 3... 2... 1... GO!
    setTimeout(() => {
      io.to(room.roomCode).emit('game:countdown', { count: 2 })
    }, 1000)
    
    setTimeout(() => {
      io.to(room.roomCode).emit('game:countdown', { count: 1 })
    }, 2000)
    
    setTimeout(() => {
      io.to(room.roomCode).emit('game:countdown', { count: 0 }) // GO!
      
      // Get permanent player ID from socket ID
      const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
      const result = rooms.startGame(room.roomCode, playerId)
      
      if ('error' in result) {
        socket.emit('error', { message: result.error })
        return
      }
      
      const roundStart: RoundStartEvent = {
        roundIndex: result.roundIndex,
        sourceWord: result.sourceWord,
        startedAt: result.startedAt,
        endsAt: result.endsAt,
        gameMode: result.gameMode,
        puzzle: result.puzzle,
        hint: result.hint,
        scrambledWord: result.scrambledWord,
        riddle: result.riddle
      }
      
      const gameState: GameStateEvent = {
        phase: 'round',
        roundIndex: result.roundIndex,
        totalRounds: room.settings.rounds,
        scoresByPlayerId: Object.fromEntries(result.scoresByPlayerId)
      }
      
      io.to(room.roomCode).emit('game:state', gameState)
      io.to(room.roomCode).emit('round:start', roundStart)
      
      console.log(`Game started in room ${room.roomCode}, source word: ${result.sourceWord}`)
    }, 3000)
  })
  
  // Submit word
  socket.on('word:submit', async (data: { word: string }) => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const result = await rooms.submitWordAsync(room.roomCode, playerId, data.word)
    
    const wordResult: WordResultEvent = {
      ok: result.ok,
      word: data.word.toLowerCase(),
      reason: result.reason as any,
      pointsAwarded: result.pointsAwarded,
      playerId: playerId,
      newTotalScore: result.newTotalScore,
      usedWordsCount: result.usedWordsCount
    }
    
    socket.emit('word:result', wordResult)
    
    // Broadcast word to all players for live feed
    if (result.ok && result.usedWordsCount) {
      const player = room.players.get(playerId)
      io.to(room.roomCode).emit('word:claimed', { 
        word: data.word.toLowerCase(),
        usedWordsCount: result.usedWordsCount,
        playerId: playerId,
        playerName: player?.name || 'Unknown',
        points: result.pointsAwarded
      })
      
      // Emit power-up awarded event
      if (result.powerUpAwarded) {
        socket.emit('powerup:awarded', {
          type: result.powerUpAwarded.type,
          reason: result.powerUpAwarded.reason,
          totalPowerUps: player?.powerUps
        })
      }
    }
    
    // If solved in guess/scramble/teaser mode, end round immediately
    if (result.solved) {
      const player = room.players.get(playerId)
      
      // Broadcast solve to all players
      io.to(room.roomCode).emit('word:solved', {
        word: result.correctAnswer,
        playerId: playerId,
        playerName: player?.name || 'Unknown',
        points: result.pointsAwarded
      })
      
      // End the round after a short delay
      setTimeout(() => {
        const endResult = rooms.endRound(room.roomCode)
        if (!endResult) return
        
        if (endResult.isGameOver && endResult.finalState) {
          const gameEnd: GameEndEvent = endResult.finalState
          io.to(room.roomCode).emit('game:end', gameEnd)
          console.log(`Game ended in room ${room.roomCode}`)
        } else {
          const roundEnd: RoundEndEvent = rooms.getRoundEndState(room.roomCode)!
          io.to(room.roomCode).emit('round:end', roundEnd)
          console.log(`Round ${roundEnd.roundIndex} ended (solved by ${player?.name})`)
        }
      }, 1500) // 1.5 second delay to show the solve
    }
  })
  
  // End round (timer or manual)
  socket.on('round:end', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    const result = rooms.endRound(room.roomCode)
    if (!result) return
    
    // If game is over, emit game:end directly
    if (result.isGameOver && result.finalState) {
      const gameEnd: GameEndEvent = result.finalState
      io.to(room.roomCode).emit('game:end', gameEnd)
      console.log(`Game ended in room ${room.roomCode}`)
      return
    }
    
    // Otherwise emit round:end for intermediate rounds
    const roundEnd: RoundEndEvent = rooms.getRoundEndState(room.roomCode)!
    io.to(room.roomCode).emit('round:end', roundEnd)
    console.log(`Round ${roundEnd.roundIndex} ended in room ${room.roomCode}`)
  })
  
  // Player ready for next round
  socket.on('player:ready', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const player = room.players.get(playerId)
    if (!player) return
    
    // Broadcast ready status to all players
    io.to(room.roomCode).emit('player:ready', {
      playerId: playerId,
      playerName: player.name
    })
    
    // Check if all connected players are ready
    const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected)
    // We'll track ready state on client side for simplicity
    
    console.log(`Player ${player.name} is ready in room ${room.roomCode}`)
  })
  
  // Start next round (when all players ready - triggered from client)
  socket.on('round:next', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Start countdown
    let count = 3
    io.to(room.roomCode).emit('game:countdown', { count })
    
    const countdownInterval = setInterval(() => {
      count--
      if (count > 0) {
        io.to(room.roomCode).emit('game:countdown', { count })
      } else {
        clearInterval(countdownInterval)
        
        // Start the round
        const result = rooms.nextRound(room.roomCode)
        if (!result) return
        
        if (result.type === 'game_over') {
          const gameEnd: GameEndEvent = result.finalState
          io.to(room.roomCode).emit('game:end', gameEnd)
          console.log(`Game ended in room ${room.roomCode}`)
        } else {
          const roundStart: RoundStartEvent = {
            roundIndex: result.roundState.roundIndex,
            sourceWord: result.roundState.sourceWord,
            startedAt: result.roundState.startedAt,
            endsAt: result.roundState.endsAt,
            gameMode: result.roundState.gameMode,
            puzzle: result.roundState.puzzle,
            hint: result.roundState.hint,
            scrambledWord: result.roundState.scrambledWord,
            riddle: result.roundState.riddle
          }
          
          const gameState: GameStateEvent = {
            phase: 'round',
            roundIndex: result.roundState.roundIndex,
            totalRounds: room.settings.rounds,
            scoresByPlayerId: Object.fromEntries(result.roundState.scoresByPlayerId)
          }
          
          io.to(room.roomCode).emit('game:state', gameState)
          io.to(room.roomCode).emit('round:start', roundStart)
          
          console.log(`Round ${result.roundState.roundIndex} started in room ${room.roomCode}, source: ${result.roundState.sourceWord}`)
        }
      }
    }, 1000)
  })
  
  // Play again
  socket.on('game:playAgain', () => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    rooms.playAgain(room.roomCode)
    
    const roomState: RoomStateEvent = {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: Array.from(room.players.values()),
      settings: room.settings,
      phase: 'lobby'
    }
    
    io.to(room.roomCode).emit('room:state', roomState)
    console.log(`Play again in room ${room.roomCode}`)
  })

  // ==================== CHAT EVENTS ====================
  
  // Send chat message
  socket.on('chat:send', (data: { message: string }) => {
    const room = rooms.getRoom(Array.from(socket.rooms)[1] || '')
    if (!room) return
    
    // Get permanent player ID from socket ID
    const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
    const player = room.players.get(playerId)
    if (!player) return
    
    const chatMessage = {
      id: `${Date.now()}-${playerId}`,
      playerId: playerId,
      playerName: player.name,
      message: data.message.trim().slice(0, 200),
      timestamp: Date.now()
    }
    
    // Broadcast to all players in room
    io.to(room.roomCode).emit('chat:message', chatMessage)
  })
  
  // ==================== FRIEND EVENTS ====================
  
  friends.setupFriendHandlers(socket)
  
  // ==================== DISCONNECT ====================
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    
    // Unregister from friends system
    friends.unregisterPlayer(socket)
    
    // Find rooms this socket was in
    for (const roomCode of socket.rooms) {
      if (roomCode === socket.id) continue
      
      // Get permanent player ID from socket ID
      const playerId = friends.getPlayerIdBySocket(socket.id) || socket.id
      rooms.setPlayerConnected(roomCode, playerId, false)
      
      const room = rooms.getRoom(roomCode)
      if (room) {
        const result = rooms.removePlayer(roomCode, playerId)
        
        if (result.roomEmpty) {
          console.log(`Room ${roomCode} is now empty`)
        } else {
          // Broadcast updated state
          const roomState: RoomStateEvent = {
            roomCode: room.roomCode,
            hostPlayerId: room.hostPlayerId,
            players: Array.from(room.players.values()),
            settings: room.settings,
            phase: room.phase
          }
          io.to(roomCode).emit('room:state', roomState)
          
          if (result.newHostId) {
            console.log(`New host in room ${roomCode}: ${result.newHostId}`)
          }
        }
      }
    }
  })
})

// Start server
async function startServer() {
  // Connect to MongoDB
  await connectDB()
  
  httpServer.listen(PORT, () => {
    console.log(`WORRDD server running on port ${PORT}`)
    console.log(`CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`)
  })
}

startServer().catch(console.error)
