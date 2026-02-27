import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io, Socket } from 'socket.io-client'

export interface Player {
  id: string
  name: string
  connected: boolean
  isHost: boolean
  score: number
  isReady: boolean
  powerUps: {
    freeze: number
    burn: number
  }
}

export interface GameSettings {
  rounds: number
  roundSeconds: number
  minLen: number
  fullBonusEnabled: boolean
  gameMode: 'classic' | 'guess' | 'scramble' | 'teaser'
}

export type GamePhase = 'lobby' | 'round' | 'round_results' | 'game_over'

export interface RoomState {
  roomCode: string
  hostPlayerId: string | null
  players: Player[]
  settings: GameSettings
  phase: GamePhase
}

export interface RoundState {
  roundIndex: number
  sourceWord: string
  startedAt: number
  endsAt: number
  usedWordsGlobal: string[]
  submissionsByPlayerId: Record<string, string[]>
  scoresByPlayerId: Record<string, number>
}

// Socket event types
export interface RoomStateEvent {
  roomCode: string
  hostPlayerId: string | null
  players: Player[]
  settings: GameSettings
  phase: GamePhase
}

export interface RoundStartEvent {
  roundIndex: number
  sourceWord: string
  startedAt: number
  endsAt: number
  gameMode?: 'classic' | 'guess' | 'scramble' | 'teaser'
  puzzle?: string
  hint?: string
  scrambledWord?: string
  riddle?: string
}

export interface WordResultEvent {
  ok: boolean
  word: string
  reason?: 'not_in_dictionary' | 'invalid_letters' | 'too_short' | 'already_used' | 'round_ended'
  pointsAwarded?: number
  playerId: string
  newTotalScore?: number
  usedWordsCount?: number
}

export interface RoundEndEvent {
  roundIndex: number
  leaderboard: Array<{
    playerId: string
    playerName: string
    roundPoints: number
    totalPoints: number
    bestWord: string | null
    bestWordPoints: number
  }>
  roundStats: {
    totalWordsSubmitted: number
    sourceWord: string
  }
  correctAnswer?: string
  gameMode?: 'classic' | 'guess' | 'scramble' | 'teaser'
}

export interface GameEndEvent {
  finalLeaderboard: Array<{
    playerId: string
    playerName: string
    totalPoints: number
  }>
  winner: {
    playerId: string
    playerName: string
    totalPoints: number
  } | null
  isDraw?: boolean
}

// Unread message notification
export interface UnreadMessage {
  fromId: string
  fromName: string
  text: string
  timestamp: number
  count: number
}

// Game invite
export interface GameInvite {
  fromId: string
  fromName: string
  roomCode: string
  timestamp: number
}

