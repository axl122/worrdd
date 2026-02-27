<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import type { RoundStartEvent, RoundEndEvent } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()

// Local state
const wordInput = ref('')
const submittedWords = ref<string[]>([])
const usedWordsCount = ref(0)
const timeRemaining = ref(0)
const roundIndex = ref(0)
const totalRounds = ref(7)
const sourceWord = ref('')
const isRoundActive = ref(false)
const lastResult = ref<{ ok: boolean; word: string; points?: number; reason?: string } | null>(null)
const showResultAnimation = ref(false)
const leaderboard = ref<Array<{ playerId: string; playerName: string; score: number }>>([])

// Game mode state
const gameMode = ref<'classic' | 'guess' | 'scramble' | 'teaser'>('classic')
const puzzle = ref('') // For guess mode
const hint = ref('') // For guess mode
const scrambledWord = ref('') // For scramble mode
const riddle = ref('') // For teaser mode
const solvedBy = ref<{ playerId: string; playerName: string } | null>(null) // For guess/scramble/teaser

// Live word feed - shows all players' words
const liveWordFeed = ref<Array<{ word: string; playerName: string; points: number; isYou: boolean }>>([])
const wordFeedRef = ref<HTMLElement | null>(null)

// Power-ups
const powerUps = ref({ freeze: 0, burn: 0 })
const showPowerUpNotification = ref<{ type: 'freeze' | 'burn'; reason: string } | null>(null)
const isFrozen = ref(false)
const frozenBy = ref('')
const showBurnEffect = ref<{ usedBy: string; target: string; pointsLost: number } | null>(null)

// Chat
const showChatPanel = ref(false)
const chatMessages = ref<Array<{ id: string; playerId: string; playerName: string; message: string }>>([])
const chatInput = ref('')
const chatUnread = ref(0)
const chatRef = ref<HTMLElement | null>(null)

// Pressure/Encouragement Messages
const pressureMessage = ref<string | null>(null)
const showPressureMessage = ref(false)
let pressureTimeout: number | null = null
let lastPressureTime = 0

// Quit modal
const showQuitModal = ref(false)

// Timer
let timerInterval: number | null = null

// Computed
const canSubmit = computed(() => {
  return isRoundActive.value && 
         wordInput.value.trim().length >= (store.roomState?.settings.minLen || 3) &&
         timeRemaining.value > 0 &&
         sourceWord.value.split('').length > 0 &&
         !isFrozen.value
})

const formattedTime = computed(() => {
  const mins = Math.floor(timeRemaining.value / 60)
  const secs = timeRemaining.value % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})

const timePercentage = computed(() => {
  const totalSeconds = store.roomState?.settings.roundSeconds || 60
  return (timeRemaining.value / totalSeconds) * 100
})

const isTimeLow = computed(() => timeRemaining.value <= 10)

const myRank = computed(() => {
  const sorted = [...leaderboard.value].sort((a, b) => b.score - a.score)
  return sorted.findIndex(l => l.playerId === store.playerId) + 1
})

