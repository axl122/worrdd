<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import type { GameEndEvent } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()

// Final results data
const leaderboard = ref<Array<{
  playerId: string
  playerName: string
  totalPoints: number
}>>([])

const winner = ref<{
  playerId: string
  playerName: string
  totalPoints: number
} | null>(null)

const isDraw = ref(false)

// Quit modal
const showQuitModal = ref(false)

const myRank = computed(() => {
  return leaderboard.value.findIndex(l => l.playerId === store.playerId) + 1
})

const isHost = computed(() => {
  return store.roomState?.hostPlayerId === store.playerId
})

const isWinner = computed(() => {
  return winner.value?.playerId === store.playerId
})

// Setup socket listeners
const setupSocketListeners = () => {
  const socket = store.getSocket()
  if (!socket) return

  // Remove existing listeners first to prevent duplicates
  socket.off('game:end')
  socket.off('room:state')

  socket.on('game:end', (data: GameEndEvent) => {
    leaderboard.value = data.finalLeaderboard || []
    winner.value = data.winner
    isDraw.value = data.isDraw || false
  })

  socket.on('room:state', () => {
    // Game reset, go to lobby
    router.push('/room')
  })
}

onMounted(() => {
  // First, check if we already have data from store (set before navigation)
  if (store.gameEndData) {
    leaderboard.value = store.gameEndData.finalLeaderboard || []
    winner.value = store.gameEndData.winner
    isDraw.value = store.gameEndData.isDraw || false
  }
  
  setupSocketListeners()
})

const playAgain = () => {
  const socket = store.getSocket()
  if (!socket || !isHost.value) return
  socket.emit('game:playAgain')
}

const goToLobby = () => {
  // Go back to the room lobby (stay in same room)
  router.push('/room')
}

const backToMenu = () => {
  showQuitModal.value = false
  store.disconnectSocket()
  store.reset()
  router.push('/menu')
}

onUnmounted(() => {
  // Don't disconnect socket
})
</script>

<template>
  <div class="final-page">
    <!-- Draw Section -->
    <section class="winner-section draw-section" v-if="isDraw && !winner">
      <div class="draw-icon">
        <span>🤝</span>
      </div>
      
      <h1 class="draw-title">It's a Draw!</h1>
      
      <div class="tied-players-final">
        <div v-for="entry in leaderboard.filter(p => p.totalPoints === leaderboard[0]?.totalPoints)" :key="entry.playerId" class="tied-player-final">
          <span class="tied-name">{{ entry.playerName }}</span>
          <span class="tied-score">{{ entry.totalPoints }} pts</span>
        </div>
      </div>
    </section>

    <!-- Winner Celebration -->
    <section class="winner-section" v-else-if="winner">
      <div class="confetti">
        <span v-for="i in 20" :key="i" class="confetti-piece" :style="{ '--delay': `${Math.random() * 3}s`, '--x': `${Math.random() * 100}%` }"></span>
      </div>
      
      <div class="crown-icon">
        <svg width="80" height="60" viewBox="0 0 80 60">
          <path d="M10 50 L10 20 L25 35 L40 10 L55 35 L70 20 L70 50 Z" stroke="currentColor" stroke-width="3" fill="none"/>
          <circle cx="10" cy="20" r="4" fill="currentColor"/>
          <circle cx="40" cy="10" r="4" fill="currentColor"/>
          <circle cx="70" cy="20" r="4" fill="currentColor"/>
        </svg>
      </div>
      
      <h1 class="winner-title">
        <template v-if="isWinner">You Win!</template>
        <template v-else>{{ winner.playerName }} Wins!</template>
      </h1>
      
      <div class="winner-score">
        <span class="score-number">{{ winner.totalPoints }}</span>
        <span class="score-label">points</span>
      </div>
    </section>

    <!-- My Result -->
    <section v-if="myRank > 0" class="my-result-section">
      <div class="my-result-card" :class="{ winner: isWinner }">
        <div class="result-rank">
          <span class="rank-label">Final Rank</span>
          <span class="rank-number">#{{ myRank }}</span>
        </div>
        
        <div class="result-score">
          <span class="score-label">Your Score</span>
          <span class="score-value">{{ store.currentPlayer?.score || 0 }}</span>
        </div>
      </div>
    </section>

    <!-- Final Leaderboard -->
    <section class="leaderboard-section">
      <h2 class="section-title">Final Standings</h2>
      <div class="leaderboard-list">
        <div 
          v-for="(entry, index) in leaderboard" 
          :key="entry.playerId"
          class="leaderboard-item"
          :class="{ 
            isYou: entry.playerId === store.playerId, 
            isWinner: entry.playerId === winner?.playerId,
            topThree: index < 3 
          }"
        >
          <div class="item-rank" :class="`rank-${index + 1}`">
            <span>{{ index + 1 }}</span>
          </div>
          
          <div class="item-info">
            <span class="item-name">
              {{ entry.playerName }}
              <span v-if="entry.playerId === store.playerId" class="you-tag">(You)</span>
              <span v-if="entry.playerId === winner?.playerId" class="winner-tag">👑</span>
            </span>
          </div>
          
          <div class="item-score">
            <span class="score-number">{{ entry.totalPoints }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Actions -->
    <section class="action-section">
      <button 
        v-if="isHost"
        class="sketch-btn play-again-btn"
        @click="playAgain"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Play Again
      </button>
      
      <button class="sketch-btn secondary" @click="goToLobby">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Lobby
      </button>
      
      <button class="sketch-btn secondary menu-btn" @click="showQuitModal = true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3h14v14H3z"/>
          <path d="M7 7h6M7 10h6M7 13h4"/>
        </svg>
        Main Menu
      </button>
    </section>

    <!-- Quit Confirmation Modal -->
    <Transition name="modal">
      <div v-if="showQuitModal" class="modal-overlay" @click.self="showQuitModal = false">
        <div class="modal-content">
          <h3 class="modal-title">Return to Menu?</h3>
          <p class="modal-text">Are you sure you want to leave? The game will end for everyone.</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="showQuitModal = false">Stay</button>
            <button class="modal-btn confirm" @click="backToMenu">Leave</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Decorative -->
    <svg class="deco doodle-1" width="60" height="40" viewBox="0 0 60 40">
      <path d="M5 20 Q 20 5, 35 20 T 55 20" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>
    <svg class="deco doodle-2" width="40" height="40" viewBox="0 0 40 40">
      <path d="M20 5 L 23 17 L 35 20 L 23 23 L 20 35 L 17 23 L 5 20 L 17 17 Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
  </div>
</template>

<style scoped>
.final-page {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-paper);
  overflow-y: auto;
  position: relative;
  padding-bottom: var(--spacing-lg);
}

