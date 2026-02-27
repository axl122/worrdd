<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import type { RoomStateEvent, RoundStartEvent } from '@/stores/gameStore'

const router = useRouter()
const route = useRoute()
const store = useGameStore()

// Local state
const viewMode = ref<'select' | 'create' | 'join' | 'lobby'>('select')
const playerNameInput = ref('')
const roomCodeInput = ref('')
const copiedCode = ref(false)
const errorMessage = ref('')

// Chat state
const showChat = ref(false)
const chatMessages = ref<Array<{ id: string; playerId: string; playerName: string; message: string; timestamp: number }>>([])
const chatInput = ref('')
const unreadCount = ref(0)
const chatRef = ref<HTMLElement | null>(null)

// Leave confirmation modal
const showLeaveModal = ref(false)

// Game countdown
const showCountdown = ref(false)
const countdownNumber = ref(3)

// Player left notification
const showPlayerLeftNotification = ref('')
let playerLeftTimeout: number | null = null

// Settings (host configurable)
const settings = ref({
  rounds: 7,
  roundSeconds: 60,
  gameMode: 'classic' as 'classic' | 'guess' | 'scramble' | 'teaser',
  // Classic mode settings
  minLen: 3,
  fullBonusEnabled: true
})

// Computed
const canStartGame = computed(() => {
  const players = store.roomState?.players || []
  const connected = players.filter(p => p.connected)
  if (connected.length < 2 || connected.length > 10) return false
  
  // All connected non-host players must be ready
  return connected.every(p => p.isHost || p.isReady)
})

const isHost = computed(() => {
    return store.roomState?.hostPlayerId === store.playerId
  })

const myPlayer = computed(() => {
  return store.roomState?.players.find(p => p.id === store.playerId)
})

// Methods
const connectSocket = () => {
  const socket = store.connectSocket()
  if (!socket) return

  // Remove existing listeners first to prevent duplicates
  socket.off('connect')
  socket.off('disconnect')
  socket.off('error')
  socket.off('player:id')
  socket.off('game:countdown')
  socket.off('room:state')
  socket.off('round:start')
  socket.off('round:end')
  socket.off('game:end')
  socket.off('chat:message')

  socket.on('connect', () => {
    console.log('Connected to server')
    store.setConnected(true)
  })

  socket.on('disconnect', () => {
    console.log('Disconnected from server')
    store.setConnected(false)
  })

  socket.on('error', (data: { message: string }) => {
    errorMessage.value = data.message
    setTimeout(() => {
      errorMessage.value = ''
    }, 3000)
  })

  socket.on('player:id', (data: string | { id: string; name: string }) => {
    if (typeof data === 'string') {
      store.setPlayerInfo(data, playerNameInput.value)
    } else {
      store.setPlayerInfo(data.id, data.name)
    }
  })

  socket.on('game:countdown', (data: { count: number }) => {
    showCountdown.value = true
    countdownNumber.value = data.count
  })

  socket.on('room:state', (data: RoomStateEvent) => {
    // Check if a player left (only if we were already in lobby)
    if (store.roomState && viewMode.value === 'lobby') {
      const previousPlayers = store.roomState.players.map(p => p.id)
      const currentPlayers = data.players.map(p => p.id)
      const leftPlayers = previousPlayers.filter(id => !currentPlayers.includes(id))
      
      if (leftPlayers.length > 0) {
        // Show notification for the first player that left
        const leftPlayer = store.roomState.players.find(p => p.id === leftPlayers[0])
        if (leftPlayer) {
          showPlayerLeftNotification.value = leftPlayer.name
          if (playerLeftTimeout) clearTimeout(playerLeftTimeout)
          playerLeftTimeout = window.setTimeout(() => {
            showPlayerLeftNotification.value = ''
          }, 3000)
        }
      }
    }
    
    store.setRoomState({
      roomCode: data.roomCode,
      hostPlayerId: data.hostPlayerId,
      players: data.players,
      settings: data.settings,
      phase: data.phase
    })
    
    settings.value = { ...data.settings }
    viewMode.value = 'lobby'
  })

  socket.on('game:state', () => {
    showCountdown.value = false
    router.push('/room/game')
  })

  socket.on('round:start', (data: RoundStartEvent) => {
    showCountdown.value = false
    store.setCurrentRound({
      roundIndex: data.roundIndex,
      sourceWord: data.sourceWord,
      startedAt: data.startedAt,
      endsAt: data.endsAt,
      usedWordsGlobal: [],
      submissionsByPlayerId: {},
      scoresByPlayerId: {}
    })
    router.push('/room/game')
  })

  socket.on('round:end', () => {
    router.push('/room/results')
  })

  socket.on('game:end', () => {
    router.push('/room/final')
  })

  // Chat messages
  socket.on('chat:message', (data: { id: string; playerId: string; playerName: string; message: string; timestamp: number }) => {
    chatMessages.value.push(data)
    
    // Keep only last 50 messages
    if (chatMessages.value.length > 50) {
      chatMessages.value.shift()
    }
    
    // Increment unread if chat is closed
    if (!showChat.value) {
      unreadCount.value++
    } else {
      // Scroll to bottom if chat is open
      setTimeout(() => {
        if (chatRef.value) {
          chatRef.value.scrollTop = chatRef.value.scrollHeight
        }
      }, 10)
    }
  })
}

