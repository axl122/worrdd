<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()
const showHowToPlay = ref(false)

// Hint popup system
const showHint = ref(false)
const currentHint = ref('')
const hintTimeout = ref<number | null>(null)
const hintInterval = ref<number | null>(null)

// Chat system
const showChatPopup = ref(false)
const showChatView = ref(false)
const friends = ref<Array<{ id: string; name: string; online: boolean }>>([])
const selectedFriend = ref<{ id: string; name: string; online?: boolean } | null>(null)
const messages = ref<Array<{ id: string; from: string; to: string; text: string; timestamp: number }>>([])
const newMessage = ref('')
const chatContainerRef = ref<HTMLElement | null>(null)

// Game invite
const showGameInvite = ref(false)

const unreadCount = computed(() => store.getUnreadCount)
const pendingInvite = computed(() => store.pendingGameInvite)
const waitingForFriend = computed(() => store.waitingForFriend)

const hints = [
  // Classic mode
  { text: 'CLASSIC: Make words from source word letters!', icon: '📝' },
  { text: 'Longer words score more points!', icon: '💡' },
  { text: 'Use ALL letters for a +8 bonus!', icon: '⚡' },
  { text: 'First to claim a word owns it!', icon: '🎯' },
  { text: '7+ letter words = 11 points!', icon: '🏆' },
  { text: '6 letters = 7 points!', icon: '✨' },
  { text: 'Letters can be reused!', icon: '🔤' },
  // Guess mode
  { text: 'GUESS: Fill in the blanks to find the word!', icon: '❓' },
  { text: 'Guess mode: First to solve wins!', icon: '�' },
  { text: 'Use hints wisely in Guess mode!', icon: '💡' },
  // Scramble mode
  { text: 'SCRAMBLE: Unscramble the letters!', icon: '🔀' },
  { text: 'Scramble mode: Race to unscramble first!', icon: '⚡' },
  // Teaser mode
  { text: 'TEASER: Solve the riddle!', icon: '🧩' },
  { text: 'Teaser mode: Think outside the box!', icon: '🧠' },
  // Power-ups
  { text: 'Freeze power-up: 5 words in a round!', icon: '❄️' },
  { text: 'Burn power-up: 10+ point word!', icon: '🔥' },
  // General
  { text: 'Need 2+ players to start!', icon: '🤝' },
  { text: 'Timer can be 30-180 seconds!', icon: '⏱️' },
  { text: 'Host controls game settings!', icon: '🎮' },
  { text: 'Works on mobile too!', icon: '📱' },
  { text: 'Think fast, type faster!', icon: '🧠' },
  { text: '4 game modes to choose from!', icon: '🎲' },
  { text: 'Join a room with a code!', icon: '🚪' },
  { text: 'Add friends to play together!', icon: '👥' },
]

const showRandomHint = () => {
  if (showHowToPlay.value) return // Don't show hint if modal is open
  
  const randomHint = hints[Math.floor(Math.random() * hints.length)]
  currentHint.value = randomHint.text
  showHint.value = true
  
  // Hide after 3 seconds
  if (hintTimeout.value) clearTimeout(hintTimeout.value)
  hintTimeout.value = window.setTimeout(() => {
    showHint.value = false
  }, 3000)
}

const startGame = () => {
  router.push('/room')
}

const showJoinForm = () => {
  router.push('/room?join=true')
}

const toggleHowToPlay = () => {
  showHowToPlay.value = !showHowToPlay.value
  if (showHowToPlay.value) {
    showHint.value = false // Hide hint when modal opens
  }
}

const goToFriends = () => {
  router.push('/friends')
}

// Chat handling
const toggleChat = () => {
  showChatPopup.value = !showChatPopup.value
  if (showChatPopup.value) {
    const socket = store.getSocket()
    if (socket) {
      socket.emit('friends:getList')
    }
  }
}

const openChatWithFriend = (friend: { id: string; name: string; online?: boolean }) => {
  const socket = store.getSocket()
  if (!socket) return
  
  selectedFriend.value = friend
  showChatView.value = true
  store.clearUnreadMessages(friend.id)
  socket.emit('messages:get', { friendId: friend.id })
}

const closeChatView = () => {
  showChatView.value = false
  selectedFriend.value = null
  messages.value = []
}

