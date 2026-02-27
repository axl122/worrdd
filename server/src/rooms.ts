import type { Player, GameSettings, RoomState, RoundState, GamePhase } from './types.js'
import { getRandomSourceWord, isValidWordAsync, canBuildFromLetters, calculatePoints, calculateFullBonus, generateGuessPuzzle, generateScramblePuzzle, generateTeaser } from './words.js'

// Room storage (in-memory for v1)
const rooms = new Map<string, RoomState>()
const roundStates = new Map<string, RoundState>()

// Generate unique room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code: string
  let attempts = 0
  
  do {
    code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    attempts++
    if (attempts > 100) {
      // Fallback with timestamp
      code = chars.charAt(Math.floor(Math.random() * chars.length)) + 
             Date.now().toString(36).slice(-4).toUpperCase() +
             chars.charAt(Math.floor(Math.random() * chars.length))
      break
    }
  } while (rooms.has(code))
  
  return code
}

// Create a new room
export function createRoom(hostName: string, hostSocketId: string, hostPlayerId?: string): { room: RoomState; playerId: string } {
  const roomCode = generateRoomCode()
  const playerId = hostPlayerId || hostSocketId
  
  const defaultSettings: GameSettings = {
    rounds: 7,
    roundSeconds: 60,
    minLen: 3,
    fullBonusEnabled: true,
    gameMode: 'classic'
  }
  
  const hostPlayer: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 15),
    connected: true,
    isHost: true,
    score: 0,
    isReady: true, // Host is always ready
    powerUps: { freeze: 0, burn: 0 }
  }
  
  const room: RoomState = {
    roomCode,
    hostPlayerId: playerId,
    players: new Map([[playerId, hostPlayer]]),
    settings: defaultSettings,
    phase: 'lobby'
  }
  
  rooms.set(roomCode, room)
  console.log(`Room created: ${roomCode} by ${hostName}`)
  
  return { room, playerId }
}

// Join an existing room
export function joinRoom(roomCode: string, playerName: string, socketId: string, existingPlayerId?: string): { room: RoomState; playerId: string } | { error: string } {
  const room = rooms.get(roomCode.toUpperCase())
  
  if (!room) {
    return { error: 'Room not found' }
  }
  
  if (room.phase !== 'lobby') {
    return { error: 'Game already in progress' }
  }
  
  if (room.players.size >= 10) {
    return { error: 'Room is full' }
  }
  
  const playerId = existingPlayerId || socketId
  
  // Check if player is rejoining
  const existingPlayer = Array.from(room.players.values()).find(p => p.name.toLowerCase() === playerName.toLowerCase())
  if (existingPlayer) {
    // Reconnect as existing player
    existingPlayer.connected = true
    existingPlayer.id = playerId // Update socket ID
    return { room, playerId: existingPlayer.id }
  }
  
  const newPlayer: Player = {
    id: playerId,
    name: playerName.trim().slice(0, 15),
    connected: true,
    isHost: false,
    score: 0,
    isReady: false,
    powerUps: { freeze: 0, burn: 0 }
  }
  
  room.players.set(playerId, newPlayer)
  console.log(`Player ${playerName} joined room ${roomCode}`)
  
  return { room, playerId }
}

// Get room by code
export function getRoom(roomCode: string): RoomState | undefined {
  return rooms.get(roomCode.toUpperCase())
}

// Get round state
export function getRoundState(roomCode: string): RoundState | undefined {
  return roundStates.get(roomCode.toUpperCase())
}

// Update player connection status
export function setPlayerConnected(roomCode: string, playerId: string, connected: boolean): void {
  const room = rooms.get(roomCode.toUpperCase())
  if (room) {
    const player = room.players.get(playerId)
    if (player) {
      player.connected = connected
    }
  }
}

// Remove player from room
export function removePlayer(roomCode: string, playerId: string): { roomEmpty: boolean; newHostId?: string } {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return { roomEmpty: true }
  
  const player = room.players.get(playerId)
  const wasHost = player?.isHost || false
  
  room.players.delete(playerId)
  
  // If host left, assign new host
  if (wasHost && room.players.size > 0) {
    const newHost = room.players.values().next().value
    if (newHost) {
      newHost.isHost = true
      room.hostPlayerId = newHost.id
      return { roomEmpty: false, newHostId: newHost.id }
    }
  }
  
  // Delete room if empty
  if (room.players.size === 0) {
    rooms.delete(roomCode.toUpperCase())
    roundStates.delete(roomCode.toUpperCase())
    console.log(`Room ${roomCode} deleted (empty)`)
    return { roomEmpty: true }
  }
  
  return { roomEmpty: false }
}