// Methods
const setupSocketListeners = () => {
  const socket = store.getSocket()
  if (!socket) {
    console.error('No socket available')
    return
  }

  socket.on('game:state', (data: any) => {
    roundIndex.value = data.roundIndex
    totalRounds.value = data.totalRounds
    updateLeaderboard(data.scoresByPlayerId)
  })

  socket.on('round:start', (data: RoundStartEvent) => {
    console.log('Round started:', data)
    sourceWord.value = data.sourceWord.toUpperCase()
    roundIndex.value = data.roundIndex
    const duration = Math.floor((data.endsAt - data.startedAt) / 1000)
    timeRemaining.value = duration
    isRoundActive.value = true
    submittedWords.value = []
    usedWordsCount.value = 0
    lastResult.value = null
    solvedBy.value = null
    
    // Game mode specific
    gameMode.value = data.gameMode || 'classic'
    puzzle.value = data.puzzle || ''
    hint.value = data.hint || ''
    scrambledWord.value = data.scrambledWord || ''
    riddle.value = data.riddle || ''
    
    // Initialize power-ups from current player
    const player = store.currentPlayer
    if (player) {
      powerUps.value = { ...player.powerUps }
    }
    
    // Start timer
    startTimer()
  })

  socket.on('word:result', (data: any) => {
    lastResult.value = {
      ok: data.ok,
      word: data.word,
      points: data.pointsAwarded,
      reason: data.reason
    }
    
    if (data.ok) {
      // Play success sound
      playSound('success')
      
      submittedWords.value.push(data.word)
      usedWordsCount.value = data.usedWordsCount || usedWordsCount.value + 1
      
      // Handle solved state for guess/scramble modes
      if (data.solved) {
        const solver = store.roomState?.players.find(p => p.id === data.playerId)
        solvedBy.value = {
          playerId: data.playerId,
          playerName: solver?.name || 'Unknown'
        }
      }
      
      // Add to live feed
      const playerName = store.roomState?.players.find(p => p.id === data.playerId)?.name || 'Unknown'
      liveWordFeed.value.unshift({
        word: data.word,
        playerName,
        points: data.pointsAwarded || 0,
        isYou: data.playerId === store.playerId
      })
      
      // Keep only last 20 words in feed
      if (liveWordFeed.value.length > 20) {
        liveWordFeed.value.pop()
      }
      
      // Update local score
      if (data.newTotalScore !== undefined) {
        updateMyScore(data.newTotalScore)
      }
      
      // Show success animation
      showResultAnimation.value = true
      setTimeout(() => {
        showResultAnimation.value = false
      }, 500)
    } else {
      // Play error sound for wrong answers
      playSound('error')
    }
    
    // Clear input
    wordInput.value = ''
  })

  socket.on('word:claimed', (data: { word: string; usedWordsCount: number; playerId?: string; playerName?: string; points?: number }) => {
    usedWordsCount.value = data.usedWordsCount
    
    // Add other players' words to feed
    if (data.playerId && data.playerId !== store.playerId && data.playerName && data.points) {
      liveWordFeed.value.unshift({
        word: data.word,
        playerName: data.playerName,
        points: data.points,
        isYou: false
      })
      
      if (liveWordFeed.value.length > 20) {
        liveWordFeed.value.pop()
      }
    }
  })

  // Someone solved the puzzle (guess/scramble/teaser mode)
  socket.on('word:solved', (data: { word: string; playerId: string; playerName: string; points: number }) => {
    // Update solvedBy to show who solved it
    solvedBy.value = {
      playerId: data.playerId,
      playerName: data.playerName
    }
    
    // Stop the timer since round is ending
    stopTimer()
    
    // Add to live feed
    liveWordFeed.value.unshift({
      word: data.word,
      playerName: data.playerName,
      points: data.points,
      isYou: data.playerId === store.playerId
    })
  })

  socket.on('round:end', (data: RoundEndEvent) => {
    isRoundActive.value = false
    stopTimer()
    
    // Store round end data for RoundResultsPage
    store.setRoundEndData(data)
    
    // Navigate to round results
    router.push('/room/results')
  })

  socket.on('game:end', (data: any) => {
    isRoundActive.value = false
    stopTimer()
    
    // Store the game end data before navigating
    store.setGameEndData(data)
    
    router.push('/room/final')
  })

  // Power-up awarded
  socket.on('powerup:awarded', (data: { type: 'freeze' | 'burn'; reason: string; totalPowerUps: { freeze: number; burn: number } }) => {
    powerUps.value = data.totalPowerUps
    showPowerUpNotification.value = { type: data.type, reason: data.reason }
    
    setTimeout(() => {
      showPowerUpNotification.value = null
    }, 3000)
  })

  // Freeze power-up used
  socket.on('powerup:freeze', (data: { usedBy: string }) => {
    if (data.usedBy !== store.playerName) {
      isFrozen.value = true
      frozenBy.value = data.usedBy
      
      // Freeze for 5 seconds
      setTimeout(() => {
        isFrozen.value = false
        frozenBy.value = ''
      }, 5000)
    }
  })

  // Burn power-up used
  socket.on('powerup:burn', (data: { usedBy: string; targetPlayer: string; pointsLost: number }) => {
    showBurnEffect.value = {
      usedBy: data.usedBy,
      target: data.targetPlayer,
      pointsLost: data.pointsLost
    }
    
    setTimeout(() => {
      showBurnEffect.value = null
    }, 3000)
  })

  // Chat messages
  socket.on('chat:message', (data: { id: string; playerId: string; playerName: string; message: string }) => {
    chatMessages.value.push(data)
    if (chatMessages.value.length > 50) chatMessages.value.shift()
    
    if (!showChatPanel.value && data.playerId !== store.playerId) {
      chatUnread.value++
    }
    
    if (showChatPanel.value && chatRef.value) {
      setTimeout(() => {
        if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight
      }, 10)
    }
  })
}

const startTimer = () => {
  stopTimer()
  timerInterval = window.setInterval(() => {
    if (timeRemaining.value > 0) {
      timeRemaining.value--
    } else {
      stopTimer()
      // Emit round:end when timer reaches zero
      if (isRoundActive.value) {
        const socket = store.getSocket()
        if (socket) {
          socket.emit('round:end')
        }
      }
    }
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// Sound effects using Web Audio API
const playSound = (type: 'success' | 'error') => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    if (type === 'success') {
      // Happy ascending tone
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime) // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1) // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2) // G5
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } else {
      // Error descending tone
      oscillator.frequency.setValueAtTime(311.13, audioContext.currentTime) // Eb4
      oscillator.frequency.setValueAtTime(233.08, audioContext.currentTime + 0.15) // Bb3
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    }
  } catch (e) {
    // Audio not supported, silently fail
  }
}

const submitWord = () => {
  if (!canSubmit.value) return
  const socket = store.getSocket()
  if (!socket) return
  
  socket.emit('word:submit', { word: wordInput.value.trim() })
}

const usePowerUp = (type: 'freeze' | 'burn') => {
  if (!isRoundActive.value) return
  if (powerUps.value[type] <= 0) return
  const socket = store.getSocket()
  if (!socket) return
  
  socket.emit('powerup:use', { type })
}

const updateLeaderboard = (scores: Record<string, number>) => {
  if (!store.roomState) return
  
  leaderboard.value = store.roomState.players
    .map(p => ({
      playerId: p.id,
      playerName: p.name,
      score: scores[p.id] || p.score
    }))
    .sort((a, b) => b.score - a.score)
  
  // Trigger pressure message based on rank
  if (isRoundActive.value && leaderboard.value.length > 1) {
    const isWinning = myRank.value === 1
    showRandomPressureMessage(isWinning)
  }
}