const showCreateForm = () => {
  viewMode.value = 'create'
  playerNameInput.value = ''
  connectSocket()
}

const showJoinForm = () => {
  viewMode.value = 'join'
  roomCodeInput.value = route.params.code as string || ''
  connectSocket()
}

const createRoom = () => {
  if (!playerNameInput.value.trim()) return
  const socket = store.getSocket()
  if (!socket) return
  
  socket.emit('room:create', { name: playerNameInput.value.trim() })
}

const joinRoom = () => {
  if (!playerNameInput.value.trim() || !roomCodeInput.value.trim()) return
  const socket = store.getSocket()
  if (!socket) return
  
  socket.emit('room:join', { 
    roomCode: roomCodeInput.value.trim().toUpperCase(),
    name: playerNameInput.value.trim() 
  })
}

const copyRoomCode = async () => {
  const code = store.roomState?.roomCode || ''
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = true
    setTimeout(() => {
      copiedCode.value = false
    }, 2000)
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = code
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    copiedCode.value = true
    setTimeout(() => {
      copiedCode.value = false
    }, 2000)
  }
}

const updateSettings = (key: keyof typeof settings.value, value: number | boolean | 'classic' | 'guess' | 'scramble' | 'teaser') => {
  if (!isHost.value) return
  const socket = store.getSocket()
  if (!socket) return
  
  settings.value[key] = value as never
  socket.emit('room:updateSettings', { [key]: value })
}

const startGame = () => {
  if (!canStartGame.value) return
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('game:start')
}

// Toggle ready status
const toggleReady = () => {
  if (isHost.value) return
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('player:toggleReady')
}

// Transfer host to another player
const transferHost = (newHostId: string) => {
  if (!isHost.value) return
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('room:transferHost', { newHostId })
}