// Update room settings (host only)
export function updateSettings(roomCode: string, playerId: string, settings: Partial<GameSettings>): GameSettings | null {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return null
  
  const player = room.players.get(playerId)
  if (!player?.isHost) return null
  
  if (settings.rounds !== undefined) room.settings.rounds = Math.max(1, Math.min(20, settings.rounds))
  if (settings.roundSeconds !== undefined) room.settings.roundSeconds = Math.max(30, Math.min(180, settings.roundSeconds))
  if (settings.minLen !== undefined) room.settings.minLen = Math.max(2, Math.min(7, settings.minLen))
  if (settings.fullBonusEnabled !== undefined) room.settings.fullBonusEnabled = settings.fullBonusEnabled
  if (settings.gameMode !== undefined) room.settings.gameMode = settings.gameMode
  
  return room.settings
}

// Toggle player ready status
export function togglePlayerReady(roomCode: string, playerId: string): boolean | null {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return null
  
  const player = room.players.get(playerId)
  if (!player || player.isHost) return null // Host is always ready
  
  player.isReady = !player.isReady
  return player.isReady
}

// Check if all connected non-host players are ready
export function allPlayersReady(roomCode: string): boolean {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return false
  
  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected)
  if (connectedPlayers.length < 2) return false // Need at least 2 players
  
  return connectedPlayers.every(p => p.isReady || p.isHost)
}

// Award power-up to player (called when they reach milestones)
export function awardPowerUp(roomCode: string, playerId: string, type: 'freeze' | 'burn'): boolean {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return false
  
  const player = room.players.get(playerId)
  if (!player) return false
  
  player.powerUps[type]++
  return true
}

// Transfer host to another player
export function transferHost(roomCode: string, currentHostId: string, newHostId: string): { success: boolean; error?: string } {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return { success: false, error: 'Room not found' }
  
  const currentHost = room.players.get(currentHostId)
  if (!currentHost || !currentHost.isHost) return { success: false, error: 'Only current host can transfer' }
  
  const newHost = room.players.get(newHostId)
  if (!newHost || !newHost.connected) return { success: false, error: 'New host not found or not connected' }
  
  // Transfer host status
  currentHost.isHost = false
  newHost.isHost = true
  room.hostPlayerId = newHostId
  
  console.log(`Host transferred from ${currentHost.name} to ${newHost.name} in room ${roomCode}`)
  return { success: true }
}

// Use power-up
export function usePowerUp(roomCode: string, playerId: string, type: 'freeze' | 'burn'): { success: boolean; targetPlayerId?: string; pointsLost?: number } {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return { success: false }
  
  const player = room.players.get(playerId)
  if (!player || player.powerUps[type] <= 0) return { success: false }
  
  player.powerUps[type]--
  
  if (type === 'burn') {
    // Find a random other connected player to burn
    const otherPlayers = Array.from(room.players.values())
      .filter(p => p.id !== playerId && p.connected && p.score > 0)
    
    if (otherPlayers.length > 0) {
      const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
      const pointsLost = Math.min(target.score, Math.ceil(target.score * 0.1)) // Burn 10% of points, max their score
      target.score -= pointsLost
      return { success: true, targetPlayerId: target.id, pointsLost }
    }
    return { success: false }
  }
  
  return { success: true }
}

// Start the game
export function startGame(roomCode: string, playerId: string): RoundState | { error: string } {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return { error: 'Room not found' }
  
  const player = room.players.get(playerId)
  if (!player?.isHost) return { error: 'Only host can start game' }
  
  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected)
  if (connectedPlayers.length < 2) return { error: 'Need at least 2 players' }
  if (connectedPlayers.length > 10) return { error: 'Too many players' }
  
  // Initialize scores
  for (const p of room.players.values()) {
    p.score = 0
  }
  
  room.phase = 'round'
  
  // Create first round
  const roundState = createRound(room, 0)
  roundStates.set(roomCode.toUpperCase(), roundState)
  
  console.log(`Game started in room ${roomCode}`)
  return roundState
}