const updateMyScore = (newScore: number) => {
  if (!store.roomState || !store.playerId) return
  
  const player = store.roomState.players.find(p => p.id === store.playerId)
  if (player) {
    player.score = newScore
  }
  
  // Update leaderboard
  const entry = leaderboard.value.find(l => l.playerId === store.playerId)
  if (entry) {
    entry.score = newScore
    leaderboard.value.sort((a, b) => b.score - a.score)
  }
}

const getResultMessage = (reason?: string): string => {
  switch (reason) {
    case 'not_in_dictionary': return 'Not a valid word!'
    case 'invalid_letters': return "Can't make that from the letters!"
    case 'too_short': return 'Word too short!'
    case 'already_used': return 'Someone already used that!'
    case 'round_ended': return 'Round is over!'
    default: return 'Invalid word!'
  }
}

// Chat methods
const toggleChat = () => {
  showChatPanel.value = !showChatPanel.value
  if (showChatPanel.value) {
    chatUnread.value = 0
    setTimeout(() => {
      if (chatRef.value) {
        chatRef.value.scrollTop = chatRef.value.scrollHeight
      }
    }, 10)
  }
}

const sendChatMessage = () => {
  if (!chatInput.value.trim()) return
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('chat:send', { message: chatInput.value.trim() })
  chatInput.value = ''
}

// Pressure/Encouragement Messages
const winningMessages = [
  "You're crushing it! Keep going! 🔥",
  "Yes! You're doing amazing!",
  "Don't slow down now - you've got this!",
  "Incredible! Add more words!",
  "You're the champion in the making!",
  "Stay focused, you're winning!",
  "Amazing performance! Keep it up!",
  "You're on fire! 🔥",
  "Nobody can catch you now!",
  "Perfect! Keep that momentum!"
]

const losingMessages = [
  "Is there nothing you can think of? 🤔",
  "Are you just going to lose like that?",
  "Come on, dig deeper!",
  "You can do better than this!",
  "Don't give up now!",
  "Find those hidden words!",
  "The clock is ticking... ⏰",
  "Someone's taking your spot!",
  "Wake up! You've got more in you!",
  "Is that all you've got?"
]

const showRandomPressureMessage = (isWinning: boolean) => {
  const now = Date.now()
  // Only show message every 15-25 seconds
  if (now - lastPressureTime < 15000 + Math.random() * 10000) return
  
  lastPressureTime = now
  const messages = isWinning ? winningMessages : losingMessages
  pressureMessage.value = messages[Math.floor(Math.random() * messages.length)]
  showPressureMessage.value = true
  
  if (pressureTimeout) clearTimeout(pressureTimeout)
  pressureTimeout = window.setTimeout(() => {
    showPressureMessage.value = false
  }, 3000)
}

const quitGame = () => {
  showQuitModal.value = false
  store.disconnectSocket()
  store.reset()
  router.push('/')
}

// Lifecycle
onMounted(() => {
  // Initialize from store if round data already exists
  if (store.currentRound) {
    const round = store.currentRound as any
    sourceWord.value = round.sourceWord.toUpperCase()
    roundIndex.value = round.roundIndex
    const duration = Math.floor((round.endsAt - round.startedAt) / 1000)
    timeRemaining.value = duration
    isRoundActive.value = true
    
    // Get game mode specific data
    gameMode.value = round.gameMode || store.roomState?.settings.gameMode || 'classic'
    puzzle.value = round.puzzle || ''
    hint.value = round.hint || ''
    scrambledWord.value = round.scrambledWord || ''
    riddle.value = round.riddle || ''
    
    // Initialize power-ups from current player
    const player = store.currentPlayer
    if (player) {
      powerUps.value = { ...player.powerUps }
    }
    
    // Initialize leaderboard from room state
    if (store.roomState) {
      leaderboard.value = store.roomState.players
        .map(p => ({
          playerId: p.id,
          playerName: p.name,
          score: p.score
        }))
        .sort((a, b) => b.score - a.score)
    }
    
    startTimer()
  }
  
  setupSocketListeners()
})

onUnmounted(() => {
  stopTimer()
  // Don't disconnect socket - other pages may need it
})
</script>