const sendMessage = () => {
  const socket = store.getSocket()
  if (!socket || !newMessage.value.trim() || !selectedFriend.value) return
  
  socket.emit('messages:send', { 
    to: selectedFriend.value.id, 
    text: newMessage.value.trim() 
  })
  
  newMessage.value = ''
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Notification handling (removed - now using chat)

const acceptGameInvite = () => {
  if (pendingInvite.value) {
    const socket = store.getSocket()
    if (socket) {
      socket.emit('friends:acceptGame', { 
        roomCode: pendingInvite.value.roomCode,
        fromId: pendingInvite.value.fromId 
      })
    }
    store.clearGameInvite()
    showGameInvite.value = false
  }
}

const declineGameInvite = () => {
  if (pendingInvite.value) {
    const socket = store.getSocket()
    if (socket) {
      socket.emit('friends:declineGame', { 
        roomCode: pendingInvite.value.roomCode,
        fromId: pendingInvite.value.fromId 
      })
    }
    store.clearGameInvite()
    showGameInvite.value = false
  }
}

const cancelWaiting = () => {
  store.setWaitingForFriend(null)
}

onMounted(() => {
  // Ensure socket is connected
  const socket = store.ensureSocket()
  
  // Listen for player ID from server
  socket.on('player:id', (data: string | { id: string; name: string }) => {
    if (typeof data === 'string') {
      store.setPlayerInfo(data, store.playerName || 'Player')
    } else {
      // Use the name from server data
      store.setPlayerInfo(data.id, data.name)
    }
  })
  
  // Listen for room state (when joining via friend game)
  socket.on('room:state', (data: { roomCode: string; hostPlayerId: string; players: any[]; settings: any; phase: string }) => {
    store.setRoomState({
      roomCode: data.roomCode,
      hostPlayerId: data.hostPlayerId,
      players: data.players,
      settings: data.settings,
      phase: data.phase as 'lobby' | 'round' | 'round_results' | 'game_over'
    })
    // Navigate to room page
    router.push('/room')
  })
  
  // Listen for new messages
  socket.on('messages:new', (data: { message: { id: string; from: string; to: string; text: string; timestamp: number } }) => {
    // If chat is open with this friend, add to messages
    if (showChatView.value && selectedFriend.value?.id === data.message.from) {
      messages.value.push(data.message)
      // Scroll to bottom
      setTimeout(() => {
        if (chatContainerRef.value) {
          chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
        }
      }, 10)
    } else {
      // Add to unread
      store.addUnreadMessage({
        fromId: data.message.from,
        fromName: '',
        text: data.message.text,
        timestamp: data.message.timestamp,
        count: 1
      })
    }
  })
  
  // Listen for friends list
  socket.on('friends:list', (data: { friends: Array<{ id: string; name: string; online: boolean }> }) => {
    friends.value = data.friends
  })
  
  // Listen for messages list
  socket.on('messages:list', (data: { messages: Array<{ id: string; from: string; to: string; text: string; timestamp: number }> }) => {
    messages.value = data.messages
    // Scroll to bottom
    setTimeout(() => {
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
      }
    }, 10)
  })
  
  // Listen for game invites
  socket.on('friends:gameInvite', (data: { from: string; fromId: string; roomCode: string }) => {
    store.addGameInvite({
      fromId: data.fromId,
      fromName: data.from,
      roomCode: data.roomCode,
      timestamp: Date.now()
    })
    showGameInvite.value = true
  })
  
  // Listen for game creation (host)
  socket.on('friends:gameCreated', (data: { roomCode: string; hostName: string }) => {
    store.setWaitingForFriend({ friendName: '', roomCode: data.roomCode })
    router.push(`/room/${data.roomCode}`)
  })
  
  // Listen for game accepted
  socket.on('friends:gameAccepted', (data: { roomCode: string; isHost?: boolean }) => {
    store.setWaitingForFriend(null)
    if (!data.isHost) {
      // Friend - join the existing room (host is already in via server)
      socket.emit('room:join', { 
        roomCode: data.roomCode,
        name: store.playerName || 'Player'
      })
    }
    // Host is already in the room - room:state was sent by server
  })
  
  // Listen for game declined
  socket.on('friends:gameDeclined', () => {
    store.setWaitingForFriend(null)
    store.setError('Friend declined the game invite')
  })
  
  // Show first hint after 5 seconds
  setTimeout(showRandomHint, 5000)
  
  // Then show random hints every 12-20 seconds
  const scheduleNextHint = () => {
    const delay = 12000 + Math.random() * 8000
    hintInterval.value = window.setTimeout(() => {
      showRandomHint()
      scheduleNextHint()
    }, delay)
  }
  scheduleNextHint()
})