/* Winner Section */
.winner-section {
  text-align: center;
  padding: var(--spacing-lg) var(--spacing-md);
  position: relative;
  overflow: hidden;
}

.confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.confetti-piece {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--pencil-dark);
  left: var(--x);
  top: -20px;
  opacity: 0;
  animation: confetti-fall 3s linear var(--delay) infinite;
}

.confetti-piece:nth-child(odd) {
  border-radius: 50%;
}

.confetti-piece:nth-child(3n) {
  background: #ffd700;
}

.confetti-piece:nth-child(4n) {
  background: var(--pencil-light);
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.crown-icon {
  color: #ffd700;
  margin-bottom: var(--spacing-sm);
  animation: bounce-crown 1s ease-in-out infinite;
}

@keyframes bounce-crown {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-10px) scale(1.1); }
}

.winner-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(2.5rem, 10vw, 4rem);
  font-weight: 700;
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.winner-score {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.winner-score .score-number {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Draw Section */
.draw-section {
  background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
}

.draw-icon {
  font-size: 4rem;
  margin-bottom: var(--spacing-sm);
  animation: pulse-draw 1.5s ease-in-out infinite;
}

@keyframes pulse-draw {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.draw-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(2.5rem, 10vw, 4rem);
  font-weight: 700;
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-md);
}

.tied-players-final {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  align-items: center;
}

.tied-player-final {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--bg-paper);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 12px;
  border: 2px solid var(--pencil-mid);
}

.tied-name {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  color: var(--pencil-dark);
}

.tied-score {
  font-family: 'Caveat', cursive;
  font-size: 1rem;
  color: var(--pencil-mid);
}

.winner-score .score-label {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

/* My Result */
.my-result-section {
  padding: 0 var(--spacing-md) var(--spacing-md);
}

.my-result-card {
  background: var(--bg-paper-dark);
  border: 3px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: var(--spacing-md);
  display: flex;
  justify-content: space-around;
  align-items: center;
}

.my-result-card.winner {
  border-color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
}

.result-rank, .result-score {
  text-align: center;
}

.rank-label, .score-label {
  display: block;
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-light);
}

.rank-number {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

.score-value {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Leaderboard */
.leaderboard-section {
  padding: var(--spacing-md);
  flex: 1;
}

.section-title {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-xl);
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 15px 5px 15px 5px;
}

.leaderboard-item.isYou {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
}

.leaderboard-item.isWinner {
  border-left: 4px solid #ffd700;
}

.leaderboard-item.topThree {
  border-left: 4px solid var(--pencil-dark);
}

.item-rank {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  flex-shrink: 0;
}

.item-rank.rank-1 {
  background: #ffd700;
  color: #1a1a1a;
}

.item-rank.rank-2 {
  background: #c0c0c0;
  color: #1a1a1a;
}

.item-rank.rank-3 {
  background: #cd7f32;
  color: #1a1a1a;
}

.item-info {
  flex: 1;
}

.item-name {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
}

.you-tag {
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.winner-tag {
  margin-left: var(--spacing-sm);
}

.item-score {
  text-align: right;
}

.item-score .score-number {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--pencil-dark);
}

/* Actions */
.action-section {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: center;
}

.play-again-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xl);
  padding: var(--spacing-sm) var(--spacing-lg);
}

.menu-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-base);
  background: var(--bg-paper-dark);
}

/* Decorative */
.deco {
  position: absolute;
  color: var(--pencil-light);
  opacity: 0.2;
  pointer-events: none;
}

.doodle-1 {
  top: 15%;
  right: 5%;
  animation: float 6s ease-in-out infinite;
}

.doodle-2 {
  bottom: 25%;
  left: 5%;
  animation: float 8s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
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

/* Modal transition */
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
  .final-page {
    max-width: 500px;
    margin: 0 auto;
  }
}
</style>