<template>
  <div class="game-page">
    <!-- Header with Timer, Round, Leaderboard -->
    <header class="game-header">
      <div class="header-top">
        <div class="round-info">
          <span class="round-label">Round</span>
          <span class="round-number">{{ roundIndex + 1 }}/{{ totalRounds }}</span>
        </div>
        
        <div class="timer-section" :class="{ low: isTimeLow }">
          <div class="timer-circle">
            <svg viewBox="0 0 100 100">
              <circle 
                class="timer-bg" 
                cx="50" cy="50" r="45"
              />
              <circle 
                class="timer-progress" 
                :style="{ strokeDashoffset: 283 - (283 * timePercentage / 100) }"
                cx="50" cy="50" r="45"
              />
            </svg>
            <span class="timer-text">{{ formattedTime }}</span>
          </div>
        </div>
        
        <div class="header-actions">
          <button class="chat-btn" @click="toggleChat" :class="{ hasUnread: chatUnread > 0 }">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span v-if="chatUnread > 0" class="chat-badge">{{ chatUnread > 9 ? '9+' : chatUnread }}</span>
          </button>
        </div>
      </div>
      
      <!-- Mini Leaderboard -->
      <div class="mini-leaderboard">
        <div 
          v-for="(entry, index) in leaderboard.slice(0, 3)" 
          :key="entry.playerId"
          class="mini-entry"
          :class="{ isYou: entry.playerId === store.playerId }"
        >
          <span class="mini-rank">{{ index + 1 }}</span>
          <span class="mini-name">{{ entry.playerName.slice(0, 8) }}</span>
          <span class="mini-score">{{ entry.score }}</span>
        </div>
      </div>
    </header>

    <!-- Game Mode Content -->
    <main class="game-main">
      <!-- CLASSIC MODE: Source Word Display -->
      <section v-if="gameMode === 'classic'" class="source-word-section">
        <h2 class="section-title">Make words from:</h2>
        <div class="source-word-display">
          <span class="source-word-text">{{ sourceWord.toUpperCase() }}</span>
        </div>
        <div class="used-count">
          <span>{{ usedWordsCount }} words used</span>
        </div>
      </section>

      <!-- GUESS MODE: Puzzle Display -->
      <section v-else-if="gameMode === 'guess'" class="guess-section">
        <h2 class="section-title">Guess the Word!</h2>
        <div class="puzzle-display">
          <span class="puzzle-letters">{{ puzzle }}</span>
        </div>
        <div class="hint-display">
          <span class="hint-label">Hint:</span>
          <span class="hint-text">{{ hint }}</span>
        </div>
        <div v-if="solvedBy" class="solved-banner">
          <span class="solved-icon">🎉</span>
          <span class="solved-text">{{ solvedBy.playerName }} solved it!</span>
        </div>
      </section>

      <!-- SCRAMBLE MODE: Scrambled Word Display -->
      <section v-else-if="gameMode === 'scramble'" class="scramble-section">
        <h2 class="section-title">Unscramble the Word!</h2>
        <div class="scrambled-display">
          <span class="scrambled-letters">{{ scrambledWord }}</span>
        </div>
        <div v-if="solvedBy" class="solved-banner">
          <span class="solved-icon">🎉</span>
          <span class="solved-text">{{ solvedBy.playerName }} solved it!</span>
        </div>
      </section>

      <!-- TEASER MODE: Riddle Display -->
      <section v-else-if="gameMode === 'teaser'" class="teaser-section">
        <h2 class="section-title">🧩 Solve the Riddle!</h2>
        <div class="riddle-display">
          <p class="riddle-text">{{ riddle }}</p>
        </div>
        <div class="riddle-hint" v-if="hint">
          <span class="hint-icon">💡</span>
          <span class="hint-text">{{ hint }}</span>
        </div>
        <div v-if="solvedBy" class="solved-banner">
          <span class="solved-icon">🎉</span>
          <span class="solved-text">{{ solvedBy.playerName }} solved it!</span>
        </div>
      </section>

      <!-- Live Word Feed (Chat-style) -->
      <section class="word-feed-section">
        <div class="word-feed-header">
          <span class="feed-title">Live Words</span>
          <span class="feed-count">{{ liveWordFeed.length }}</span>
        </div>
        <div class="word-feed" ref="wordFeedRef">
          <TransitionGroup name="feed-item">
            <div 
              v-for="(entry, index) in liveWordFeed" 
              :key="entry.word + index"
              class="feed-item"
              :class="{ isYou: entry.isYou }"
            >
              <div class="feed-bubble">
                <span class="feed-player">{{ entry.playerName }}</span>
                <span class="feed-word">{{ entry.word }}</span>
                <span class="feed-points">+{{ entry.points }}</span>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="liveWordFeed.length === 0" class="feed-empty">
            <span>Words will appear here...</span>
          </div>
        </div>
      </section>
    </main>

    <!-- Bottom Input Area -->
    <footer class="game-footer">
      <!-- My Words Chips -->
      <div class="my-words-row">
        <span class="my-words-label">My Words: {{ submittedWords.length }}</span>
        <div class="my-words-chips">
          <span 
            v-for="word in submittedWords.slice(-5)" 
            :key="word"
            class="my-word-chip"
          >
            {{ word }}
          </span>
        </div>
      </div>
      
      <!-- Input -->
      <div class="input-wrapper" :class="{ success: showResultAnimation }">
        <input 
          v-model="wordInput"
          type="text"
          class="word-input"
          placeholder="Type a word..."
          :disabled="!isRoundActive"
          @keyup.enter="submitWord"
          maxlength="20"
        />
        <button 
          class="submit-btn"
          :disabled="!canSubmit"
          @click="submitWord"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
      
      <!-- Result Feedback -->
      <Transition name="fade">
        <div v-if="lastResult" class="result-feedback" :class="{ success: lastResult.ok, error: !lastResult.ok }">
          <template v-if="lastResult.ok">
            <span>"{{ lastResult.word }}" +{{ lastResult.points }} points!</span>
          </template>
          <template v-else>
            <span>{{ getResultMessage(lastResult.reason) }}</span>
          </template>
        </div>
      </Transition>
    </footer>

    <!-- Floating Power-ups (Right Side) -->
    <div class="floating-powerups">
      <button 
        class="powerup-btn freeze"
        :class="{ available: powerUps.freeze > 0 }"
        :disabled="powerUps.freeze <= 0 || !isRoundActive"
        @click="usePowerUp('freeze')"
      >
        <span class="powerup-icon">❄️</span>
        <span class="powerup-count">{{ powerUps.freeze }}</span>
      </button>
      <button 
        class="powerup-btn burn"
        :class="{ available: powerUps.burn > 0 }"
        :disabled="powerUps.burn <= 0 || !isRoundActive"
        @click="usePowerUp('burn')"
      >
        <span class="powerup-icon">🔥</span>
        <span class="powerup-count">{{ powerUps.burn }}</span>
      </button>
    </div>

    <!-- Chat Panel (Slide-in) -->
    <Transition name="chat-slide">
      <div v-if="showChatPanel" class="chat-panel">
        <div class="chat-header">
          <h3>Game Chat</h3>
          <button class="chat-close-btn" @click="toggleChat">✕</button>
        </div>
        
        <div class="chat-messages" ref="chatRef">
          <div 
            v-for="msg in chatMessages" 
            :key="msg.id"
            class="chat-message"
            :class="{ isYou: msg.playerId === store.playerId }"
          >
            <span class="msg-player">{{ msg.playerName }}</span>
            <p class="msg-text">{{ msg.message }}</p>
          </div>
          <div v-if="chatMessages.length === 0" class="chat-empty">
            <span>No messages yet...</span>
          </div>
        </div>
        
        <div class="chat-input-area">
          <input 
            v-model="chatInput"
            type="text"
            class="chat-input"
            placeholder="Type a message..."
            maxlength="200"
            @keyup.enter="sendChatMessage"
          >
          <button class="chat-send-btn" @click="sendChatMessage" :disabled="!chatInput.trim()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 2L9 11M18 2l-7 16-3-7-7-3 17-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Decorative doodles -->
    <svg class="deco doodle-top" width="60" height="40" viewBox="0 0 60 40">
      <path d="M5 20 Q 20 5, 35 20 T 55 20" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>
    <svg class="deco doodle-bottom" width="40" height="40" viewBox="0 0 40 40">
      <path d="M20 5 L 23 17 L 35 20 L 23 23 L 20 35 L 17 23 L 5 20 L 17 17 Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>

    <!-- Freeze Overlay -->
    <Transition name="freeze">
      <div v-if="isFrozen" class="freeze-overlay">
        <div class="freeze-content">
          <span class="freeze-icon">❄️</span>
          <h2>FROZEN!</h2>
          <p>by {{ frozenBy }}</p>
        </div>
      </div>
    </Transition>

    <!-- Pressure/Encouragement Message -->
    <Transition name="pressure">
      <div v-if="showPressureMessage && pressureMessage" class="pressure-message">
        <span>{{ pressureMessage }}</span>
      </div>
    </Transition>

    <!-- Quit Button -->
    <button class="quit-btn" @click="showQuitModal = true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>

    <!-- Quit Confirmation Modal -->
    <Transition name="modal">
      <div v-if="showQuitModal" class="modal-overlay" @click.self="showQuitModal = false">
        <div class="modal-content">
          <h3 class="modal-title">Leave Game?</h3>
          <p class="modal-text">Are you sure you want to quit? Your progress will be lost.</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="showQuitModal = false">Stay</button>
            <button class="modal-btn confirm" @click="quitGame">Quit</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Power-up Awarded Notification -->
    <Transition name="powerup-notif">
      <div v-if="showPowerUpNotification" class="powerup-notification" :class="showPowerUpNotification.type">
        <span class="notif-icon">{{ showPowerUpNotification.type === 'freeze' ? '❄️' : '🔥' }}</span>
        <span class="notif-text">+1 {{ showPowerUpNotification.type.toUpperCase() }}</span>
        <span class="notif-reason">{{ showPowerUpNotification.reason }}</span>
      </div>
    </Transition>

    <!-- Burn Effect Notification -->
    <Transition name="burn-effect">
      <div v-if="showBurnEffect" class="burn-effect-overlay">
        <div class="burn-content">
          <span class="burn-icon">🔥</span>
          <p><strong>{{ showBurnEffect.usedBy }}</strong> burned <strong>{{ showBurnEffect.target }}</strong></p>
          <span class="burn-points">-{{ showBurnEffect.pointsLost }} points</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.game-page {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-paper);
  overflow: hidden;
  position: relative;
}