// Create a new round
function createRound(room: RoomState, roundIndex: number): RoundState {
  const now = Date.now()
  const gameMode = room.settings.gameMode
  
  // Base round state
  const roundState: RoundState = {
    roundIndex,
    sourceWord: '',
    startedAt: now,
    endsAt: now + room.settings.roundSeconds * 1000,
    usedWordsGlobal: new Set(),
    submissionsByPlayerId: new Map(),
    scoresByPlayerId: new Map(),
    roundScoresByPlayerId: new Map(),
    gameMode
  }
  
  // Initialize player round data
  for (const [playerId] of room.players) {
    roundState.submissionsByPlayerId.set(playerId, [])
    roundState.scoresByPlayerId.set(playerId, 0)
    roundState.roundScoresByPlayerId.set(playerId, 0)
  }
  
  // Generate mode-specific content with settings
  switch (gameMode) {
    case 'classic': {
      roundState.sourceWord = getRandomSourceWord()
      break
    }
    case 'guess': {
      const wordLength = room.settings.guessWordLength ?? 6
      const puzzle = generateGuessPuzzle(wordLength, wordLength)
      roundState.sourceWord = puzzle.word
      roundState.puzzle = puzzle.puzzle
      roundState.hint = puzzle.hint
      roundState.correctAnswer = puzzle.word
      break
    }
    case 'scramble': {
      const wordLength = room.settings.scrambleWordLength ?? 6
      const scramble = generateScramblePuzzle(wordLength, wordLength)
      roundState.sourceWord = scramble.word
      roundState.scrambledWord = scramble.scrambled
      roundState.correctAnswer = scramble.word
      break
    }
    case 'teaser': {
      const teaser = generateTeaser()
      roundState.sourceWord = teaser.answer
      roundState.riddle = teaser.riddle
      roundState.hint = teaser.hint
      roundState.correctAnswer = teaser.answer
      break
    }
  }
  
  return roundState
}

