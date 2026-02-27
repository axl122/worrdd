import type { Socket } from 'socket.io'
import type { Friend, Message, FriendState } from './types.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Persistent storage file paths
const DATA_DIR = path.join(__dirname, '../data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json')
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json')

// User profile with permanent ID
interface UserProfile {
  id: string // Permanent UUID
  name: string
  createdAt: number
  lastSeen: number
}

// One-time friend code
interface FriendCode {
  code: string
  creatorId: string
  creatorName: string
  createdAt: number
  expiresAt: number
}

// Pending game invite
interface PendingGame {
  hostId: string
  hostName: string
  hostSocketId: string
  friendId: string
  friendName: string
  friendSocketId: string
  roomCode: string
  createdAt: number
}

// In-memory caches (loaded from files)
let usersCache = new Map<string, UserProfile>() // id -> profile
let nameToIdCache = new Map<string, string>() // name -> id (for quick lookup)
let friendsCache = new Map<string, FriendState>() // id -> friend state
let messagesCache = new Map<string, Message[]>() // "id1-id2" -> messages

// One-time codes (in-memory, expire after 10 minutes)
const friendCodes = new Map<string, FriendCode>() // code -> FriendCode

// Pending game invites
const pendingGames = new Map<string, PendingGame>() // roomCode -> PendingGame

// Online tracking (runtime only)
const playerSockets = new Map<string, string>() // playerId -> socketId
const socketPlayers = new Map<string, string>() // socketId -> playerId

// Socket.io server reference
let io: Server | null = null

export function setIO(server: Server) {
  io = server
}

function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized')
  return io
}

// Get permanent player ID from socket ID
export function getPlayerIdBySocket(socketId: string): string | undefined {
  return socketPlayers.get(socketId)
}

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// Load all data from files
function loadData() {
  ensureDataDir()
  
  // Load users
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
      usersCache = new Map(Object.entries(data))
      usersCache.forEach((profile, id) => {
        nameToIdCache.set(profile.name.toLowerCase(), id)
      })
    }
  } catch (e) {
    console.error('Error loading users:', e)
  }
  
  // Load friends
  try {
    if (fs.existsSync(FRIENDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf-8'))
      friendsCache = new Map(Object.entries(data))
    }
  } catch (e) {
    console.error('Error loading friends:', e)
  }
  
  // Load messages
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'))
      messagesCache = new Map(Object.entries(data))
    }
  } catch (e) {
    console.error('Error loading messages:', e)
  }
}

// Save data to files
function saveUsers() {
  ensureDataDir()
  const obj = Object.fromEntries(usersCache)
  fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2))
}

function saveFriends() {
  ensureDataDir()
  const obj = Object.fromEntries(friendsCache)
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(obj, null, 2))
}

function saveMessages() {
  ensureDataDir()
  const obj = Object.fromEntries(messagesCache)
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(obj, null, 2))
}

// Generate a permanent UUID
function generateUUID(): string {
  return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
}

// Generate a one-time friend code (6 characters)
function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Clean up expired codes
function cleanupExpiredCodes() {
  const now = Date.now()
  friendCodes.forEach((code, key) => {
    if (code.expiresAt < now) {
      friendCodes.delete(key)
    }
  })
}

// Get or create friend state
function getFriendState(playerId: string): FriendState {
  if (!friendsCache.has(playerId)) {
    friendsCache.set(playerId, {
      playerId,
      friends: [],
      pendingRequests: []
    })
    saveFriends()
  }
  return friendsCache.get(playerId)!
}

// Get message key for two players
function getMessageKey(id1: string, id2: string): string {
  return [id1, id2].sort().join('-')
}

// Get messages between players
function getMessages(id1: string, id2: string): Message[] {
  const key = getMessageKey(id1, id2)
  if (!messagesCache.has(key)) {
    messagesCache.set(key, [])
  }
  return messagesCache.get(key)!
}