onUnmounted(() => {
  const socket = store.getSocket()
  if (socket) {
    socket.off('player:id')
    socket.off('room:state')
    socket.off('messages:new')
    socket.off('messages:list')
    socket.off('friends:list')
    socket.off('friends:gameInvite')
    socket.off('friends:gameCreated')
    socket.off('friends:gameAccepted')
    socket.off('friends:gameDeclined')
  }
  if (hintTimeout.value) clearTimeout(hintTimeout.value)
  if (hintInterval.value) clearTimeout(hintInterval.value)
})
</script>

<template>
  <div class="menu-container">
    <!-- Chat Icon (top right) -->
    <div class="chat-icon-btn" @click="toggleChat">
      <svg class="chat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span v-if="unreadCount > 0" class="notification-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </div>
    
    <!-- Chat Popup (Friends List) -->
    <div v-if="showChatPopup && !showChatView" class="chat-popup">
      <div class="chat-popup-header">
        <span>Messages</span>
        <button class="close-btn" @click="showChatPopup = false">✕</button>
      </div>
      <div v-if="friends.length === 0" class="no-friends">
        <p>No friends yet</p>
        <button class="add-friends-btn" @click="router.push('/friends'); showChatPopup = false">Add Friends</button>
      </div>
      <div v-else class="friends-list">
        <div 
          v-for="friend in friends" 
          :key="friend.id" 
          class="friend-item"
          @click="openChatWithFriend(friend)"
        >
          <div class="friend-avatar">{{ friend.name[0]?.toUpperCase() || '?' }}</div>
          <div class="friend-info">
            <span class="friend-name">{{ friend.name }}</span>
            <span class="friend-status" :class="{ online: friend.online }">
              {{ friend.online ? 'Online' : 'Offline' }}
            </span>
          </div>
          <span v-if="store.unreadMessages.get(friend.id)?.count" class="unread-badge">
            {{ store.unreadMessages.get(friend.id)?.count }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- Chat View (Individual Chat) -->
    <div v-if="showChatView && selectedFriend" class="chat-view">
      <div class="chat-view-header">
        <button class="back-btn" @click="closeChatView">←</button>
        <div class="chat-friend-info">
          <span class="chat-friend-name">{{ selectedFriend.name }}</span>
          <span class="chat-friend-status" :class="{ online: selectedFriend.online }">
            {{ selectedFriend.online ? 'Online' : 'Offline' }}
          </span>
        </div>
        <button class="close-btn" @click="showChatPopup = false; closeChatView()">✕</button>
      </div>
      <div class="chat-messages" ref="chatContainerRef">
        <div 
          v-for="msg in messages" 
          :key="msg.id" 
          class="chat-message"
          :class="{ sent: msg.from !== selectedFriend.id }"
        >
          <span class="msg-text">{{ msg.text }}</span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div v-if="messages.length === 0" class="no-messages">
          Start a conversation!
        </div>
      </div>
      <div class="chat-input-area">
        <input 
          v-model="newMessage"
          type="text" 
          placeholder="Type a message..."
          @keyup.enter="sendMessage"
          class="chat-input"
        />
        <button class="send-btn" @click="sendMessage">Send</button>
      </div>
    </div>
    
    <!-- Game Invite Popup -->
    <div v-if="showGameInvite && pendingInvite" class="invite-popup">
      <div class="invite-content">
        <span class="invite-icon">🎮</span>
        <h3>Game Invite!</h3>
        <p>{{ pendingInvite.fromName }} wants to play with you</p>
        <div class="invite-buttons">
          <button class="accept-btn" @click="acceptGameInvite">Accept</button>
          <button class="decline-btn" @click="declineGameInvite">Decline</button>
        </div>
      </div>
    </div>
    
    <!-- Waiting for Friend Dialog -->
    <div v-if="waitingForFriend" class="waiting-popup">
      <div class="waiting-content">
        <span class="waiting-icon">⏳</span>
        <h3>Waiting for friend...</h3>
        <p>Room: {{ waitingForFriend.roomCode }}</p>
        <button class="cancel-btn" @click="cancelWaiting">Cancel</button>
      </div>
    </div>

    <!-- Decorative doodles -->
    <svg class="doodle doodle-1" width="60" height="60" viewBox="0 0 60 60">
      <path d="M10 30 Q 20 10, 30 30 T 50 30" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="15" cy="30" r="3" fill="#1a1a1a"/>
      <circle cx="45" cy="30" r="3" fill="#1a1a1a"/>
    </svg>

    <svg class="doodle doodle-2" width="50" height="50" viewBox="0 0 50 50">
      <path d="M25 5 L 30 20 L 45 20 L 33 30 L 38 45 L 25 35 L 12 45 L 17 30 L 5 20 L 20 20 Z" stroke="#1a1a1a" stroke-width="1.5" fill="none"/>
    </svg>

    <svg class="doodle doodle-3" width="40" height="40" viewBox="0 0 40 40">
      <path d="M20 5 Q 5 15, 20 35 Q 35 15, 20 5" stroke="#1a1a1a" stroke-width="2" fill="none"/>
    </svg>

    <svg class="doodle doodle-4" width="50" height="30" viewBox="0 0 50 30">
      <path d="M5 15 Q 15 5, 25 15 Q 35 25, 45 15" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>

    <!-- Title -->
    <div class="title-section">
      <h1 class="game-title">
        <span v-for="(letter, i) in 'WORRDD'" :key="i" class="title-letter" :style="{ animationDelay: `${i * 0.1}s` }">
          {{ letter }}
        </span>
        <span class="title-exclamation">!</span>
      </h1>
      <p class="tagline">~ The Word Battle Game ~</p>
    </div>

    <!-- Menu buttons -->
    <div class="menu-buttons">
      <button class="sketch-btn menu-btn" @click="startGame">
        <span class="btn-icon">▶</span>
        Start Game
      </button>

      <button class="sketch-btn menu-btn secondary" @click="goToFriends">
        <span class="btn-icon">👥</span>
        Friends
      </button>

      <button class="sketch-btn menu-btn secondary" @click="toggleHowToPlay">
        <span class="btn-icon">❓</span>
        How to Play
      </button>

      <button class="sketch-btn menu-btn secondary" @click="showJoinForm">
        <span class="btn-icon">🚪</span>
        Join Room
      </button>

      <!-- Dark Mode Toggle -->
      <div class="dark-mode-toggle">
        <label>🌙 Dark Mode</label>
        <button 
          class="toggle-btn" 
          :class="{ active: store.darkMode }"
          @click="store.toggleDarkMode()"
        >
          <span class="toggle-slider"></span>
          <span class="toggle-label">{{ store.darkMode ? 'ON' : 'OFF' }}</span>
        </button>
      </div>
    </div>

    <!-- Hint Popup -->
    <Transition name="hint-slide">
      <div v-if="showHint" class="hint-popup">
        <span class="hint-text">{{ currentHint }}</span>
      </div>
    </Transition>

    <!-- How to Play Modal -->
    <div v-if="showHowToPlay" class="modal-overlay" @click.self="toggleHowToPlay">
      <div class="modal-content sketch-border how-to-play-modal">
        <button class="close-btn" @click="toggleHowToPlay">✕</button>
        <h2 class="modal-title">How to Play</h2>
        
        <!-- Game Modes Section -->
        <div class="modes-section">
          <h3>🎮 Game Modes</h3>
          
          <div class="mode-info">
            <h4>📝 Classic Mode</h4>
            <p>A source word appears each round. Make words using ONLY its letters. First to claim a word owns it!</p>
          </div>
          
          <div class="mode-info">
            <h4>❓ Guess Mode</h4>
            <p>See a word with blanks like "A _ _ L E". Type the full word to win! First to guess correctly gets bonus points!</p>
          </div>
          
          <div class="mode-info">
            <h4>🔀 Scramble Mode</h4>
            <p>Letters are scrambled! Unscramble them to find the hidden word. Race against others!</p>
          </div>
          
          <div class="mode-info">
            <h4>🧩 Teaser Mode</h4>
            <p>Solve the riddle! Read the brain teaser and type your answer. Think outside the box!</p>
          </div>
        </div>

        <!-- Scoring Section -->
        <div class="scoring-section">
          <h3>📊 Scoring (Classic Mode)</h3>
          <div class="score-table">
            <div class="score-row"><span>3 letters</span><span class="points">1 pt</span></div>
            <div class="score-row"><span>4 letters</span><span class="points">2 pts</span></div>
            <div class="score-row"><span>5 letters</span><span class="points">4 pts</span></div>
            <div class="score-row"><span>6 letters</span><span class="points">7 pts</span></div>
            <div class="score-row"><span>7+ letters</span><span class="points">11 pts</span></div>
            <div class="score-row bonus"><span>Full word bonus</span><span class="points">+8 pts</span></div>
          </div>
        </div>

        <!-- Power-ups Section -->
        <div class="powerups-section">
          <h3>⚡ Power-ups</h3>
          <div class="powerup-info">
            <span class="powerup-icon">❄️</span>
            <span><strong>Freeze:</strong> 5 words in a round - Freezes opponent's timer!</span>
          </div>
          <div class="powerup-info">
            <span class="powerup-icon">🔥</span>
            <span><strong>Burn:</strong> 10+ point word - Burns opponent's points!</span>
          </div>
        </div>

        <!-- How to Connect Section -->
        <div class="connect-section">
          <h3>🔗 How to Play Together</h3>
          <div class="connect-steps">
            <p><strong>1. Start Game:</strong> Create a room and share the code with friends</p>
            <p><strong>2. Join Room:</strong> Enter a room code to join a friend's game</p>
            <p><strong>3. Friends:</strong> Add friends to easily play and message them</p>
            <p><strong>4. Need 2-10 players</strong> to start a game!</p>
          </div>
        </div>

        <p class="tip">Tip: Longer words = More points! 🎯</p>
      </div>
    </div>

    <!-- Creator credit -->
    <div class="creator-credit">
      <span class="credit-text">Created by</span>
      <span class="credit-name">Samathy</span>
      <svg class="heart-doodle" width="16" height="14" viewBox="0 0 20 18">
        <path d="M10 16 Q 5 12, 2 8 Q 0 5, 3 3 Q 6 1, 10 5 Q 14 1, 17 3 Q 20 5, 18 8 Q 15 12, 10 16 Z" stroke="#1a1a1a" stroke-width="1.5" fill="none"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.menu-container {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  padding: var(--spacing-md);
}

/* Decorative doodles */
.doodle {
  position: absolute;
  opacity: 0.2;
  pointer-events: none;
  width: clamp(30px, 8vw, 60px);
  height: auto;
}

.doodle-1 { top: 8%; left: 3%; animation: float 6s ease-in-out infinite; }
.doodle-2 { top: 12%; right: 5%; animation: float 8s ease-in-out infinite reverse; }
.doodle-3 { bottom: 18%; left: 6%; animation: float 7s ease-in-out infinite 1s; }
.doodle-4 { bottom: 12%; right: 3%; animation: float 5s ease-in-out infinite 0.5s; }

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(3deg); }
}