// Submit a word (async with API fallback)
export async function submitWordAsync(
  roomCode: string, 
  playerId: string, 
  word: string
): Promise<{ ok: boolean; reason?: string; pointsAwarded?: number; newTotalScore?: number; usedWordsCount?: number; powerUpAwarded?: { type: 'freeze' | 'burn'; reason: string }; solved?: boolean; correctAnswer?: string }> {
  const room = rooms.get(roomCode.toUpperCase())
  const roundState = roundStates.get(roomCode.toUpperCase())
  
  if (!room || !roundState) {
    return { ok: false, reason: 'room_not_found' }
  }
  
  // Check round phase and time
  if (room.phase !== 'round') {
    return { ok: false, reason: 'round_ended' }
  }
  
  if (Date.now() >= roundState.endsAt) {
    return { ok: false, reason: 'round_ended' }
  }
  
  // Normalize word
  const normalizedWord = word.toLowerCase().trim().replace(/[^a-z]/g, '')
  
  console.log(`Word submit: "${word}" -> "${normalizedWord}" (player: ${playerId})`)
  
  // Handle different game modes
  const gameMode = roundState.gameMode
  
  // GUESS MODE: First to guess correctly wins
  if (gameMode === 'guess') {
    // Check if already solved
    if (roundState.solvedBy) {
      return { ok: false, reason: 'already_solved' }
    }
    
    if (normalizedWord === roundState.correctAnswer) {
      // Correct! Award points based on remaining time
      const timeBonus = Math.max(1, Math.floor((roundState.endsAt - Date.now()) / 1000))
      const points = 10 + timeBonus
      
      const player = room.players.get(playerId)
      if (player) {
        player.score += points
        roundState.scoresByPlayerId.set(playerId, player.score)
        roundState.solvedBy = playerId
      }
      
      return { 
        ok: true, 
        pointsAwarded: points, 
        newTotalScore: player?.score || 0,
        solved: true,
        correctAnswer: roundState.correctAnswer
      }
    }
    
    return { ok: false, reason: 'wrong_guess' }
  }
  
  // SCRAMBLE MODE: First to unscramble wins
  if (gameMode === 'scramble') {
    // Check if already solved
    if (roundState.solvedBy) {
      return { ok: false, reason: 'already_solved' }
    }
    
    if (normalizedWord === roundState.correctAnswer) {
      // Correct! Award points based on remaining time
      const timeBonus = Math.max(1, Math.floor((roundState.endsAt - Date.now()) / 1000))
      const points = 10 + timeBonus
      
      const player = room.players.get(playerId)
      if (player) {
        player.score += points
        roundState.scoresByPlayerId.set(playerId, player.score)
        roundState.solvedBy = playerId
      }
      
      return { 
        ok: true, 
        pointsAwarded: points, 
        newTotalScore: player?.score || 0,
        solved: true,
        correctAnswer: roundState.correctAnswer
      }
    }
    
    return { ok: false, reason: 'wrong_guess' }
  }
  
  // CLASSIC MODE: Original word game
  const minLen = room.settings.minLen ?? 3
  if (normalizedWord.length < minLen) {
    console.log(`Word "${normalizedWord}" REJECTED: too short (${normalizedWord.length} < ${minLen})`)
    return { ok: false, reason: 'too_short' }
  }
  
  // Use async validation with API fallback
  if (!await isValidWordAsync(normalizedWord)) {
    console.log(`Word "${normalizedWord}" REJECTED: not in dictionary`)
    return { ok: false, reason: 'not_in_dictionary' }
  }
  
  if (!canBuildFromLetters(normalizedWord, roundState.sourceWord)) {
    console.log(`Word "${normalizedWord}" REJECTED: cannot build from "${roundState.sourceWord}"`)
    return { ok: false, reason: 'invalid_letters' }
  }
  
  // Global uniqueness check
  if (roundState.usedWordsGlobal.has(normalizedWord)) {
    console.log(`Word "${normalizedWord}" REJECTED: already used`)
    return { ok: false, reason: 'already_used' }
  }
  
  // Word is valid! Process it
  roundState.usedWordsGlobal.add(normalizedWord)
  
  const submissions = roundState.submissionsByPlayerId.get(playerId) || []
  submissions.push(normalizedWord)
  roundState.submissionsByPlayerId.set(playerId, submissions)
  
  // Calculate points
  const basePoints = calculatePoints(normalizedWord.length)
  const bonusPoints = calculateFullBonus(normalizedWord, roundState.sourceWord, room.settings.fullBonusEnabled ?? true)
  const totalPoints = basePoints + bonusPoints
  
  // Update scores
  const currentRoundScore = roundState.roundScoresByPlayerId.get(playerId) || 0
  roundState.roundScoresByPlayerId.set(playerId, currentRoundScore + totalPoints)
  
  const player = room.players.get(playerId)
  if (player) {
    player.score += totalPoints
    roundState.scoresByPlayerId.set(playerId, player.score)
  }
  
  // Check for power-up awards
  let powerUpAwarded: { type: 'freeze' | 'burn'; reason: string } | undefined
  
  if (player) {
    // Award FREEZE for 5 words in a round
    if (submissions.length === 5) {
      player.powerUps.freeze++
      powerUpAwarded = { type: 'freeze', reason: '5 words this round!' }
    }
    
    // Award BURN for 10+ points on a single word
    if (totalPoints >= 10) {
      player.powerUps.burn++
      powerUpAwarded = { type: 'burn', reason: `${totalPoints} point word!` }
    }
  }
  
  console.log(`Word "${normalizedWord}" accepted in room ${roomCode} by ${player?.name}, +${totalPoints} points`)
  
  return {
    ok: true,
    pointsAwarded: totalPoints,
    newTotalScore: player?.score || 0,
    usedWordsCount: roundState.usedWordsGlobal.size,
    powerUpAwarded
  }
}

// End current round
export function endRound(roomCode: string): { roundState: RoundState; room: RoomState; isGameOver: boolean; finalState?: any } | null {
  const room = rooms.get(roomCode.toUpperCase())
  const roundState = roundStates.get(roomCode.toUpperCase())
  
  if (!room || !roundState) return null
  
  // Check if this was the last round
  const isGameOver = roundState.roundIndex >= room.settings.rounds - 1
  
  if (isGameOver) {
    room.phase = 'game_over'
    return { 
      roundState, 
      room, 
      isGameOver: true, 
      finalState: getGameEndState(room) 
    }
  }
  
  room.phase = 'round_results'
  return { roundState, room, isGameOver: false }
}