// Chat methods
const toggleChat = () => {
  showChat.value = !showChat.value
  if (showChat.value) {
    unreadCount.value = 0
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

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Leave confirmation
const goBack = () => {
  if (viewMode.value === 'lobby') {
    showLeaveModal.value = true
  } else if (viewMode.value === 'create' || viewMode.value === 'join') {
    viewMode.value = 'select'
  } else {
    // From select screen, disconnect and go to menu
    store.disconnectSocket()
    store.reset()
    router.push('/menu')
  }
}

const confirmLeave = () => {
  showLeaveModal.value = false
  store.disconnectSocket()
  router.push('/')
}

const cancelLeave = () => {
  showLeaveModal.value = false
}

// Handle route param for direct join
onMounted(() => {
  // Check if already in a room (coming back from game or friend game)
  if (store.roomState && store.roomState.roomCode) {
    viewMode.value = 'lobby'
    settings.value = { ...store.roomState.settings }
    connectSocket()
    return
  }
  
  if (route.params.code) {
    viewMode.value = 'join'
    roomCodeInput.value = route.params.code as string
    connectSocket()
  } else if (route.query.join === 'true') {
    // Direct join from menu
    showJoinForm()
  } else {
    // No room state - just connect socket for listeners
    connectSocket()
  }
})

onUnmounted(() => {
  // Clean up socket listeners to prevent duplicates
  const socket = store.getSocket()
  if (socket) {
    socket.off('connect')
    socket.off('disconnect')
    socket.off('error')
    socket.off('player:id')
    socket.off('game:countdown')
    socket.off('room:state')
    socket.off('round:start')
    socket.off('round:end')
    socket.off('game:end')
    socket.off('chat:message')
  }
})
</script>

<template>
  <div class="room-page">
    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h1 class="page-title">
        <template v-if="viewMode === 'lobby'">Lobby</template>
        <template v-else-if="viewMode === 'create'">Create Room</template>
        <template v-else-if="viewMode === 'join'">Join Room</template>
        <template v-else>Play</template>
      </h1>
      
      <!-- Chat button (only in lobby) -->
      <button v-if="viewMode === 'lobby'" class="chat-toggle-btn" @click="toggleChat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </button>
      <div v-else class="header-spacer"></div>
    </header>

    <!-- SELECT MODE: Create or Join -->
    <div v-if="viewMode === 'select'" class="select-mode">
      <div class="mode-cards">
        <!-- Create Room Card -->
        <div class="mode-card" @click="showCreateForm">
          <div class="card-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="24" cy="24" r="20"/>
              <path d="M24 14v20M14 24h20"/>
            </svg>
          </div>
          <h2 class="card-title">Create Room</h2>
          <p class="card-desc">Start a new game and invite friends</p>
          <div class="card-badge">Host</div>
        </div>

        <!-- Join Room Card -->
        <div class="mode-card" @click="showJoinForm">
          <div class="card-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M24 4v40M4 24h40"/>
              <circle cx="24" cy="24" r="8"/>
            </svg>
          </div>
          <h2 class="card-title">Join Room</h2>
          <p class="card-desc">Enter a code to join friends</p>
        </div>
      </div>

      <!-- Decorative elements -->
      <div class="decoration-container">
        <svg class="deco doodle-1" width="60" height="40" viewBox="0 0 60 40">
          <path d="M5 20 Q 20 5, 35 20 T 55 20" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
        <svg class="deco doodle-2" width="40" height="40" viewBox="0 0 40 40">
          <path d="M20 5 L 23 17 L 35 20 L 23 23 L 20 35 L 17 23 L 5 20 L 17 17 Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </div>
    </div>

    <!-- CREATE ROOM FORM -->
    <div v-else-if="viewMode === 'create'" class="form-mode">
      <div class="form-card sketch-border">
        <div class="form-header">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="20" cy="20" r="16"/>
            <path d="M20 12v16M12 20h16"/>
          </svg>
          <h2>Create New Room</h2>
        </div>

        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input 
            v-model="playerNameInput"
            type="text" 
            class="form-input sketch-border"
            placeholder="Enter your name..."
            maxlength="15"
            @keyup.enter="createRoom"
          >
          <span class="input-hint">Max 15 characters</span>
        </div>

        <button 
          class="sketch-btn submit-btn" 
          :disabled="!playerNameInput.trim()"
          @click="createRoom"
        >
          Create Room
        </button>
      </div>
    </div>

    <!-- JOIN ROOM FORM -->
    <div v-else-if="viewMode === 'join'" class="form-mode">
      <div class="form-card sketch-border">
        <div class="form-header">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 4v32M4 20h32"/>
            <circle cx="20" cy="20" r="10"/>
          </svg>
          <h2>Join Room</h2>
        </div>

        <div class="form-group">
          <label class="form-label">Room Code</label>
          <input 
            v-model="roomCodeInput"
            type="text" 
            class="form-input sketch-border code-input"
            placeholder="ABC123"
            maxlength="6"
            style="text-transform: uppercase"
          >
        </div>

        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input 
            v-model="playerNameInput"
            type="text" 
            class="form-input sketch-border"
            placeholder="Enter your name..."
            maxlength="15"
            @keyup.enter="joinRoom"
          >
        </div>

        <button 
          class="sketch-btn submit-btn" 
          :disabled="!playerNameInput.trim() || !roomCodeInput.trim()"
          @click="joinRoom"
        >
          Join Room
        </button>
      </div>
    </div>

    <!-- LOBBY VIEW -->
    <div v-else-if="viewMode === 'lobby'" class="lobby-mode">
      <!-- Room Code Display -->
      <div class="room-code-section">
        <span class="room-code-label">Room Code</span>
        <div class="room-code-display" @click="copyRoomCode">
          <span class="room-code">{{ store.roomState?.roomCode || '------' }}</span>
          <button class="copy-btn" :class="{ copied: copiedCode }">
            <svg v-if="!copiedCode" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
              <path d="M2 14V4a2 2 0 012-2h10"/>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 10l4 4 8-8"/>
            </svg>
          </button>
        </div>
        <span v-if="copiedCode" class="copied-text">Copied!</span>
      </div>

      <!-- Players List -->
      <div class="players-section">
        <div class="section-header">
          <h3>Players</h3>
          <span class="player-count">{{ store.roomState?.players.length || 0 }}/10</span>
        </div>
        
        <div class="players-list">
          <div 
            v-for="player in store.roomState?.players" 
            :key="player.id" 
            class="player-item"
            :class="{ isHost: player.isHost, isYou: player.id === store.playerId, isReady: player.isReady }"
          >
            <div class="player-avatar">
              <span>{{ player.name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="player-info">
              <span class="player-name">
                {{ player.name }}
                <span v-if="player.id === store.playerId" class="you-badge">(You)</span>
              </span>
              <span v-if="player.isHost" class="host-badge">👑 Host</span>
            </div>
            <div class="player-actions">
              <!-- Transfer host button (host can transfer to others) -->
              <button 
                v-if="isHost && !player.isHost && player.connected" 
                class="transfer-host-btn"
                @click="transferHost(player.id)"
                title="Make this player the host"
              >
                👑 Transfer
              </button>
              <!-- Ready badge for host -->
              <span v-if="player.isHost" class="ready-badge host-ready">Ready</span>
              <!-- Ready badge for other players -->
              <span v-else-if="player.isReady" class="ready-badge is-ready">Ready</span>
              <span v-else class="ready-badge not-ready">Not Ready</span>
            </div>
          </div>

          <!-- Empty slots -->
          <div 
            v-for="i in Math.max(0, 4 - (store.roomState?.players.length || 0))" 
            :key="'empty-' + i"
            class="player-item empty"
          >
            <div class="player-avatar empty">
              <span>?</span>
            </div>
            <span class="empty-text">Waiting...</span>
          </div>
        </div>
      </div>

      <!-- Settings (Host Only) -->
      <div v-if="isHost" class="settings-section">
        <div class="section-header">
          <h3>Game Settings</h3>
          <span class="host-only-badge">Host Only</span>
        </div>

        <!-- Game Mode Selection -->
        <div class="game-mode-section">
          <label class="mode-label">Game Mode</label>
          <div class="mode-cards">
            <button 
              class="mode-card-btn"
              :class="{ active: settings.gameMode === 'classic' }"
              @click="updateSettings('gameMode', 'classic')"
            >
              <span class="mode-icon">📝</span>
              <span class="mode-name">WWOORRDD</span>
              <span class="mode-desc">Make words from letters</span>
            </button>
            <button 
              class="mode-card-btn"
              :class="{ active: settings.gameMode === 'guess' }"
              @click="updateSettings('gameMode', 'guess')"
            >
              <span class="mode-icon">❓</span>
              <span class="mode-name">Guess Word</span>
              <span class="mode-desc">Fill in the blanks</span>
            </button>
            <button 
              class="mode-card-btn"
              :class="{ active: settings.gameMode === 'scramble' }"
              @click="updateSettings('gameMode', 'scramble')"
            >
              <span class="mode-icon">🔀</span>
              <span class="mode-name">Scramble</span>
              <span class="mode-desc">Unscramble the word</span>
            </button>
            <button 
              class="mode-card-btn"
              :class="{ active: settings.gameMode === 'teaser' }"
              @click="updateSettings('gameMode', 'teaser')"
            >
              <span class="mode-icon">🧩</span>
              <span class="mode-name">Game Teaser</span>
              <span class="mode-desc">Solve the riddle</span>
            </button>
          </div>
        </div>

        <div class="settings-grid">
          <!-- Common settings -->
          <div class="setting-item">
            <label>Rounds</label>
            <div class="setting-control">
              <button class="setting-btn" @click="updateSettings('rounds', Math.max(1, settings.rounds - 1))">−</button>
              <span class="setting-value">{{ settings.rounds }}</span>
              <button class="setting-btn" @click="updateSettings('rounds', Math.min(20, settings.rounds + 1))">+</button>
            </div>
          </div>

          <div class="setting-item">
            <label>Timer (sec)</label>
            <div class="setting-control">
              <button class="setting-btn" @click="updateSettings('roundSeconds', Math.max(30, settings.roundSeconds - 10))">−</button>
              <span class="setting-value">{{ settings.roundSeconds }}</span>
              <button class="setting-btn" @click="updateSettings('roundSeconds', Math.min(180, settings.roundSeconds + 10))">+</button>
            </div>
          </div>

          <!-- Classic mode settings -->
          <template v-if="settings.gameMode === 'classic'">
            <div class="setting-item">
              <label>Min Word Length</label>
              <div class="setting-control">
                <button class="setting-btn" @click="updateSettings('minLen', Math.max(2, settings.minLen - 1))">−</button>
                <span class="setting-value">{{ settings.minLen }}</span>
                <button class="setting-btn" @click="updateSettings('minLen', Math.min(7, settings.minLen + 1))">+</button>
              </div>
            </div>

            <div class="setting-item toggle">
              <label>Full Letter Bonus</label>
              <button 
                class="toggle-btn" 
                :class="{ active: settings.fullBonusEnabled }"
                @click="updateSettings('fullBonusEnabled', !settings.fullBonusEnabled)"
              >
                <span class="toggle-slider"></span>
                <span class="toggle-label">{{ settings.fullBonusEnabled ? 'ON' : 'OFF' }}</span>
              </button>
            </div>
          </template>

          <!-- Dark Mode Toggle (always visible) -->
          <div class="setting-item toggle dark-mode-toggle">
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
      </div>

      <!-- Start Game / Ready Button -->
      <div class="action-section">
        <!-- Host view -->
        <template v-if="isHost">
          <div v-if="!canStartGame" class="start-hint">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="10" cy="10" r="8"/>
              <path d="M10 6v4M10 14h.01"/>
            </svg>
            <span v-if="(store.roomState?.players.length || 0) < 2">Need at least 2 players</span>
            <span v-else>Waiting for all players to be ready</span>
          </div>
          
          <button 
            class="sketch-btn start-btn"
            :class="{ ready: canStartGame }"
            :disabled="!canStartGame"
            @click="startGame"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            Start Game
          </button>
        </template>

        <!-- Non-host view -->
        <template v-else>
          <!-- Live Settings Summary -->
          <div class="settings-summary">
            <h4>Game Settings</h4>
            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-label">Mode</span>
                <span class="summary-value">
                  <span v-if="settings.gameMode === 'classic'">📝 WWOORRDD</span>
                  <span v-else-if="settings.gameMode === 'guess'">❓ Guess Word</span>
                  <span v-else-if="settings.gameMode === 'scramble'">🔀 Scramble</span>
                  <span v-else-if="settings.gameMode === 'teaser'">🧩 Game Teaser</span>
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Rounds</span>
                <span class="summary-value">{{ settings.rounds }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Timer</span>
                <span class="summary-value">{{ settings.roundSeconds }}s</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Min Length</span>
                <span class="summary-value">{{ settings.minLen }} letters</span>
              </div>
            </div>
          </div>
          
          <button 
            class="sketch-btn ready-btn"
            :class="{ isReady: myPlayer?.isReady }"
            @click="toggleReady"
          >
            <svg v-if="myPlayer?.isReady" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4l3 3"/>
            </svg>
            {{ myPlayer?.isReady ? 'Ready!' : 'Click Ready' }}
          </button>
          
          <div class="waiting-host">
            <div class="waiting-animation">
              <span></span><span></span><span></span>
            </div>
            <span>Waiting for host to start...</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Chat Panel (Slide-in) -->
    <Transition name="chat-slide">
      <div v-if="showChat && viewMode === 'lobby'" class="chat-panel">
        <div class="chat-header">
          <h3>Chat</h3>
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
            <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
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

    <!-- Leave Confirmation Modal -->
    <div v-if="showLeaveModal" class="modal-overlay" @click.self="cancelLeave">
      <div class="modal-content">
        <h3 class="modal-title">Leave Room?</h3>
        <p class="modal-text">Are you sure you want to leave? You'll lose your spot in this game.</p>
        <div class="modal-buttons">
          <button class="modal-btn cancel" @click="cancelLeave">Stay</button>
          <button class="modal-btn confirm" @click="confirmLeave">Leave</button>
        </div>
      </div>
    </div>

    <!-- Player Left Notification -->
    <Transition name="slide-up">
      <div v-if="showPlayerLeftNotification" class="player-left-notification">
        <span class="notification-icon">👋</span>
        <span class="notification-text">{{ showPlayerLeftNotification }} left the room</span>
      </div>
    </Transition>

    <!-- Countdown Overlay -->
    <Transition name="countdown">
      <div v-if="showCountdown" class="countdown-overlay">
        <div class="countdown-number" :key="countdownNumber">
          {{ countdownNumber === 0 ? 'GO!' : countdownNumber }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.room-page {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-paper);
  overflow: hidden;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 2px solid var(--pencil-dark);
  background: var(--bg-paper);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pencil-dark);
  padding: var(--spacing-sm);
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.back-btn:hover {
  transform: translateX(-2px);
}

.page-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 700;
  color: var(--pencil-dark);
}

.header-spacer {
  width: 44px;
}

/* SELECT MODE */
.select-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-lg);
  position: relative;
}

.mode-cards {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
  max-width: 320px;
}

.mode-card {
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  text-align: center;
}

.mode-card:hover {
  transform: translateY(-4px);
  box-shadow: 4px 4px 0 var(--pencil-medium);
}

.mode-card:active {
  transform: translateY(0);
  box-shadow: none;
}

.card-icon {
  margin-bottom: var(--spacing-sm);
  color: var(--pencil-dark);
}

.card-title {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.5rem, 5vw, 2rem);
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.card-desc {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.card-badge {
  position: absolute;
  top: -8px;
  right: 20px;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  font-family: 'Caveat', cursive;
  font-size: 0.9rem;
  padding: 2px 12px;
  border-radius: 20px;
}

.decoration-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.deco {
  color: var(--pencil-light);
  opacity: 0.3;
}

.doodle-1 {
  position: absolute;
  top: 15%;
  left: 5%;
  animation: float 6s ease-in-out infinite;
}

.doodle-2 {
  position: absolute;
  bottom: 20%;
  right: 8%;
  animation: float 8s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
}

/* FORM MODE */
.form-mode {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-lg);
}

.form-card {
  background: var(--bg-paper);
  padding: var(--spacing-lg);
  width: 100%;
  max-width: 340px;
}

.form-header {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.form-header svg {
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.form-header h2 {
  font-family: 'Caveat', cursive;
  font-size: clamp(1.5rem, 5vw, 2rem);
  color: var(--pencil-dark);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.form-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  color: var(--pencil-dark);
  outline: none;
  transition: box-shadow 0.2s;
}

.form-input:focus {
  box-shadow: 3px 3px 0 var(--pencil-medium);
}

.form-input::placeholder {
  color: var(--pencil-faint);
}

.code-input {
  text-align: center;
  font-size: clamp(1.5rem, 6vw, 2rem);
  letter-spacing: 8px;
  text-transform: uppercase;
}

.input-hint {
  display: block;
  font-size: 0.85rem;
  color: var(--pencil-light);
  margin-top: 4px;
}

.submit-btn {
  width: 100%;
  margin-top: var(--spacing-md);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* LOBBY MODE */
.lobby-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  gap: var(--spacing-md);
  overflow-y: auto;
}

/* Room Code */
.room-code-section {
  text-align: center;
  padding: var(--spacing-md);
}

.room-code-label {
  display: block;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  margin-bottom: var(--spacing-sm);
}

.room-code-display {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border: 3px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: transform 0.2s;
}

.room-code-display:hover {
  transform: scale(1.02);
}

.room-code {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--pencil-dark);
}

.copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pencil-medium);
  padding: 4px;
  display: flex;
  transition: color 0.2s;
}

.copy-btn.copied {
  color: var(--pencil-dark);
}

.copied-text {
  display: block;
  font-size: 0.9rem;
  color: var(--pencil-dark);
  margin-top: var(--spacing-sm);
  animation: fade-in 0.3s ease;
}

/* Players Section */
.players-section {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: var(--spacing-md);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.section-header h3 {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-xl);
  color: var(--pencil-dark);
}

.player-count {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.player-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 20px 5px 20px 5px;
}

.player-item.isHost {
  border: 2px dashed var(--pencil-light);
}

.player-item.isYou {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
}

.player-item.empty {
  opacity: 0.4;
  border: 2px dashed var(--pencil-light);
  background: transparent;
}

.player-avatar {
  width: 40px;
  height: 40px;
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

.player-avatar.empty {
  background: transparent;
  border: 2px dashed var(--pencil-light);
  color: var(--pencil-light);
}

.player-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.player-name {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
}

.you-badge {
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.host-badge {
  font-size: 0.85rem;
  color: var(--pencil-dark);
}

.player-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.transfer-host-btn {
  padding: 4px 8px;
  background: var(--bg-paper);
  border: 1px solid var(--pencil-dark);
  border-radius: 8px;
  font-family: 'Patrick Hand', cursive;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--pencil-dark);
  transition: all 0.2s;
}

.transfer-host-btn:hover {
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.ready-badge {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 12px;
}

.ready-badge.host-ready {
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.ready-badge.is-ready {
  background: #2e7d32;
  color: white;
}

.ready-badge.not-ready {
  background: var(--bg-paper);
  color: var(--pencil-light);
  border: 1px solid var(--pencil-light);
}

.empty-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.player-status {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--pencil-faint);
}

.player-status.connected {
  background: var(--pencil-dark);
}

.status-dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

/* Settings Section */
.settings-section {
  background: var(--bg-paper);
  border: 2px solid var(--pencil-dark);
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  padding: var(--spacing-md);
}

.host-only-badge {
  font-size: 0.8rem;
  color: var(--bg-paper);
  background: var(--pencil-dark);
  padding: 2px 8px;
  border-radius: 10px;
}

/* Game Mode Section */
.game-mode-section {
  margin-bottom: var(--spacing-md);
}

.mode-label {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}

.mode-card-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-card-btn:hover {
  border-color: var(--pencil-dark);
  transform: translateY(-2px);
}

.mode-card-btn.active {
  border-color: var(--pencil-dark);
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.mode-icon {
  font-size: 1.5rem;
}

.mode-name {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  font-weight: 700;
}

.mode-desc {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.75rem;
  opacity: 0.8;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 15px 5px 15px 5px;
}

.setting-item.toggle {
  grid-column: span 2;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.setting-item label {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
}

.setting-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.setting-btn {
  width: 32px;
  height: 32px;
  border: 2px solid var(--pencil-dark);
  background: var(--bg-paper);
  color: var(--pencil-dark);
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s;
}

.setting-btn:hover {
  transform: scale(1.1);
}

.setting-btn:active {
  transform: scale(0.95);
}

.setting-value {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-xl);
  font-weight: 700;
  min-width: 40px;
  text-align: center;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 12px;
  border: 2px solid var(--pencil-dark);
  background: var(--bg-paper);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.toggle-slider {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid currentColor;
}

.toggle-label {
  font-family: 'Caveat', cursive;
  font-size: 1rem;
}

/* Action Section */
.action-section {
  padding: var(--spacing-md);
  text-align: center;
}

/* Settings Summary for Non-Host */
.settings-summary {
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 15px;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-md);
  text-align: left;
}

.settings-summary h4 {
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  color: var(--pencil-dark);
  margin: 0 0 var(--spacing-sm) 0;
  text-align: center;
  border-bottom: 1px dashed var(--pencil-light);
  padding-bottom: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xs) var(--spacing-md);
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--pencil-medium);
}

.summary-value {
  font-family: 'Caveat', cursive;
  font-size: 1rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.selected-mode-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-paper-dark);
  border-radius: 15px;
}

.selected-mode-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.85rem;
  color: var(--pencil-light);
}

