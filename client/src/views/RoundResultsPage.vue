<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import type { RoundEndEvent } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()

// Round results data
const roundIndex = ref(0)
const totalRounds = ref(7)
const sourceWord = ref('')
const totalWordsSubmitted = ref(0)
const leaderboard = ref<Array<{
  playerId: string
  playerName: string
  roundPoints: number
  totalPoints: number
  bestWord: string | null
  bestWordPoints: number
}>>([])

// Correct answer for unsolved rounds (guess/scramble/teaser)
const correctAnswer = ref<string | null>(null)
const gameMode = ref<'classic' | 'guess' | 'scramble' | 'teaser' | null>(null)

// Ready state for next round
const playersReady = ref<Set<string>>(new Set())
const showCountdown = ref(false)
const countdownNumber = ref(3)

// Quit modal
const showQuitModal = ref(false)

const myResult = computed(() => {
  return leaderboard.value.find(l => l.playerId === store.playerId)
})

const myRank = computed(() => {
  return leaderboard.value.findIndex(l => l.playerId === store.playerId) + 1
})

const roundWinner = computed(() => {
  if (leaderboard.value.length === 0) return null
  // Check for tie - multiple players with same round points
  const topScore = leaderboard.value[0].roundPoints
  const tiedPlayers = leaderboard.value.filter(l => l.roundPoints === topScore)
  if (tiedPlayers.length > 1) return null // Tie/draw
  return leaderboard.value[0]
})

const isDraw = computed(() => {
  if (leaderboard.value.length < 2) return false
  const topScore = leaderboard.value[0].roundPoints
  const tiedPlayers = leaderboard.value.filter(l => l.roundPoints === topScore)
  return tiedPlayers.length > 1
})

const noWinner = computed(() => {
  return leaderboard.value.length === 0 || leaderboard.value.every(l => l.roundPoints === 0)
})

const tiedPlayers = computed(() => {
  if (!isDraw.value) return []
  const topScore = leaderboard.value[0].roundPoints
  return leaderboard.value.filter(l => l.roundPoints === topScore)
})

const isWinner = computed(() => {
  return roundWinner.value?.playerId === store.playerId
})

const allPlayersReady = computed(() => {
  if (!store.roomState) return false
  const connectedPlayers = store.roomState.players.filter(p => p.connected)
  return connectedPlayers.every(p => playersReady.value.has(p.id)) && connectedPlayers.length > 0
})

const iAmReady = computed(() => {
  return store.playerId ? playersReady.value.has(store.playerId) : false
})

const connectedPlayers = computed(() => {
  return store.roomState?.players.filter(p => p.connected) || []
})

const readyProgress = computed(() => {
  return `${playersReady.value.size}/${connectedPlayers.value.length}`
})

// Setup socket listeners
const setupSocketListeners = () => {
  const socket = store.getSocket()
  if (!socket) return

  // Remove existing listeners first to prevent duplicates
  socket.off('round:end')
  socket.off('player:ready')
  socket.off('game:countdown')
  socket.off('round:start')
  socket.off('game:end')

  socket.on('round:end', (data: RoundEndEvent) => {
    roundIndex.value = data.roundIndex
    sourceWord.value = data.roundStats.sourceWord
    totalWordsSubmitted.value = data.roundStats.totalWordsSubmitted
    leaderboard.value = data.leaderboard
    correctAnswer.value = data.correctAnswer || null
    gameMode.value = data.gameMode || null
    playersReady.value = new Set()
  })

  socket.on('player:ready', (data: { playerId: string; playerName: string }) => {
    playersReady.value.add(data.playerId)
  })

  socket.on('game:countdown', (data: { count: number }) => {
    showCountdown.value = true
    countdownNumber.value = data.count
  })

  socket.on('round:start', () => {
    showCountdown.value = false
    router.push('/room/game')
  })

  socket.on('game:end', () => {
    router.push('/room/final')
  })
}

const toggleReady = () => {
  if (iAmReady.value) return
  
  const socket = store.getSocket()
  if (!socket) return
  
  socket.emit('player:ready')
  playersReady.value.add(store.playerId!)
}

const quitGame = () => {
  showQuitModal.value = false
  store.disconnectSocket()
  store.reset()
  router.push('/')
}

const formatPoints = (points: number): string => {
  if (points === 0) return '0'
  if (points > 0) return `+${points}`
  return `-${Math.abs(points)}`
}