// Register or reconnect a player
export function registerPlayer(socket: Socket, name: string): { playerId: string; isNew: boolean } {
  const normalizedName = name.toLowerCase()
  let isNew = false
  
  // Check if user exists by name
  let playerId = nameToIdCache.get(normalizedName)
  
  if (!playerId) {
    // Create new user with permanent ID
    playerId = generateUUID()
    isNew = true
    
    const profile: UserProfile = {
      id: playerId,
      name,
      createdAt: Date.now(),
      lastSeen: Date.now()
    }
    
    usersCache.set(playerId, profile)
    nameToIdCache.set(normalizedName, playerId)
    saveUsers()
    
    console.log(`Created new user: ${name} (${playerId})`)
  } else {
    // Update last seen
    const profile = usersCache.get(playerId)
    if (profile) {
      profile.lastSeen = Date.now()
      saveUsers()
    }
    console.log(`Reconnecting user: ${name} (${playerId})`)
  }
  
  // Track socket connection
  playerSockets.set(playerId, socket.id)
  socketPlayers.set(socket.id, playerId)
  
  // Notify friends that this player is online
  const friendState = getFriendState(playerId)
  friendState.friends.forEach(friendId => {
    const friendSocketId = playerSockets.get(friendId)
    if (friendSocketId) {
      const profile = usersCache.get(playerId)
      socket.to(friendSocketId).emit('friend:online', { 
        playerId,
        name: profile?.name || 'Unknown'
      })
    }
  })
  
  return { playerId, isNew }
}

// Reconnect a player with existing ID
export function reconnectPlayer(socket: Socket, existingPlayerId: string): { playerId: string; name: string } | null {
  const profile = usersCache.get(existingPlayerId)
  if (!profile) {
    return null
  }
  
  // Track socket connection
  playerSockets.set(existingPlayerId, socket.id)
  socketPlayers.set(socket.id, existingPlayerId)
  
  // Update last seen
  profile.lastSeen = Date.now()
  saveUsers()
  
  console.log(`Reconnected user by ID: ${profile.name} (${existingPlayerId})`)
  
  // Notify friends that this player is online
  const friendState = getFriendState(existingPlayerId)
  friendState.friends.forEach(friendId => {
    const friendSocketId = playerSockets.get(friendId)
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friend:online', { 
        playerId: existingPlayerId,
        name: profile.name
      })
    }
  })
  
  return { playerId: existingPlayerId, name: profile.name }
}

// Unregister a player (on disconnect)
export function unregisterPlayer(socket: Socket) {
  const playerId = socketPlayers.get(socket.id)
  if (!playerId) return
  
  playerSockets.delete(playerId)
  socketPlayers.delete(socket.id)
  
  // Update last seen
  const profile = usersCache.get(playerId)
  if (profile) {
    profile.lastSeen = Date.now()
    saveUsers()
  }
  
  // Notify friends that this player is offline
  const friendState = getFriendState(playerId)
  friendState.friends.forEach(friendId => {
    const friendSocketId = playerSockets.get(friendId)
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friend:offline', { playerId })
    }
  })
}

// Get player ID from socket ID
export function getPlayerId(socketId: string): string | undefined {
  return socketPlayers.get(socketId)
}