.selected-mode-name {
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--pencil-dark);
}

.start-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
  margin-bottom: var(--spacing-sm);
}

.start-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: clamp(1.3rem, 4vw, 1.6rem);
}

.start-btn.ready {
  animation: pulse-ready 1.5s ease-in-out infinite;
}

@keyframes pulse-ready {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

.ready-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: clamp(1.3rem, 4vw, 1.6rem);
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.ready-btn.isReady {
  background: #2e7d32;
  color: white;
  border-color: #2e7d32;
  animation: pulse-ready 1.5s ease-in-out infinite;
}

.waiting-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.waiting-animation {
  display: flex;
  gap: 6px;
}

.waiting-animation span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pencil-light);
  animation: waiting-bounce 1.4s ease-in-out infinite;
}

.waiting-animation span:nth-child(1) { animation-delay: 0s; }
.waiting-animation span:nth-child(2) { animation-delay: 0.2s; }
.waiting-animation span:nth-child(3) { animation-delay: 0.4s; }

@keyframes waiting-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-8px); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Leave Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 200;
  animation: fade-in 0.2s ease;
}

.modal-content {
  background: var(--bg-paper);
  border: 3px solid var(--pencil-dark);
  border-radius: 20px;
  padding: var(--spacing-lg);
  max-width: 320px;
  text-align: center;
  animation: slide-up 0.3s ease;
}