/* Header */
.game-header {
  flex-shrink: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-paper);
  border-bottom: 2px solid var(--pencil-dark);
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.round-info, .score-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.round-label, .score-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.75rem;
  color: var(--pencil-light);
}

.round-number, .score-value {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.1rem, 3vw, 1.4rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Chat button */
.chat-btn {
  position: relative;
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-dark);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--pencil-dark);
  transition: transform 0.2s;
}

.chat-btn:hover {
  transform: scale(1.1);
}

.chat-btn.hasUnread {
  background: var(--pencil-light);
}

.chat-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  background: #c41e3a;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* Mini Leaderboard */
.mini-leaderboard {
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
}

.mini-entry {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--bg-paper-dark);
  border-radius: 10px;
  font-size: 0.8rem;
}

.mini-entry.isYou {
  background: rgba(135, 206, 250, 0.3);
  border: 1px solid var(--pencil-dark);
}

.mini-rank {
  font-family: 'Caveat', cursive;
  font-weight: 700;
  color: var(--pencil-dark);
}

.mini-name {
  font-family: 'Patrick Hand', cursive;
  color: var(--pencil-medium);
}

.mini-score {
  font-family: 'Caveat', cursive;
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Main Game Area */
.game-main {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-sm);
}

/* Source Word Section */
.source-word-section {
  text-align: center;
  padding: var(--spacing-sm);
}