onMounted(() => {
  setupSocketListeners()
  
  // Initialize from store data if available (set by GamePage before navigation)
  if (store.roundEndData) {
    roundIndex.value = store.roundEndData.roundIndex
    sourceWord.value = store.roundEndData.roundStats.sourceWord
    totalWordsSubmitted.value = store.roundEndData.roundStats.totalWordsSubmitted
    leaderboard.value = store.roundEndData.leaderboard
    correctAnswer.value = store.roundEndData.correctAnswer || null
    gameMode.value = store.roundEndData.gameMode || null
    playersReady.value = new Set()
  }
  
  // Initialize total rounds from store
  totalRounds.value = store.roomState?.settings.rounds || 7
})

// Watch for all players ready to start countdown
watch(allPlayersReady, (ready) => {
  if (ready && !showCountdown.value) {
    const socket = store.getSocket()
    if (socket && store.roomState?.hostPlayerId === store.playerId) {
      // Only host emits the round:next to start countdown
      socket.emit('round:next')
    }
  }
})

onUnmounted(() => {
  // Don't disconnect socket
})
</script>

<template>
  <div class="results-page">
    <!-- Compact Header -->
    <header class="results-header">
      <div class="header-left">
        <button class="quit-btn-small" @click="showQuitModal = true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
      <div class="header-center">
        <span class="round-badge">Round {{ roundIndex + 1 }}/{{ totalRounds }}</span>
      </div>
      <div class="header-right"></div>
    </header>

    <!-- Time's Up Banner -->
    <div class="times-up-banner">
      <span class="times-up-text">⏱️ Time's Up!</span>
    </div>

    <!-- Correct Answer (when nobody solved in guess/scramble/teaser) -->
    <section v-if="correctAnswer && gameMode !== 'classic'" class="answer-reveal-section">
      <div class="answer-reveal-card">
        <span class="answer-label">The answer was:</span>
        <span class="answer-word">{{ correctAnswer.toUpperCase() }}</span>
      </div>
    </section>

    <!-- Winner Spotlight (Compact) -->
    <section v-if="noWinner" class="winner-section">
      <div class="no-winner-card">
        <span class="no-winner-icon">🤷</span>
        <span class="no-winner-text">No winner this round</span>
        <span class="no-winner-sub">Nobody scored points</span>
      </div>
    </section>
    <section v-else-if="isDraw" class="winner-section">
      <div class="draw-card">
        <span class="draw-icon">🤝</span>
        <span class="draw-text">It's a Draw!</span>
        <div class="tied-players">
          <span v-for="player in tiedPlayers" :key="player.playerId" class="tied-player">
            {{ player.playerName }} ({{ player.roundPoints }} pts)
          </span>
        </div>
      </div>
    </section>
    <section v-else-if="roundWinner" class="winner-section">
      <div class="winner-card" :class="{ isMe: isWinner }">
        <div class="winner-left">
          <div class="winner-crown">👑</div>
          <div class="winner-avatar">
            <span class="avatar-letter">{{ roundWinner.playerName.charAt(0).toUpperCase() }}</span>
          </div>
        </div>
        <div class="winner-right">
          <span class="winner-name">{{ isWinner ? 'You' : roundWinner.playerName }} Won!</span>
          <div class="winner-stats">
            <span class="winner-points">{{ roundWinner.roundPoints }} pts this round</span>
            <span v-if="roundWinner.bestWord" class="winner-best">Best: {{ roundWinner.bestWord }} (+{{ roundWinner.bestWordPoints }})</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Source Word (Compact) -->
    <section class="source-section">
      <span class="source-label">Source word:</span>
      <span class="source-word">{{ sourceWord.toUpperCase() }}</span>
      <span class="total-words">{{ totalWordsSubmitted }} words found</span>
    </section>

    <!-- My Result (Compact - if not winner) -->
    <section v-if="myResult && !isWinner" class="my-result-section">
      <div class="my-result-card">
        <div class="my-rank">#{{ myRank }}</div>
        <div class="my-stats">
          <span class="my-round-points">{{ formatPoints(myResult.roundPoints) }} pts</span>
          <span class="my-total">Total: {{ myResult.totalPoints }}</span>
        </div>
        <div v-if="myResult.bestWord" class="my-best">Best: {{ myResult.bestWord }}</div>
      </div>
    </section>

    <!-- Leaderboard (Compact) -->
    <section class="leaderboard-section">
      <h2 class="section-title">Standings</h2>
      <div class="leaderboard-list">
        <div 
          v-for="(entry, index) in leaderboard" 
          :key="entry.playerId"
          class="leaderboard-item"
          :class="{ isYou: entry.playerId === store.playerId }"
        >
          <div class="item-rank" :class="`rank-${index + 1}`">
            <span v-if="index === 0">🥇</span>
            <span v-else-if="index === 1">🥈</span>
            <span v-else-if="index === 2">🥉</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          
          <div class="item-info">
            <span class="item-name">
              {{ entry.playerName }}
              <span v-if="entry.playerId === store.playerId" class="you-tag">(You)</span>
            </span>
          </div>
          
          <div class="item-points">
            <span class="item-round">{{ formatPoints(entry.roundPoints) }}</span>
          </div>
          
          <div class="item-total">
            <span>{{ entry.totalPoints }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Ready Up Section (Fixed Bottom) -->
    <section class="ready-section">
      <div class="ready-status">
        <div class="ready-avatars">
          <div 
            v-for="player in connectedPlayers.slice(0, 6)" 
            :key="player.id"
            class="ready-avatar"
            :class="{ isReady: playersReady.has(player.id), isYou: player.id === store.playerId }"
          >
            <span class="avatar-letter">{{ player.name.charAt(0).toUpperCase() }}</span>
            <div v-if="playersReady.has(player.id)" class="ready-check">✓</div>
          </div>
        </div>
        <span class="ready-count">{{ readyProgress }} ready</span>
      </div>

      <button 
        class="ready-btn"
        :class="{ isReady: iAmReady }"
        @click="toggleReady"
        :disabled="iAmReady"
      >
        <span v-if="iAmReady">✓ Ready!</span>
        <span v-else>Ready for Next Round</span>
      </button>
    </section>

    <!-- Countdown Overlay -->
    <Transition name="countdown">
      <div v-if="showCountdown" class="countdown-overlay">
        <div class="countdown-number">{{ countdownNumber }}</div>
        <p class="countdown-text">Get Ready!</p>
      </div>
    </Transition>

    <!-- Quit Confirmation Modal -->
    <Transition name="modal">
      <div v-if="showQuitModal" class="modal-overlay" @click.self="showQuitModal = false">
        <div class="modal-content">
          <h3 class="modal-title">Leave Game?</h3>
          <p class="modal-text">Are you sure you want to quit?</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="showQuitModal = false">Stay</button>
            <button class="modal-btn confirm" @click="quitGame">Quit</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.results-page {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-paper);
  overflow-y: auto;
  position: relative;
  padding: var(--spacing-sm);
  padding-bottom: 140px;
  gap: var(--spacing-sm);
}