.modal-title {
  font-family: 'Caveat', cursive;
  font-size: 1.8rem;
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.modal-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-medium);
  margin-bottom: var(--spacing-md);
}

.modal-buttons {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
}

.modal-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: 15px;
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  cursor: pointer;
  transition: transform 0.2s;
  min-width: 80px;
}

.modal-btn:hover {
  transform: translateY(-2px);
}

.modal-btn.cancel {
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-dark);
  color: var(--pencil-dark);
}

.modal-btn.confirm {
  background: var(--pencil-dark);
  border: 2px solid var(--pencil-dark);
  color: var(--bg-paper);
}

/* Player Left Notification */
.player-left-notification {
  position: fixed;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-paper);
  border: 2px solid var(--pencil-light);
  border-radius: 20px;
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 150;
}

.notification-icon {
  font-size: 1.2rem;
}

.notification-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
}

.slide-up-enter-active {
  animation: slide-up 0.3s ease;
}

.slide-up-leave-active {
  animation: slide-up 0.2s ease reverse;
}

/* Countdown Overlay */
.countdown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 300;
}

.countdown-number {
  font-family: 'Caveat', cursive;
  font-size: clamp(6rem, 25vw, 12rem);
  font-weight: 700;
  color: var(--bg-paper);
  text-shadow: 4px 4px 0 var(--pencil-dark);
  animation: countdown-pop 0.5s ease;
}