/* Footer */
.game-footer {
  flex-shrink: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-paper);
  border-top: 2px solid var(--pencil-dark);
}

.my-words-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
  flex-wrap: wrap;
}

.my-words-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-medium);
}

.my-words-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.my-word-chip {
  font-family: 'Caveat', cursive;
  font-size: 0.85rem;
  padding: 2px 8px;
  background: var(--bg-paper-dark);
  border-radius: 10px;
  color: var(--pencil-dark);
}

.input-wrapper {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xs);
}

/* Floating Power-ups (Right Side like COD) */
.floating-powerups {
  position: fixed;
  right: var(--spacing-sm);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  z-index: 50;
}

.powerup-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 2px solid var(--pencil-light);
  border-radius: 20px;
  background: var(--bg-paper);
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.5;
}

.powerup-btn.available {
  opacity: 1;
  border-color: var(--pencil-dark);
}

.powerup-btn.freeze.available {
  background: rgba(135, 206, 250, 0.2);
}

.powerup-btn.burn.available {
  background: rgba(255, 165, 0, 0.2);
}

.powerup-btn:disabled {
  cursor: not-allowed;
}

.powerup-btn:not(:disabled):hover {
  transform: scale(1.1);
}

.powerup-icon {
  font-size: 1rem;
}

.powerup-count {
  font-family: 'Caveat', cursive;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Pressure Message */
.pressure-message {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border-radius: 20px;
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  font-weight: 700;
  z-index: 60;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: pressure-bounce 0.5s ease;
}

@keyframes pressure-bounce {
  0% { transform: translateX(-50%) translateY(20px); opacity: 0; }
  50% { transform: translateX(-50%) translateY(-10px); }
  100% { transform: translateX(-50%) translateY(0); opacity: 1; }
}

/* Quit Button */
.quit-btn {
  position: fixed;
  top: var(--spacing-md);
  left: var(--spacing-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: transparent;
  border: 2px solid var(--pencil-light);
  border-radius: 10px;
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  transition: all 0.2s;
  z-index: 50;
}

.quit-btn:hover {
  border-color: #c41e3a;
  color: #c41e3a;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: var(--spacing-md);
}

.modal-content {
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  padding: var(--spacing-lg);
  max-width: 320px;
  text-align: center;
}

.modal-title {
  font-family: 'Caveat', cursive;
  font-size: 2rem;
  color: var(--pencil-dark);
  margin: 0 0 var(--spacing-sm);
}

.modal-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  margin: 0 0 var(--spacing-md);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.modal-btn {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 2px solid var(--pencil-dark);
  border-radius: 10px;
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn.cancel {
  background: var(--bg-paper);
  color: var(--pencil-dark);
}

.modal-btn.confirm {
  background: #c41e3a;
  border-color: #c41e3a;
  color: white;
}

.modal-btn:hover {
  transform: scale(1.05);
}

/* Pressure transition */
.pressure-enter-active {
  animation: pressure-bounce 0.5s ease;
}

.pressure-leave-active {
  transition: opacity 0.3s ease;
}

.pressure-leave-to {
  opacity: 0;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Guess Mode Section */
.guess-section {
  padding: var(--spacing-md);
  text-align: center;
  background: var(--bg-paper);
}

.puzzle-display {
  margin: var(--spacing-md) 0;
}

.puzzle-letters {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 700;
  color: var(--pencil-dark);
  letter-spacing: 0.3em;
}

.hint-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.hint-label {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.hint-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
}

.solved-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(76, 175, 80, 0.2);
  border-radius: 20px;
  animation: solved-pop 0.3s ease;
}

.solved-icon {
  font-size: 1.5rem;
}

.solved-text {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  color: #4caf50;
}

@keyframes solved-pop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Memory Mode Section */
.memory-section {
  padding: var(--spacing-md);
  text-align: center;
  background: var(--bg-paper);
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.memory-words-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  justify-content: center;
  margin: var(--spacing-md) 0;
  max-width: 400px;
}

.memory-word-chip {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-dark);
  border-radius: 15px;
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--pencil-dark);
  animation: memory-pop 0.3s ease forwards;
  opacity: 0;
}

@keyframes memory-pop {
  0% { opacity: 0; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(1); }
}

.memory-timer {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  color: var(--pencil-light);
  margin-top: var(--spacing-md);
}

.memory-recall-info {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  color: var(--pencil-dark);
  margin-top: var(--spacing-sm);
}

/* Scramble Mode Section */
.scramble-section {
  padding: var(--spacing-md);
  text-align: center;
  background: var(--bg-paper);
}

.scrambled-display {
  margin: var(--spacing-md) 0;
  padding: var(--spacing-lg);
  background: var(--bg-paper-dark);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
}

.scrambled-letters {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3.5rem);
}

/* Teaser Mode Section */
.teaser-section {
  padding: var(--spacing-md);
  text-align: center;
  background: var(--bg-paper);
}

.riddle-display {
  margin: var(--spacing-md) 0;
  padding: var(--spacing-lg);
  background: var(--bg-paper-dark);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.riddle-text {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.3rem, 5vw, 2rem);
  color: var(--pencil-dark);
  line-height: 1.5;
  margin: 0;
}