/* Title */
.title-section {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.game-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 12vw, 5rem);
  font-weight: 700;
  color: var(--pencil-dark);
  margin: 0;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1px;
}

.title-letter {
  display: inline-block;
  animation: bounce-in 0.5s ease forwards;
  opacity: 0;
  transform: translateY(-20px);
}

.title-letter:nth-child(odd) { transform: translateY(-20px) rotate(-5deg); }
.title-letter:nth-child(even) { transform: translateY(-20px) rotate(5deg); }

@keyframes bounce-in {
  0% { opacity: 0; transform: translateY(-20px) scale(0.5); }
  60% { transform: translateY(4px) scale(1.1); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
}

.title-exclamation {
  font-family: 'Caveat', cursive;
  font-size: clamp(2.5rem, 14vw, 6rem);
  color: var(--pencil-dark);
  animation: bounce-in 0.5s ease 0.6s forwards;
  opacity: 0;
}

.tagline {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  margin-top: var(--spacing-sm);
  letter-spacing: 1px;
}

/* Menu buttons */
.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: center;
  width: 100%;
  max-width: 280px;
}

.menu-btn {
  width: 100%;
  min-width: auto;
  max-width: 260px;
  font-size: var(--font-size-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.menu-btn.secondary {
  background: var(--bg-paper-dark);
}

.btn-icon {
  font-size: clamp(1rem, 3vw, 1.2rem);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  animation: fade-in 0.3s ease;
  padding: var(--spacing-md);
}

.modal-content {
  background: var(--bg-paper);
  padding: var(--spacing-lg);
  max-width: 400px;
  width: 100%;
  position: relative;
  animation: slide-up 0.3s ease;
  max-height: 90vh;
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  background: none;
  border: none;
  font-size: var(--font-size-xl);
  cursor: pointer;
  color: var(--pencil-medium);
  font-family: 'Caveat', cursive;
  transition: transform 0.2s;
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  transform: scale(1.2);
}

.modal-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.8rem, 6vw, 2.5rem);
  text-align: center;
  margin-bottom: var(--spacing-md);
  color: var(--pencil-dark);
}

