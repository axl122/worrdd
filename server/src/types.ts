// Game Types

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
  gameMode: 'classic' | 'guess' | 'scramble' | 'teaser'
  // Classic mode settings
  minLen?: number  // Minimum word length (default 3)
  fullBonusEnabled?: boolean  // Bonus for using all letters
  // Guess mode settings
  guessHintLevel?: 'none' | 'first_letter' | 'length' | 'full'  // How much hint to show
  guessWordLength?: number  // Target word length (default 5-8)
  // Scramble mode settings
  scrambleWordLength?: number  // Target word length (default 5-8)
}

export type GamePhase = 'lobby' | 'round' | 'round_results' | 'game_over'

export interface RoomState {
  roomCode: string
  hostPlayerId: string | null
  players: Map<string, Player>
  settings: GameSettings
  phase: GamePhase
  usedSourceWords: Set<string> // Track used source words to prevent repetition
}

export interface RoundState {
  roundIndex: number
  sourceWord: string
  startedAt: number
  endsAt: number
  usedWordsGlobal: Set<string>
  submissionsByPlayerId: Map<string, string[]>
  scoresByPlayerId: Map<string, number>
  roundScoresByPlayerId: Map<string, number>
  // Game mode specific
  gameMode: 'classic' | 'guess' | 'scramble' | 'teaser'
  puzzle?: string // For guess mode: "a _ p _ e"
  hint?: string // For guess mode hint
  scrambledWord?: string // For scramble mode
  riddle?: string // For teaser mode
  correctAnswer?: string // The correct answer for guess/scramble/teaser
  solvedBy?: string // Player who solved first (for guess/scramble/teaser)
}

// Socket Events - Client -> Server
export interface RoomCreateEvent {
  name: string
}

export interface RoomJoinEvent {
  roomCode: string
  name: string
}

export interface RoomUpdateSettingsEvent {
  rounds?: number
  roundSeconds?: number
  minLen?: number
  fullBonusEnabled?: boolean
}

export interface WordSubmitEvent {
  word: string
}

// Socket Events - Server -> Client
export interface RoomStateEvent {
  roomCode: string
  hostPlayerId: string | null
  players: Array<{
    id: string
    name: string
    connected: boolean
    isHost: boolean
    score: number
    isReady: boolean
    powerUps: { freeze: number; burn: number }
  }>
  settings: GameSettings
  phase: GamePhase
}

export interface GameStateEvent {
  phase: GamePhase
  roundIndex: number
  totalRounds: number
  scoresByPlayerId: Record<string, number>
}

export interface RoundStartEvent {
  roundIndex: number
  sourceWord: string
  startedAt: number
  endsAt: number
  gameMode: 'classic' | 'guess' | 'scramble' | 'teaser'
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
  correctAnswer?: string // For guess/scramble/teaser/clues modes when nobody solved
  gameMode?: 'classic' | 'guess' | 'scramble' | 'teaser' | 'clues'
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
}

// Friend system types
export interface Friend {
  id: string
  name: string
  online: boolean
}

export interface Message {
  id: string
  from: string
  to: string
  text: string
  timestamp: number
}

export interface FriendState {
  playerId: string
  friends: string[] // friend player IDs
  pendingRequests: string[] // incoming friend request IDs
}