.riddle-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.hint-icon {
  font-size: 1.2rem;
}

.hint-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--pencil-mid);
}

/* Timer */
.timer-section {
  display: flex;
  justify-content: center;
}

.timer-circle {
  position: relative;
  width: 70px;
  height: 70px;
}

.timer-circle svg {
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
}

.timer-bg {
  fill: none;
  stroke: var(--pencil-light);
  stroke-width: 4;
  opacity: 0.3;
}

.timer-progress {
  fill: none;
  stroke: var(--pencil-dark);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 283;
  transition: stroke-dashoffset 1s linear;
}

.timer-section.low .timer-progress {
  stroke: #c41e3a;
  animation: pulse-timer 0.5s ease-in-out infinite;
}

@keyframes pulse-timer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.timer-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Caveat', cursive;
  font-size: clamp(1.2rem, 3vw, 1.5rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

.timer-section.low .timer-text {
  color: #c41e3a;
  animation: pulse-timer 0.5s ease-in-out infinite;
}

/* Source Word */
.source-word-section {
  padding: var(--spacing-md);
  text-align: center;
  flex-shrink: 0;
}

.section-title {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  margin-bottom: var(--spacing-sm);
}

.source-word-display {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.source-word-text {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 700;
  color: var(--pencil-dark);
  letter-spacing: 0.15em;
  text-decoration: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--pencil-light);
}

.used-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

/* Input Section */
.input-section {
  padding: 0 var(--spacing-md) var(--spacing-md);
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  gap: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border: 3px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: 4px;
  transition: all 0.2s;
}

.input-wrapper.success {
  border-color: #2e7d32;
  animation: success-pulse 0.3s ease;
}

@keyframes success-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

.word-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: var(--spacing-sm) var(--spacing-md);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-xl);
  color: var(--pencil-dark);
  outline: none;
  text-transform: lowercase;
}

.word-input::placeholder {
  color: var(--pencil-faint);
}

.word-input:disabled {
  opacity: 0.5;
}

.submit-btn {
  width: 50px;
  height: 50px;
  border: none;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s;
  flex-shrink: 0;
}

.submit-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Result Feedback */
.result-feedback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: 20px;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
}

.result-feedback.success {
  background: rgba(46, 125, 50, 0.1);
  color: #2e7d32;
}

.result-feedback.error {
  background: rgba(196, 30, 58, 0.1);
  color: #c41e3a;
}

/* Live Word Feed */
.word-feed-section {
  flex: 1;
  padding: 0 var(--spacing-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 120px;
  max-height: 200px;
}

.word-feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) 0;
  border-bottom: 1px dashed var(--pencil-faint);
  margin-bottom: var(--spacing-xs);
}

.feed-title {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-mid);
}

.feed-count {
  background: var(--pencil-faint);
  color: var(--bg-paper);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.word-feed {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  padding: var(--spacing-xs) 0;
  scrollbar-width: thin;
  scrollbar-color: var(--pencil-faint) transparent;
}

.word-feed::-webkit-scrollbar {
  width: 4px;
}

.word-feed::-webkit-scrollbar-track {
  background: transparent;
}

.word-feed::-webkit-scrollbar-thumb {
  background: var(--pencil-faint);
  border-radius: 4px;
}

.feed-item {
  animation: feed-in 0.3s ease;
}

.feed-bubble {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 12px;
  background: var(--bg-paper-dark);
  border-radius: 12px 12px 12px 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.feed-item.isYou .feed-bubble {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border-radius: 12px 12px 4px 12px;
  border-left: 3px solid #4caf50;
}

@keyframes feed-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feed-player {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.8rem;
  color: var(--pencil-mid);
  min-width: 50px;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-item.isYou .feed-player {
  color: #2e7d32;
  font-weight: 600;
}

.feed-word {
  flex: 1;
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--pencil-dark);
  text-transform: uppercase;
}

.feed-points {
  font-family: 'Caveat', cursive;
  font-size: 0.9rem;
  color: #4caf50;
  font-weight: 700;
  background: rgba(76, 175, 80, 0.1);
  padding: 2px 6px;
  border-radius: 8px;
}

.feed-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pencil-faint);
  font-family: 'Patrick Hand', cursive;
  font-style: italic;
}

/* My Words Compact */
.my-words-compact {
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 2px dashed var(--pencil-light);
  flex-shrink: 0;
}

.my-words-label {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  display: block;
  margin-bottom: 4px;
}

.my-words-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.my-word-chip {
  display: inline-block;
  padding: 2px 8px;
  background: var(--bg-paper-dark);
  border: 1px solid var(--pencil-light);
  border-radius: 10px;
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-dark);
}

/* Feed item transition */
.feed-item-enter-active {
  transition: all 0.3s ease;
}

.feed-item-leave-active {
  transition: all 0.2s ease;
}

.feed-item-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.feed-item-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* Leaderboard */
.leaderboard-section {
  padding: var(--spacing-md);
  border-top: 2px solid var(--pencil-dark);
  background: var(--bg-paper);
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 10px;
}

.leaderboard-item.isYou {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
}

.rank {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Caveat', cursive;
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
}

.leaderboard-item:nth-child(1) .rank {
  background: #ffd700;
  color: #1a1a1a;
}

.leaderboard-item:nth-child(2) .rank {
  background: #c0c0c0;
  color: #1a1a1a;
}