// Setup friend event handlers
export function setupFriendHandlers(socket: Socket) {
  // Get or create player ID - allow registration from friends page
  const getOrCreatePlayerId = (name?: string): string => {
    let playerId = socketPlayers.get(socket.id)
    if (playerId) return playerId
    
    // If name provided, register new player
    if (name) {
      const result = registerPlayer(socket, name)
      return result.playerId
    }
    
    return ''
  }
  
  // Reconnect with existing player ID
  socket.on('player:reconnect', (data: { playerId: string }) => {
    const result = reconnectPlayer(socket, data.playerId)
    if (result) {
      socket.emit('player:reconnected', { id: result.playerId, name: result.name })
    } else {
      socket.emit('player:reconnectFailed', { message: 'Player not found' })
    }
  })
  
  // Get current user info
  socket.on('user:get', () => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) {
      socket.emit('user:info', { id: '', name: '' })
      return
    }
    const profile = usersCache.get(playerId)
    socket.emit('user:info', {
      id: playerId,
      name: profile?.name || 'Unknown'
    })
  })
  
  // Get friends list
  socket.on('friends:get', () => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) {
      socket.emit('friends:list', { friends: [] })
      return
    }
    const friendState = getFriendState(playerId)
    const friends: Friend[] = friendState.friends.map(friendId => {
      const profile = usersCache.get(friendId)
      return {
        id: friendId,
        name: profile?.name || 'Unknown',
        online: playerSockets.has(friendId)
      }
    })
    
    socket.emit('friends:list', { friends })
  })
  
  // Generate a one-time friend code
  socket.on('friends:generateCode', (data?: { name?: string }) => {
    cleanupExpiredCodes()
    
    // Register player if needed
    let playerId = socketPlayers.get(socket.id)
    if (!playerId && data?.name) {
      const result = registerPlayer(socket, data.name)
      playerId = result.playerId
    }
    
    if (!playerId) {
      socket.emit('friends:error', { message: 'Please enter your name first' })
      return
    }
    
    const profile = usersCache.get(playerId)
    const code = generateFriendCode()
    
    friendCodes.set(code, {
      code,
      creatorId: playerId,
      creatorName: profile?.name || 'Unknown',
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    })
    
    socket.emit('friends:codeGenerated', { 
      code,
      expiresIn: 600 // seconds
    })
    
    console.log(`Friend code generated: ${code} by ${profile?.name}`)
  })
  
  // Use a friend code to add a friend
  socket.on('friends:useCode', (data: { code: string; yourName: string }) => {
    cleanupExpiredCodes()
    
    // Register player if needed
    let playerId = socketPlayers.get(socket.id)
    if (!playerId && data.yourName) {
      const result = registerPlayer(socket, data.yourName)
      playerId = result.playerId
    }
    
    if (!playerId) {
      socket.emit('friends:error', { message: 'Please enter your name' })
      return
    }
    
    const code = data.code.toUpperCase().trim()
    const friendCode = friendCodes.get(code)
    
    if (!friendCode) {
      socket.emit('friends:error', { message: 'Invalid or expired code' })
      return
    }
    
    if (friendCode.creatorId === playerId) {
      socket.emit('friends:error', { message: 'You cannot use your own code' })
      return
    }
    
    // Get or update user with the provided name
    const profile = usersCache.get(playerId)
    if (profile && data.yourName && data.yourName !== profile.name) {
      // Update name if different
      nameToIdCache.delete(profile.name.toLowerCase())
      profile.name = data.yourName
      nameToIdCache.set(data.yourName.toLowerCase(), playerId)
      saveUsers()
    }
    
    // Add friendship
    const creatorFriendState = getFriendState(friendCode.creatorId)
    const userFriendState = getFriendState(playerId)
    
    // Check if already friends
    if (creatorFriendState.friends.includes(playerId)) {
      socket.emit('friends:error', { message: 'Already friends!' })
      friendCodes.delete(code)
      return
    }
    
    // Add to both friend lists
    creatorFriendState.friends.push(playerId)
    userFriendState.friends.push(friendCode.creatorId)
    saveFriends()
    
    // Delete the used code
    friendCodes.delete(code)
    
    // Get profiles
    const creatorProfile = usersCache.get(friendCode.creatorId)
    const userProfile = usersCache.get(playerId)
    
    // Notify the user who entered the code
    const newFriend: Friend = {
      id: friendCode.creatorId,
      name: creatorProfile?.name || 'Unknown',
      online: playerSockets.has(friendCode.creatorId)
    }
    socket.emit('friends:added', { friend: newFriend })
    
    // Notify the code creator if online
    const creatorSocketId = playerSockets.get(friendCode.creatorId)
    if (creatorSocketId) {
      socket.to(creatorSocketId).emit('friends:added', {
        friend: {
          id: playerId,
          name: userProfile?.name || 'Unknown',
          online: true
        }
      })
    }
    
    console.log(`Friend connection made: ${creatorProfile?.name} <-> ${userProfile?.name}`)
  })
  
  // Remove/delete a friend (keep existing)
  socket.on('friends:remove', (data: { friendId: string }) => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) return
    
    const friendId = data.friendId
    
    const friendState = getFriendState(playerId)
    
    // Check if actually friends
    if (!friendState.friends.includes(friendId)) {
      return
    }
    
    // Remove from both players' friend lists
    friendState.friends = friendState.friends.filter(id => id !== friendId)
    
    const friendFriendState = getFriendState(friendId)
    friendFriendState.friends = friendFriendState.friends.filter(id => id !== playerId)
    
    saveFriends()
    
    // Notify sender
    socket.emit('friends:removed', { friendId })
    
    // Notify the removed friend if online
    const friendSocketId = playerSockets.get(friendId)
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friends:removed', { friendId: playerId })
    }
  })
  
  // Get messages with a friend
  socket.on('messages:get', (data: { friendId: string }) => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) return
    
    const messages = getMessages(playerId, data.friendId)
    socket.emit('messages:list', { messages })
  })
  
  // Send a message to a friend
  socket.on('messages:send', (data: { to: string; text: string }) => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) return
    
    const message: Message = {
      id: `${playerId}-${Date.now()}`,
      from: playerId,
      to: data.to,
      text: data.text,
      timestamp: Date.now()
    }
    
    // Store message
    const messages = getMessages(playerId, data.to)
    messages.push(message)
    saveMessages()
    
    // Send to recipient if online
    const recipientSocketId = playerSockets.get(data.to)
    if (recipientSocketId) {
      socket.to(recipientSocketId).emit('messages:new', { message })
    }
    
    // Confirm to sender
    socket.emit('messages:new', { message })
  })
  
  // Play game with friend (1v1)
  socket.on('friends:play', (data: { friendId: string }) => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) return
    
    const friendSocketId = playerSockets.get(data.friendId)
    if (!friendSocketId) {
      socket.emit('friends:error', { message: 'Friend is not online' })
      return
    }
    
    const myProfile = usersCache.get(playerId)
    const friendProfile = usersCache.get(data.friendId)
    
    // Generate a room code
    const roomCode = generateFriendRoomCode()
    
    // Store pending game invite
    pendingGames.set(roomCode, {
      hostId: playerId,
      hostName: myProfile?.name || 'Player',
      hostSocketId: socket.id,
      friendId: data.friendId,
      friendName: friendProfile?.name || 'Player',
      friendSocketId,
      roomCode,
      createdAt: Date.now()
    })
    
    // Send to friend for acceptance
    socket.to(friendSocketId).emit('friends:gameInvite', { 
      from: myProfile?.name || 'Unknown', 
      fromId: playerId,
      roomCode,
      friendName: friendProfile?.name || 'Player'
    })
    
    // Tell host to wait
    socket.emit('friends:waitingForAccept', { 
      roomCode,
      friendName: friendProfile?.name || 'Player'
    })
  })
  
  // Accept game invite
  socket.on('friends:acceptGame', (data: { roomCode: string; fromId: string }) => {
    const playerId = socketPlayers.get(socket.id)
    if (!playerId) return
    
    const pendingGame = pendingGames.get(data.roomCode)
    if (!pendingGame) {
      socket.emit('friends:error', { message: 'Game invite expired' })
      return
    }
    
    // Import rooms module to create room
    import('./rooms.js').then((rooms) => {
      const io = getIO()
      
      // Create the room with host's permanent player ID
      const result = rooms.createRoom(pendingGame.hostName, pendingGame.hostSocketId, pendingGame.hostId)
      
      // Get the host socket and join them to the room
      const hostSocket = io.sockets.sockets.get(pendingGame.hostSocketId)
      if (hostSocket) {
        hostSocket.join(result.room.roomCode)
        
        // Send player ID first (before room state)
        hostSocket.emit('player:id', { id: result.playerId, name: pendingGame.hostName })
        
        // Send room state to host
        const roomState = {
          roomCode: result.room.roomCode,
          hostPlayerId: result.playerId,
          players: Array.from(result.room.players.values()),
          settings: result.room.settings,
          phase: result.room.phase
        }
        hostSocket.emit('room:state', roomState)
      }
      
      // Tell host that friend accepted (they're already in room)
      io.to(pendingGame.hostSocketId).emit('friends:gameAccepted', {
        roomCode: result.room.roomCode,
        friendName: pendingGame.friendName,
        isHost: true
      })
      
      // Tell friend to join the created room
      socket.emit('friends:gameAccepted', {
        roomCode: result.room.roomCode,
        hostName: pendingGame.hostName,
        isHost: false
      })
      
      // Remove pending game
      pendingGames.delete(data.roomCode)
    })
  })
  
  // Decline game invite
  socket.on('friends:declineGame', (data: { roomCode: string; fromId: string }) => {
    const pendingGame = pendingGames.get(data.roomCode)
    if (!pendingGame) return
    
    const io = getIO()
    
    // Notify host that friend declined
    io.to(pendingGame.hostSocketId).emit('friends:gameDeclined', {
      friendName: pendingGame.friendName
    })
    
    // Remove pending game
    pendingGames.delete(data.roomCode)
  })
}

// Generate a room code for friend games
function generateFriendRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'F'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Get player name by ID
export function getPlayerName(playerId: string): string | undefined {
  return usersCache.get(playerId)?.name
}

// Get player ID by name
export function getPlayerIdByName(name: string): string | undefined {
  return nameToIdCache.get(name.toLowerCase())
}

// Initialize on load
loadData()