.rules-list {
  margin-bottom: var(--spacing-md);
}

.rule-item {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
}

.rule-number {
  font-family: 'Caveat', cursive;
  font-weight: 700;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
  flex-shrink: 0;
}

.scoring-section {
  background: var(--bg-paper-dark);
  padding: var(--spacing-sm);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  margin-bottom: var(--spacing-sm);
}

.scoring-section h3 {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-lg);
  text-align: center;
  margin-bottom: var(--spacing-sm);
}

/* How to Play Modal Styles */
.how-to-play-modal {
  max-height: 80vh;
  overflow-y: auto;
}

.modes-section,
.powerups-section,
.connect-section {
  background: var(--bg-paper-dark);
  padding: var(--spacing-sm);
  border-radius: 12px;
  margin-bottom: var(--spacing-sm);
}

.modes-section h3,
.powerups-section h3,
.connect-section h3 {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-lg);
  margin-bottom: var(--spacing-sm);
}

.mode-info {
  margin-bottom: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px dashed var(--pencil-light);
}

.mode-info:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.mode-info h4 {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  margin-bottom: 4px;
}

.mode-info p,
.connect-steps p {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.95rem;
  margin: 0;
  line-height: 1.4;
}

.powerup-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
  font-family: 'Patrick Hand', cursive;
  font-size: 0.95rem;
}