.leaderboard-item:nth-child(3) .rank {
  background: #cd7f32;
  color: #1a1a1a;
}

.player-name {
  flex: 1;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
}

.player-score {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Decorative doodles */
.deco {
  position: absolute;
  color: var(--pencil-light);
  opacity: 0.2;
  pointer-events: none;
}

.doodle-top {
  top: 5%;
  right: 3%;
  animation: float 6s ease-in-out infinite;
}

.doodle-bottom {
  bottom: 15%;
  left: 3%;
  animation: float 8s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
}

/* Freeze Overlay */
.freeze-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(135, 206, 250, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.freeze-content {
  text-align: center;
  animation: freeze-pulse 0.5s ease infinite;
}

.freeze-icon {
  font-size: 4rem;
  display: block;
  animation: freeze-shake 0.3s ease infinite;
}

.freeze-content h2 {
  font-family: 'Caveat', cursive;
  font-size: 3rem;
  color: #1a5276;
  margin: 0;
}

.freeze-content p {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.5rem;
  color: #2874a6;
}

@keyframes freeze-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes freeze-shake {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}

/* Power-up Notification */
.powerup-notification {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  text-align: center;
  z-index: 101;
  animation: powerup-pop 0.3s ease;
}

.powerup-notification.freeze {
  border-color: #3498db;
  background: rgba(135, 206, 250, 0.9);
}

.powerup-notification.burn {
  border-color: #e74c3c;
  background: rgba(255, 165, 0, 0.9);
}

.notif-icon {
  font-size: 2rem;
  display: block;
}

.notif-text {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--pencil-dark);
  display: block;
}

.notif-reason {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: var(--pencil-light);
  display: block;
}

@keyframes powerup-pop {
  0% { transform: translate(-50%, -50%) scale(0); }
  50% { transform: translate(-50%, -50%) scale(1.2); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

/* Burn Effect Overlay */
.burn-effect-overlay {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-md) var(--spacing-lg);
  background: rgba(255, 100, 50, 0.9);
  border: 3px solid #c0392b;
  border-radius: 20px;
  text-align: center;
  z-index: 101;
  animation: burn-slide 0.3s ease;
}

.burn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.burn-icon {
  font-size: 2rem;
}

.burn-content p {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  color: white;
  margin: 0;
}

.burn-content strong {
  color: #fff;
}

.burn-points {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
}

@keyframes burn-slide {
  0% { transform: translateX(-50%) translateY(-20px); opacity: 0; }
  100% { transform: translateX(-50%) translateY(0); opacity: 1; }
}

/* Freeze transition */
.freeze-enter-active {
  animation: freeze-in 0.3s ease;
}

.freeze-leave-active {
  animation: freeze-out 0.3s ease;
}

@keyframes freeze-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes freeze-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Power-up notification transition */
.powerup-notif-enter-active {
  animation: powerup-pop 0.3s ease;
}

.powerup-notif-leave-active {
  transition: opacity 0.2s ease;
}

.powerup-notif-leave-to {
  opacity: 0;
}

/* Burn effect transition */
.burn-effect-enter-active {
  animation: burn-slide 0.3s ease;
}

.burn-effect-leave-active {
  transition: opacity 0.2s ease;
}

.burn-effect-leave-to {
  opacity: 0;
}

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.list-enter-active, .list-leave-active {
  transition: all 0.3s ease;
}

/* Chat Panel */
.chat-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 300px;
  max-width: 80vw;
  height: 100%;
  background: var(--bg-paper);
  border-left: 3px solid var(--pencil-dark);
  display: flex;
  flex-direction: column;
  z-index: 200;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 2px solid var(--pencil-dark);
  background: var(--bg-paper-dark);
}

.chat-header h3 {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  margin: 0;
  color: var(--pencil-dark);
}

.chat-close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--pencil-dark);
  padding: 4px 8px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.chat-message {
  padding: 6px 10px;
  background: var(--bg-paper-dark);
  border-radius: 10px;
}

.chat-message.isYou {
  background: rgba(46, 125, 50, 0.1);
  border-left: 3px solid #2e7d32;
}

.msg-player {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.8rem;
  color: var(--pencil-light);
  display: block;
}

.msg-text {
  font-family: 'Caveat', cursive;
  font-size: 1rem;
  color: var(--pencil-dark);
  margin: 2px 0;
  word-break: break-word;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pencil-faint);
  font-family: 'Patrick Hand', cursive;
  font-style: italic;
}

.chat-input-area {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border-top: 2px solid var(--pencil-light);
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid var(--pencil-light);
  border-radius: 20px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  background: var(--bg-paper);
  color: var(--pencil-dark);
}

.chat-input:focus {
  outline: none;
  border-color: var(--pencil-dark);
}

.chat-send-btn {
  background: var(--pencil-dark);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--bg-paper);
  transition: transform 0.2s;
}

.chat-send-btn:hover:not(:disabled) {
  transform: scale(1.1);
}

.chat-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Chat slide transition */
.chat-slide-enter-active {
  animation: slide-in-right 0.3s ease;
}

.chat-slide-leave-active {
  animation: slide-in-right 0.3s ease reverse;
}

@keyframes slide-in-right {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Responsive */
@media (min-width: 640px) {
  .game-page {
    max-width: 500px;
    margin: 0 auto;
  }
}
</style>