@keyframes countdown-pop {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.countdown-enter-active {
  animation: fade-in 0.3s ease;
}

.countdown-leave-active {
  animation: fade-in 0.3s ease reverse;
}

/* Chat Toggle Button */
.chat-toggle-btn {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--pencil-dark);
  transition: transform 0.2s;
}

.chat-toggle-btn:hover {
  transform: scale(1.1);
}

.unread-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  background: #c41e3a;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  animation: badge-pop 0.3s ease;
}

@keyframes badge-pop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Chat Panel */
.chat-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(320px, 85vw);
  height: 100vh;
  height: 100dvh;
  background: var(--bg-paper);
  border-left: 3px solid var(--pencil-dark);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
}

.chat-header {
  padding: var(--spacing-md);
  border-bottom: 2px solid var(--pencil-dark);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h3 {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-xl);
  color: var(--pencil-dark);
}

.chat-close-btn {
  background: none;
  border: none;
  font-size: var(--font-size-xl);
  color: var(--pencil-medium);
  cursor: pointer;
  padding: 4px 8px;
}

.chat-close-btn:hover {
  color: var(--pencil-dark);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.chat-message {
  padding: 8px 12px;
  background: var(--bg-paper-dark);
  border-radius: 12px 4px 12px 4px;
  max-width: 85%;
}

.chat-message.isYou {
  background: rgba(46, 125, 50, 0.1);
  border-left: 3px solid #2e7d32;
  margin-left: auto;
}

.msg-player {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.8rem;
  color: var(--pencil-light);
  display: block;
  margin-bottom: 2px;
}

.chat-message.isYou .msg-player {
  color: #2e7d32;
  font-weight: 600;
}

.msg-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-dark);
  margin: 0;
  word-wrap: break-word;
}