/* Header */
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
}

.quit-btn-small {
  padding: var(--spacing-xs);
  background: transparent;
  border: 2px solid var(--pencil-light);
  border-radius: 8px;
  color: var(--pencil-light);
  cursor: pointer;
  transition: all 0.2s;
}

.quit-btn-small:hover {
  border-color: #c41e3a;
  color: #c41e3a;
}

.round-badge {
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--pencil-dark);
  background: var(--bg-paper-dark);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: 15px;
}

/* Time's Up Banner */
.times-up-banner {
  text-align: center;
  padding: var(--spacing-sm);
  background: var(--pencil-dark);
  border-radius: 15px;
}

.times-up-text {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--bg-paper);
}

/* Answer Reveal Section */
.answer-reveal-section {
  text-align: center;
  padding: var(--spacing-md);
}

.answer-reveal-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md) var(--spacing-lg);
  background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%);
  border: 3px solid #ffc107;
  border-radius: 20px;
  animation: reveal-pop 0.5s ease;
}

@keyframes reveal-pop {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}

.answer-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: #856404;
}

.answer-word {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.8rem, 6vw, 2.5rem);
  font-weight: 700;
  color: #856404;
  letter-spacing: 0.1em;
}

/* Winner Section */
.winner-section {
  text-align: center;
}

.no-winner-card, .draw-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  background: var(--bg-paper);
  border: 2px solid var(--pencil-light);
  border-radius: 15px;
}

.no-winner-icon, .draw-icon {
  font-size: 2rem;
}