// Start next round or end game
export function nextRound(roomCode: string): { type: 'round'; roundState: RoundState } | { type: 'game_over'; finalState: any } | null {
  const room = rooms.get(roomCode.toUpperCase())
  const currentRound = roundStates.get(roomCode.toUpperCase())
  
  if (!room || !currentRound) return null
  
  const nextRoundIndex = currentRound.roundIndex + 1
  
  if (nextRoundIndex >= room.settings.rounds) {
    // Game over
    room.phase = 'game_over'
    return { type: 'game_over', finalState: getGameEndState(room) }
  }
  
  // Start next round
  room.phase = 'round'
  const newRound = createRound(room, nextRoundIndex)
  roundStates.set(roomCode.toUpperCase(), newRound)
  
  return { type: 'round', roundState: newRound }
}

// Get game end state
function getGameEndState(room: RoomState) {
  const leaderboard = Array.from(room.players.values())
    .map(p => ({
      playerId: p.id,
      playerName: p.name,
      totalPoints: p.score
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
  
  // Check for draw (multiple players with same top score)
  let winner = null
  if (leaderboard.length > 0) {
    const topScore = leaderboard[0].totalPoints
    const tiedPlayers = leaderboard.filter(p => p.totalPoints === topScore)
    
    if (tiedPlayers.length === 1) {
      // Single winner
      winner = {
        playerId: leaderboard[0].playerId,
        playerName: leaderboard[0].playerName,
        totalPoints: leaderboard[0].totalPoints
      }
    }
    // If tiedPlayers.length > 1, winner stays null (it's a draw)
  }
  
  return {
    finalLeaderboard: leaderboard,
    winner,
    isDraw: leaderboard.length > 1 && leaderboard.filter(p => p.totalPoints === leaderboard[0].totalPoints).length > 1
  }
}

// Get round end state for broadcasting
export function getRoundEndState(roomCode: string): any {
  const room = rooms.get(roomCode.toUpperCase())
  const roundState = roundStates.get(roomCode.toUpperCase())
  
  if (!room || !roundState) return null
  
  const leaderboard = Array.from(room.players.values())
    .map(p => {
      const roundPoints = roundState.roundScoresByPlayerId.get(p.id) || 0
      const submissions = roundState.submissionsByPlayerId.get(p.id) || []
      
      // Find best word
      let bestWord: string | null = null
      let bestWordPoints = 0
      for (const word of submissions) {
        const points = calculatePoints(word.length)
        if (points > bestWordPoints || (points === bestWordPoints && word.length > (bestWord?.length || 0))) {
          bestWord = word
          bestWordPoints = points
        }
      }
      
      return {
        playerId: p.id,
        playerName: p.name,
        roundPoints,
        totalPoints: p.score,
        bestWord,
        bestWordPoints
      }
    })
    .sort((a, b) => b.roundPoints - a.roundPoints)
  
  // Check if anyone solved (for guess/scramble/teaser modes)
  const hasCorrectAnswer = roundState.correctAnswer !== undefined
  const anyoneSolved = roundState.solvedBy !== undefined
  const nobodySolved = hasCorrectAnswer && !anyoneSolved
  
  return {
    roundIndex: roundState.roundIndex,
    leaderboard,
    roundStats: {
      totalWordsSubmitted: roundState.usedWordsGlobal.size,
      sourceWord: roundState.sourceWord
    },
    correctAnswer: nobodySolved ? roundState.correctAnswer : undefined,
    gameMode: roundState.gameMode
  }
}

// Play again (reset room)
export function playAgain(roomCode: string): boolean {
  const room = rooms.get(roomCode.toUpperCase())
  if (!room) return false
  
  room.phase = 'lobby'
  
  // Reset scores
  for (const player of room.players.values()) {
    player.score = 0
  }
  
  // Clear round state
  roundStates.delete(roomCode.toUpperCase())
  
  return true
}