.msg-time {
  font-size: 0.7rem;
  color: var(--pencil-faint);
  display: block;
  margin-top: 4px;
  text-align: right;
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
  padding: var(--spacing-sm);
  border-top: 2px solid var(--pencil-dark);
  display: flex;
  gap: var(--spacing-sm);
}

.chat-input {
  flex: 1;
  border: 2px solid var(--pencil-dark);
  border-radius: 20px;
  padding: 8px 16px;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  background: var(--bg-paper);
  color: var(--pencil-dark);
  outline: none;
}

.chat-input:focus {
  border-color: var(--pencil-dark);
}

.chat-send-btn {
  width: 40px;
  height: 40px;
  border: 2px solid var(--pencil-dark);
  border-radius: 50%;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
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
  animation: chat-slide-in 0.3s ease;
}

.chat-slide-leave-active {
  animation: chat-slide-out 0.2s ease;
}

@keyframes chat-slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes chat-slide-out {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(100%);
  }
}

/* Responsive */
@media (min-width: 640px) {
  .mode-cards {
    flex-direction: row;
    max-width: 600px;
  }
  
  .mode-card {
    flex: 1;
  }
  
  .lobby-mode {
    max-width: 500px;
    margin: 0 auto;
  }
}

/* Mobile optimizations */
@media (max-width: 480px) {
  .room-page {
    padding-bottom: env(safe-area-inset-bottom);
  }
  
  .page-header {
    padding: 8px 12px;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
  
  .player-item {
    padding: 8px;
  }
  
  .player-avatar {
    width: 36px;
    height: 36px;
  }
  
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .setting-item {
    padding: 8px;
  }
  
  .mode-cards {
    flex-direction: column;
  }
  
  .mode-card {
    padding: 12px;
  }
  
  .room-code {
    font-size: 1.5rem;
  }
  
  .chat-input {
    font-size: 16px; /* Prevents iOS zoom */
  }
  
  .start-btn, .ready-btn {
    padding: 12px 20px;
    font-size: 1.2rem;
  }
}

/* Small mobile */
@media (max-width: 360px) {
  .page-title {
    font-size: 1.2rem;
  }
  
  .room-code {
    font-size: 1.2rem;
  }
  
  .player-name {
    font-size: 0.9rem;
  }
  
  .setting-label {
    font-size: 0.85rem;
  }
}

/* Dark Mode Toggle */
.dark-mode-toggle {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 2px dashed var(--pencil-light);
}

.dark-mode-toggle label {
  font-size: 1.1rem;
}
</style>