export const useGameStore = defineStore('game', () => {
  // Shared socket instance
  let socket: Socket | null = null

  // Authenticated user (from Google Sign In)
  const authenticatedUser = ref<{
    id: string
    googleId: string
    email: string
    name: string
    picture?: string
    totalGamesPlayed?: number
    totalWins?: number
    totalScore?: number
    highestRoundScore?: number
  } | null>(null)

  // Player info - restore from localStorage
  const playerId = ref<string | null>(localStorage.getItem('worrdd_playerId') || null)
  const playerName = ref<string>(localStorage.getItem('worrdd_playerName') || '')
  
  // Dark mode - restore from localStorage
  const darkMode = ref(localStorage.getItem('worrdd_darkMode') === 'true')
  
  // Room state
  const roomState = ref<RoomState | null>(null)
  
  // Game state
  const currentRound = ref<RoundState | null>(null)
  const roundEndData = ref<RoundEndEvent | null>(null)
  const gameEndData = ref<GameEndEvent | null>(null)

  // UI state
  const isConnected = ref(false)
  const error = ref<string | null>(null)
  
  // Notifications
  const unreadMessages = ref<Map<string, UnreadMessage>>(new Map())
  const pendingGameInvite = ref<GameInvite | null>(null)
  const waitingForFriend = ref<{ friendName: string; roomCode: string } | null>(null)

  // Computed
  const isHost = computed(() => {
    if (!roomState.value || !playerId.value) return false
    return roomState.value.hostPlayerId === playerId.value
  })

  const currentPlayer = computed(() => {
    if (!roomState.value || !playerId.value) return null
    return roomState.value.players.find(p => p.id === playerId.value)
  })

  const myScore = computed(() => {
    if (currentRound.value && playerId.value) {
      return currentRound.value.scoresByPlayerId[playerId.value] || 0
    }
    return currentPlayer.value?.score || 0
  })

  const mySubmissions = computed(() => {
    if (!currentRound.value || !playerId.value) return []
    return currentRound.value.submissionsByPlayerId[playerId.value] || []
  })

  const timeRemaining = computed(() => {
    if (!currentRound.value) return 0
    const remaining = currentRound.value.endsAt - Date.now()
    return Math.max(0, Math.floor(remaining / 1000))
  })

  // Socket management
  const getSocket = (): Socket | null => socket

  const connectSocket = (): Socket => {
    if (socket?.connected) return socket
    
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
    socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    })
    
    socket.on('connect', () => {
      isConnected.value = true
    })
    
    socket.on('disconnect', () => {
      isConnected.value = false
    })
    
    return socket
  }

  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect()
      socket = null
    }
  }
  
  // Ensure socket is connected
  const ensureSocket = (): Socket => {
    if (!socket || !socket.connected) {
      return connectSocket()
    }
    return socket
  }

  // Actions
  const setPlayerInfo = (id: string, name: string) => {
    playerId.value = id
    playerName.value = name
    // Persist to localStorage
    localStorage.setItem('worrdd_playerId', id)
    localStorage.setItem('worrdd_playerName', name)
  }

  const setRoomState = (state: RoomState) => {
    roomState.value = state
  }

  const setCurrentRound = (round: typeof currentRound.value) => {
    currentRound.value = round
  }

  const setRoundEndData = (data: RoundEndEvent) => {
    roundEndData.value = data
  }

  const setError = (message: string | null) => {
    error.value = message
  }

  const setConnected = (connected: boolean) => {
    isConnected.value = connected
  }

  const setGameEndData = (data: GameEndEvent | null) => {
    gameEndData.value = data
  }

  const toggleDarkMode = () => {
    darkMode.value = !darkMode.value
    localStorage.setItem('worrdd_darkMode', String(darkMode.value))
    // Apply dark mode class to body
    document.body.classList.toggle('dark-mode', darkMode.value)
  }

  // Initialize dark mode on load
  if (darkMode.value) {
    document.body.classList.add('dark-mode')
  }

  const reset = () => {
    roomState.value = null
    currentRound.value = null
    roundEndData.value = null
    gameEndData.value = null
    error.value = null
  }

  // Notification actions
  const addUnreadMessage = (msg: UnreadMessage) => {
    const existing = unreadMessages.value.get(msg.fromId)
    if (existing) {
      existing.count += 1
      existing.text = msg.text
      existing.timestamp = msg.timestamp
    } else {
      unreadMessages.value.set(msg.fromId, { ...msg, count: 1 })
    }
  }

  const clearUnreadMessages = (fromId: string) => {
    unreadMessages.value.delete(fromId)
  }

  const getUnreadCount = computed(() => {
    let total = 0
    unreadMessages.value.forEach(msg => {
      total += msg.count
    })
    return total
  })

  const addGameInvite = (invite: GameInvite) => {
    pendingGameInvite.value = invite
  }

  const clearGameInvite = () => {
    pendingGameInvite.value = null
  }

  const setWaitingForFriend = (data: { friendName: string; roomCode: string } | null) => {
    waitingForFriend.value = data
  }

  // Auth actions
  const setAuthenticatedUser = (user: typeof authenticatedUser.value) => {
    authenticatedUser.value = user
    // If user is authenticated, use their name as player name
    if (user?.name) {
      playerName.value = user.name
      localStorage.setItem('worrdd_playerName', user.name)
    }
  }

  const logout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    authenticatedUser.value = null
  }

  return {
    // State
    playerId,
    playerName,
    darkMode,
    authenticatedUser,
    roomState,
    currentRound,
    roundEndData,
    gameEndData,
    isConnected,
    error,
    unreadMessages,
    pendingGameInvite,
    waitingForFriend,
    
    // Computed
    isHost,
    currentPlayer,
    myScore,
    mySubmissions,
    timeRemaining,
    getUnreadCount,
    
    // Actions
    setPlayerInfo,
    setAuthenticatedUser,
    logout,
    setRoomState,
    setCurrentRound,
    setRoundEndData,
    setGameEndData,
    setError,
    setConnected,
    toggleDarkMode,
    reset,
    addUnreadMessage,
    clearUnreadMessages,
    addGameInvite,
    clearGameInvite,
    setWaitingForFriend,
    
    // Socket
    getSocket,
    connectSocket,
    disconnectSocket,
    ensureSocket
  }
})