.no-winner-text, .draw-text {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.no-winner-sub {
  font-size: 0.9rem;
  color: var(--pencil-mid);
}

.tied-players {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  justify-content: center;
  margin-top: var(--spacing-xs);
}

.tied-player {
  background: var(--bg-paper);
  border: 1px solid var(--pencil-light);
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 0.85rem;
}

.winner-card {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: linear-gradient(135deg, #fff9c4 0%, #fff59d 100%);
  border: 2px solid #ffc107;
  border-radius: 15px;
}

.winner-card.isMe {
  background: linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%);
  border-color: #4caf50;
}

.winner-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.winner-crown {
  font-size: 1.5rem;
}

.winner-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pencil-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-letter {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  color: var(--bg-paper);
  font-weight: 700;
}

.winner-right {
  text-align: left;
}

.winner-name {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--pencil-dark);
  display: block;
}

.winner-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.winner-points {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-dark);
}

.winner-best {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.8rem;
  color: var(--pencil-light);
}

/* Source Section */
.source-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 10px;
  flex-wrap: wrap;
}

.source-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-light);
}

.source-word {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--pencil-dark);
  letter-spacing: 0.1em;
}

.total-words {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-light);
  background: var(--bg-paper);
  padding: 2px 8px;
  border-radius: 10px;
}

/* My Result */
.my-result-section {
  padding: 0 var(--spacing-sm);
}

.my-result-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  border-radius: 12px;
}

.my-rank {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.my-stats {
  display: flex;
  flex-direction: column;
}

.my-round-points {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.my-total {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.my-best {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-medium);
  margin-left: auto;
}

/* Leaderboard */
.leaderboard-section {
  flex: 1;
  min-height: 0;
}

.section-title {
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  color: var(--pencil-dark);
  margin: 0 0 var(--spacing-xs);
  padding: 0 var(--spacing-sm);
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 8px;
}

.leaderboard-item.isYou {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
}

.item-rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.95rem;
  color: var(--pencil-dark);
}

.you-tag {
  font-size: 0.8rem;
  color: var(--pencil-light);
  margin-left: 4px;
}

.item-points {
  text-align: right;
}

.item-round {
  font-family: 'Caveat', cursive;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.item-total {
  font-family: 'Caveat', cursive;
  font-size: 0.95rem;
  color: var(--pencil-medium);
  min-width: 30px;
  text-align: right;
}

/* Ready Section */
.ready-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-paper);
  border-top: 2px solid var(--pencil-dark);
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  z-index: 100;
}

.ready-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.ready-avatars {
  display: flex;
  gap: 4px;
}

.ready-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ready-avatar.isReady {
  border-color: #4caf50;
  background: #c8e6c9;
}

.ready-avatar.isYou {
  border-color: var(--pencil-dark);
}

.ready-avatar .avatar-letter {
  font-size: 0.9rem;
}

.ready-check {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #4caf50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  font-weight: 700;
}

.ready-count {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-light);
}

.ready-btn {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--pencil-dark);
  border: none;
  border-radius: 12px;
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--bg-paper);
  cursor: pointer;
  transition: all 0.2s;
}

.ready-btn:disabled {
  cursor: default;
}

.ready-btn.isReady {
  background: #4caf50;
}

/* Countdown Overlay */
.countdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.countdown-number {
  font-family: 'Caveat', cursive;
  font-size: 8rem;
  font-weight: 700;
  color: var(--bg-paper);
  animation: countdown-pulse 1s ease-in-out infinite;
}

@keyframes countdown-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.countdown-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.5rem;
  color: var(--bg-paper);
  margin: 0;
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
  z-index: 300;
  padding: var(--spacing-md);
}

.modal-content {
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  padding: var(--spacing-lg);
  max-width: 280px;
  text-align: center;
}

.modal-title {
  font-family: 'Caveat', cursive;
  font-size: 1.8rem;
  color: var(--pencil-dark);
  margin: 0 0 var(--spacing-xs);
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
  font-size: 1.1rem;
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

/* Transitions */
.countdown-enter-active,
.countdown-leave-active {
  transition: opacity 0.3s ease;
}

.countdown-enter-from,
.countdown-leave-to {
  opacity: 0;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Responsive */
@media (min-width: 640px) {
  .results-page {
    max-width: 500px;
    margin: 0 auto;
  }
}
</style>