.powerup-icon {
  font-size: 1.2rem;
}

.connect-steps p {
  margin-bottom: var(--spacing-xs);
}

.score-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-row {
  display: flex;
  justify-content: space-between;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  padding: 2px var(--spacing-sm);
}

.score-row.bonus {
  border-top: 2px dashed var(--pencil-light);
  padding-top: var(--spacing-sm);
  margin-top: 4px;
  color: var(--pencil-dark);
  font-weight: 600;
}

.points {
  font-family: 'Caveat', cursive;
  font-weight: 700;
}

.tip {
  text-align: center;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-medium);
}

/* Creator credit */
.creator-credit {
  position: absolute;
  bottom: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.credit-text {
  font-family: 'Patrick Hand', cursive;
  font-size: clamp(0.8rem, 2.5vw, 1rem);
  color: var(--pencil-light);
}

.credit-name {
  font-family: 'Caveat', cursive;
  font-size: clamp(1rem, 3vw, 1.3rem);
  font-weight: 700;
  color: var(--pencil-dark);
  position: relative;
}

.credit-name::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10'%3E%3Cpath d='M0 5 Q 25 2, 50 5 T 100 5' stroke='%231a1a1a' stroke-width='2' fill='none'/%3E%3C/svg%3E") repeat-x;
  background-size: 40px 4px;
}

.heart-doodle {
  margin-left: 2px;
  width: clamp(12px, 3vw, 16px);
  height: auto;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Hint Popup */
.hint-popup {
  position: fixed;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  padding: var(--spacing-sm) var(--spacing-md);
  max-width: 300px;
  z-index: 50;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
}

.hint-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
}

/* Hint transition */
.hint-slide-enter-active {
  animation: hint-in 0.4s ease;
}

.hint-slide-leave-active {
  animation: hint-out 0.3s ease;
}

@keyframes hint-in {
  0% {
    opacity: 0;
    transform: translateY(-50%) translateX(100%);
  }
  100% {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

@keyframes hint-out {
  0% {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-50%) translateX(100%);
  }
}

/* Chat Icon */
.chat-icon-btn {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  cursor: pointer;
  padding: var(--spacing-sm);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--bg-secondary);
  border-radius: 50%;
  transition: background 0.2s;
}

.chat-icon-btn:hover {
  background: var(--bg-tertiary);
}

.chat-icon-svg {
  width: 24px;
  height: 24px;
  color: var(--text-primary);
}

.notification-badge {
  position: absolute;
  top: 0;
  right: 0;
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: bold;
}

/* Chat Popup */
.chat-popup {
  position: absolute;
  top: 50px;
  right: var(--spacing-md);
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  border-radius: 12px;
  width: 280px;
  max-height: 350px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
}

.chat-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 2px solid var(--pencil-light);
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--pencil-mid);
}

.no-friends {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--pencil-mid);
  font-family: 'Patrick Hand', cursive;
}

.no-friends p {
  margin-bottom: var(--spacing-sm);
}

.add-friends-btn {
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
}

.friends-list {
  display: flex;
  flex-direction: column;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  border-bottom: 1px solid var(--pencil-light);
}

.friend-item:hover {
  background: var(--bg-paper-dark);
}

.friend-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
}

.friend-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.friend-name {
  font-family: 'Patrick Hand', cursive;
  font-weight: bold;
  font-size: 1rem;
}

.friend-status {
  font-family: 'Caveat', cursive;
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.friend-status.online {
  color: #22c55e;
}

.unread-badge {
  background: #ef4444;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: bold;
}

/* Chat View */
.chat-view {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 350px;
  background: var(--bg-paper);
  border-left: 3px solid var(--pencil-dark);
  z-index: 200;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 10px rgba(0,0,0,0.1);
}

.chat-view-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 2px solid var(--pencil-dark);
  background: var(--bg-paper-dark);
}

.back-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--pencil-dark);
}

.chat-friend-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-friend-name {
  font-family: 'Patrick Hand', cursive;
  font-weight: bold;
  font-size: 1.1rem;
}

.chat-friend-status {
  font-family: 'Caveat', cursive;
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.chat-friend-status.online {
  color: #22c55e;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.chat-message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-paper-dark);
}

.chat-message.sent {
  align-self: flex-end;
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.msg-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  word-break: break-word;
}

.msg-time {
  display: block;
  font-size: 0.7rem;
  color: var(--pencil-light);
  margin-top: 4px;
}

.chat-message.sent .msg-time {
  color: var(--bg-paper-dark);
}

.no-messages {
  text-align: center;
  color: var(--pencil-light);
  font-family: 'Patrick Hand', cursive;
  padding: var(--spacing-lg);
}

.chat-input-area {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 2px solid var(--pencil-light);
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid var(--pencil-dark);
  border-radius: 20px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  background: var(--bg-paper);
  color: var(--pencil-dark);
}

.chat-input:focus {
  outline: none;
  border-color: var(--pencil-medium);
}

.send-btn {
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
}

.send-btn:hover {
  background: var(--pencil-medium);
}

/* Game Invite Popup */
.invite-popup, .waiting-popup {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.invite-content, .waiting-content {
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  padding: var(--spacing-lg);
  text-align: center;
  max-width: 300px;
  animation: pop-in 0.3s ease;
}

@keyframes pop-in {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.invite-icon, .waiting-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--spacing-sm);
}

.invite-content h3, .waiting-content h3 {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  margin-bottom: var(--spacing-sm);
}

.invite-content p, .waiting-content p {
  font-family: 'Patrick Hand', cursive;
  margin-bottom: var(--spacing-md);
}

.invite-buttons {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
}

.accept-btn, .decline-btn, .cancel-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: 10px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  cursor: pointer;
  border: 2px solid var(--pencil-dark);
}

.accept-btn {
  background: #22c55e;
  color: white;
  border-color: #22c55e;
}

.decline-btn, .cancel-btn {
  background: var(--bg-paper);
  color: var(--pencil-dark);
}

/* Dark Mode Toggle */
.dark-mode-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  margin-top: 16px;
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
}

.dark-mode-toggle label {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--pencil-dark);
}

.toggle-btn {
  position: relative;
  width: 60px;
  height: 32px;
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-dark);
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.toggle-btn.active {
  background: var(--pencil-dark);
}

.toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  background: var(--bg-paper);
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-btn.active .toggle-slider {
  transform: translateX(28px);
}

.toggle-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Patrick Hand', cursive;
  font-size: 0.75rem;
  color: var(--pencil-dark);
}

.toggle-btn.active .toggle-label {
  color: var(--bg-paper);
}
</style>
