<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()

// State
const activeTab = ref<'add' | 'my'>('my')
const friends = ref<Array<{ id: string; name: string; online: boolean }>>([])
const selectedFriend = ref<{ id: string; name: string; online?: boolean } | null>(null)
const showMessaging = ref(false)
const messages = ref<Array<{ id: string; from: string; to: string; text: string; timestamp: number }>>([])
const newMessage = ref('')

// Add friend state
const yourName = ref('')
const friendCode = ref('')
const generatedCode = ref('')
const codeExpiresIn = ref(0)
const isGenerating = ref(false)
const isUsingCode = ref(false)
const showSuccess = ref(false)
const successFriendName = ref('')
const showError = ref(false)
const errorMessage = ref('')

// Game invite state
const showGameInvite = ref(false)
const pendingInvite = computed(() => store.pendingGameInvite)
const waitingForFriend = computed(() => store.waitingForFriend)

// Generate a friend code
const generateCode = () => {
  const socket = store.getSocket()
  if (!socket) return
  
  if (!yourName.value.trim()) {
    showError.value = true
    errorMessage.value = 'Please enter your name first'
    return
  }
  
  isGenerating.value = true
  showError.value = false
  socket.emit('friends:generateCode', { name: yourName.value.trim() })
}

// Use a friend code
const useCode = () => {
  const socket = store.getSocket()
  if (!socket) return
  
  if (!friendCode.value.trim()) {
    showError.value = true
    errorMessage.value = 'Please enter a code'
    return
  }
  
  if (!yourName.value.trim()) {
    showError.value = true
    errorMessage.value = 'Please enter your name'
    return
  }
  
  // Check if trying to use own code
  if (friendCode.value.trim().toUpperCase() === generatedCode.value.toUpperCase()) {
    showError.value = true
    errorMessage.value = 'You cannot use your own code!'
    return
  }
  
  isUsingCode.value = true
  showError.value = false
  
  socket.emit('friends:useCode', { 
    code: friendCode.value.trim(),
    yourName: yourName.value.trim()
  })
}

// Remove a friend
const showRemoveConfirm = ref(false)
const friendToRemove = ref<{ id: string; name: string } | null>(null)

const confirmRemoveFriend = (friend: { id: string; name: string }) => {
  friendToRemove.value = friend
  showRemoveConfirm.value = true
}

const removeFriend = () => {
  if (!friendToRemove.value) return
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('friends:remove', { friendId: friendToRemove.value.id })
  selectedFriend.value = null
  showRemoveConfirm.value = false
  friendToRemove.value = null
}

const cancelRemove = () => {
  showRemoveConfirm.value = false
  friendToRemove.value = null
}

// Open messaging with friend
const openMessaging = (friend: { id: string; name: string }) => {
  const socket = store.getSocket()
  if (!socket) return
  
  selectedFriend.value = friend
  showMessaging.value = true
  socket.emit('messages:get', { friendId: friend.id })
}

// Close messaging
const closeMessaging = () => {
  showMessaging.value = false
  selectedFriend.value = null
  messages.value = []
}

// Send message
const sendMessage = () => {
  const socket = store.getSocket()
  if (!socket || !newMessage.value.trim() || !selectedFriend.value) return
  
  socket.emit('messages:send', { 
    to: selectedFriend.value.id, 
    text: newMessage.value.trim() 
  })
  
  newMessage.value = ''
}

// Play game with friend (1v1)
const playWithFriend = (friend: { id: string; name: string }) => {
  const socket = store.getSocket()
  if (!socket) return
  socket.emit('friends:play', { friendId: friend.id })
}

// Go back
const goBack = () => {
  if (showMessaging.value) {
    closeMessaging()
  } else {
    router.back()
  }
}

// Copy code to clipboard
const copyCode = () => {
  if (generatedCode.value) {
    navigator.clipboard.writeText(generatedCode.value)
  }
}

// Game invite handlers
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

// Socket listeners
onMounted(() => {
  // Ensure socket is connected
  const socket = store.ensureSocket()
  
  // Listen for player ID from server
  socket.on('player:id', (data: string | { id: string; name: string }) => {
    if (typeof data === 'string') {
      store.setPlayerInfo(data, store.playerName || 'Player')
    } else {
      store.setPlayerInfo(data.id, data.name)
    }
  })
  
  // Listen for reconnection result
  socket.on('player:reconnected', (data: { id: string; name: string }) => {
    store.setPlayerInfo(data.id, data.name)
    yourName.value = data.name
    // Now get friends list
    socket.emit('friends:get')
  })
  
  // If we have a stored playerId, try to reconnect
  if (store.playerId) {
    socket.emit('player:reconnect', { playerId: store.playerId })
  } else {
    // Get current user info
    socket.emit('user:get')
    // Get friends list
    socket.emit('friends:get')
  }
  
  socket.on('user:info', (data: { id: string; name: string }) => {
    yourName.value = data.name
    if (data.id) {
      store.setPlayerInfo(data.id, data.name)
    }
  })
  
  socket.on('friends:list', (data: { friends: Array<{ id: string; name: string; online: boolean }> }) => {
    friends.value = data.friends
  })
  
  socket.on('friends:codeGenerated', (data: { code: string; expiresIn: number }) => {
    generatedCode.value = data.code
    codeExpiresIn.value = data.expiresIn
    isGenerating.value = false
  })
  
  socket.on('friends:added', (data: { friend: { id: string; name: string; online: boolean } }) => {
    friends.value.push(data.friend)
    friendCode.value = ''
    isUsingCode.value = false
    showSuccess.value = true
    successFriendName.value = data.friend.name
    
    // Hide success after 3 seconds
    setTimeout(() => {
      showSuccess.value = false
    }, 3000)
  })
  
  socket.on('friends:removed', (data: { friendId: string }) => {
    friends.value = friends.value.filter(f => f.id !== data.friendId)
    if (selectedFriend.value?.id === data.friendId) {
      closeMessaging()
    }
  })
  
  socket.on('friends:error', (data: { message: string }) => {
    isUsingCode.value = false
    showError.value = true
    errorMessage.value = data.message
    
    // Hide error after 3 seconds
    setTimeout(() => {
      showError.value = false
    }, 3000)
  })
  
  socket.on('messages:list', (data: { messages: Array<{ id: string; from: string; to: string; text: string; timestamp: number }> }) => {
    messages.value = data.messages
  })
  
  socket.on('messages:new', (data: { message: { id: string; from: string; to: string; text: string; timestamp: number } }) => {
    messages.value.push(data.message)
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
  
  // Host receives this when they click play - show waiting dialog
  socket.on('friends:waitingForAccept', (data: { roomCode: string; friendName: string }) => {
    store.setWaitingForFriend({ friendName: data.friendName, roomCode: data.roomCode })
  })
  
  // Listen for game invites (receiver)
  socket.on('friends:gameInvite', (data: { from: string; fromId: string; roomCode: string }) => {
    store.addGameInvite({
      fromId: data.fromId,
      fromName: data.from,
      roomCode: data.roomCode,
      timestamp: Date.now()
    })
    showGameInvite.value = true
  })
  
  // Both receive this when game is accepted - go to room
  socket.on('friends:gameAccepted', (data: { roomCode: string; hostName?: string; friendName?: string; isHost?: boolean }) => {
    store.setWaitingForFriend(null)
    const socket = store.getSocket()
    if (socket) {
      if (!data.isHost) {
        // Friend - join the existing room (host is already in via server)
        socket.emit('room:join', { 
          roomCode: data.roomCode,
          name: store.playerName || 'Player'
        })
      }
      // Host is already in the room - room:state was sent by server
    }
  })
  
  // Host receives this when friend declines
  socket.on('friends:gameDeclined', (data: { friendName: string }) => {
    store.setWaitingForFriend(null)
    showError.value = true
    errorMessage.value = `${data.friendName} declined the game invite`
    setTimeout(() => {
      showError.value = false
    }, 3000)
  })
})

onUnmounted(() => {
  const socket = store.getSocket()
  if (socket) {
    socket.off('player:id')
    socket.off('player:reconnected')
    socket.off('user:info')
    socket.off('friends:list')
    socket.off('friends:codeGenerated')
    socket.off('friends:added')
    socket.off('friends:removed')
    socket.off('friends:error')
    socket.off('messages:list')
    socket.off('messages:new')
    socket.off('room:state')
    socket.off('friends:waitingForAccept')
    socket.off('friends:gameInvite')
    socket.off('friends:gameAccepted')
    socket.off('friends:gameDeclined')
  }
})
</script>

<template>
  <div class="friends-container">
    <!-- Header -->
    <header class="friends-header">
      <button class="back-btn" @click="goBack">← Back</button>
      <h1 class="page-title">👥 Friends</h1>
    </header>

    <!-- Tabs -->
    <div class="tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'my' }"
        @click="activeTab = 'my'"
      >
        My Friends ({{ friends.length }})
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'add' }"
        @click="activeTab = 'add'"
      >
        Add Friends
      </button>
    </div>

    <!-- Add Friends Tab -->
    <div v-if="activeTab === 'add'" class="add-friends-section">
      <!-- Success Message -->
      <div v-if="showSuccess" class="success-banner">
        <span class="success-icon">✅</span>
        <span>Added <strong>{{ successFriendName }}</strong> as friend!</span>
      </div>
      
      <!-- Error Message -->
      <div v-if="showError" class="error-banner">
        <span class="error-icon">❌</span>
        <span>{{ errorMessage }}</span>
      </div>
      
      <!-- Your Name Input -->
      <div class="form-section">
        <label class="form-label">Your Name</label>
        <input 
          v-model="yourName"
          type="text" 
          placeholder="Enter your name..."
          class="form-input"
          maxlength="20"
        />
      </div>
      
      <!-- Generate Code Section -->
      <div class="code-section">
        <h3 class="section-title">Share Your Code</h3>
        <p class="section-desc">Generate a code and share it with your friend</p>
        
        <button 
          class="generate-btn" 
          @click="generateCode"
          :disabled="isGenerating"
        >
          {{ isGenerating ? 'Generating...' : 'Generate Code' }}
        </button>
        
        <div v-if="generatedCode" class="generated-code">
          <div class="code-display">
            <span class="code-label">Your Code:</span>
            <span class="code-value">{{ generatedCode }}</span>
            <button class="copy-btn" @click="copyCode">📋 Copy</button>
          </div>
          <p class="code-expires">Expires in 10 minutes</p>
        </div>
      </div>
      
      <!-- Use Code Section -->
      <div class="code-section">
        <h3 class="section-title">Enter Friend's Code</h3>
        <p class="section-desc">Enter the code your friend shared with you</p>
        
        <div class="input-code">
          <input 
            v-model="friendCode"
            type="text" 
            placeholder="Enter 6-character code..."
            class="form-input code-input"
            maxlength="6"
            @keyup.enter="useCode"
          />
          <button 
            class="use-code-btn" 
            @click="useCode"
            :disabled="isUsingCode || !friendCode.trim() || !yourName.trim()"
          >
            {{ isUsingCode ? 'Connecting...' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>

    <!-- My Friends Tab -->
    <div v-if="activeTab === 'my'" class="my-friends-section">
      <div v-if="friends.length === 0" class="empty-state">
        <span class="empty-icon">👥</span>
        <p>No friends yet. Add some!</p>
      </div>
      
      <div v-else class="friends-list">
        <div 
          v-for="friend in friends" 
          :key="friend.id" 
          class="friend-card"
          :class="{ online: friend.online }"
        >
          <div class="friend-info">
            <span class="friend-avatar">{{ friend.name[0].toUpperCase() }}</span>
            <div class="friend-details">
              <span class="friend-name">{{ friend.name }}</span>
              <span class="friend-status">{{ friend.online ? '🟢 Online' : '⚫ Offline' }}</span>
            </div>
          </div>
          
          <div class="friend-actions">
            <button class="action-btn message" @click="openMessaging(friend)">
              💬
            </button>
            <button 
              class="action-btn play" 
              @click="playWithFriend(friend)"
              :disabled="!friend.online"
            >
              🎮
            </button>
            <button class="action-btn remove" @click="confirmRemoveFriend(friend)">
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Messaging Modal - Full Screen WhatsApp Style -->
    <div v-if="showMessaging && selectedFriend" class="messaging-fullscreen">
      <div class="chat-header">
        <button class="back-btn" @click="closeMessaging">←</button>
        <div class="chat-avatar">{{ selectedFriend.name[0].toUpperCase() }}</div>
        <div class="chat-user-info">
          <span class="chat-name">{{ selectedFriend.name }}</span>
          <span class="chat-status">{{ selectedFriend.online ? 'Online' : 'Offline' }}</span>
        </div>
        <button class="play-btn" @click="playWithFriend(selectedFriend)" :disabled="!selectedFriend.online">
          🎮 Play
        </button>
      </div>
      
      <div class="chat-messages" ref="messagesContainer">
        <div 
          v-for="msg in messages" 
          :key="msg.id" 
          class="chat-bubble"
          :class="{ sent: msg.from === store.playerId, received: msg.from !== store.playerId }"
        >
          <span class="bubble-text">{{ msg.text }}</span>
          <span class="bubble-time">{{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
        </div>
        <div v-if="messages.length === 0" class="no-chat-messages">
          <span class="chat-icon">💬</span>
          <p>Start a conversation with {{ selectedFriend.name }}!</p>
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

    <!-- Remove Friend Confirmation -->
    <div v-if="showRemoveConfirm && friendToRemove" class="confirm-popup">
      <div class="confirm-content">
        <span class="confirm-icon">⚠️</span>
        <h3>Remove Friend?</h3>
        <p>Are you sure you want to remove <strong>{{ friendToRemove.name }}</strong> from your friends?</p>
        <div class="confirm-buttons">
          <button class="cancel-btn" @click="cancelRemove">Cancel</button>
          <button class="remove-btn" @click="removeFriend">Remove</button>
        </div>
      </div>
    </div>

    <!-- Game Invite Popup -->
    <div v-if="showGameInvite && pendingInvite" class="confirm-popup">
      <div class="confirm-content">
        <span class="confirm-icon">🎮</span>
        <h3>Game Invite!</h3>
        <p>{{ pendingInvite.fromName }} wants to play with you</p>
        <div class="confirm-buttons">
          <button class="cancel-btn" @click="declineGameInvite">Decline</button>
          <button class="accept-btn" @click="acceptGameInvite">Accept</button>
        </div>
      </div>
    </div>

    <!-- Waiting for Friend Dialog -->
    <div v-if="waitingForFriend" class="confirm-popup">
      <div class="confirm-content">
        <span class="confirm-icon">⏳</span>
        <h3>Waiting for friend...</h3>
        <p>Room: {{ waitingForFriend.roomCode }}</p>
        <p v-if="waitingForFriend.friendName">Waiting for {{ waitingForFriend.friendName }}</p>
        <div class="confirm-buttons">
          <button class="cancel-btn" @click="cancelWaiting">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.friends-container {
  min-height: 100vh;
  background: var(--bg-paper);
  padding: var(--spacing-lg);
}

.friends-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.back-btn {
  background: none;
  border: none;
  color: var(--pencil-dark);
  font-size: 1.2rem;
  cursor: pointer;
  padding: var(--spacing-sm);
}

.page-title {
  font-family: 'Patrick Hand', cursive;
  font-size: 2rem;
  color: var(--pencil-dark);
}

.tabs {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.tab-btn {
  flex: 1;
  padding: var(--spacing-md);
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--pencil-mid);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border-color: var(--pencil-dark);
}

.add-friends-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.success-banner, .error-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
}

.success-banner {
  background: rgba(34, 197, 94, 0.2);
  border: 2px solid #22c55e;
  color: #166534;
}

.error-banner {
  background: rgba(239, 68, 68, 0.2);
  border: 2px solid #ef4444;
  color: #991b1b;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-label {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--pencil-dark);
}

.form-input {
  padding: var(--spacing-md);
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 12px;
  font-family: 'Caveat', cursive;
  font-size: 1.3rem;
  color: var(--pencil-dark);
  outline: none;
}

.form-input:focus {
  border-color: var(--pencil-dark);
}

.code-section {
  background: var(--bg-paper-dark);
  padding: var(--spacing-lg);
  border-radius: 16px;
  border: 2px solid var(--pencil-light);
}

.section-title {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.3rem;
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-xs);
}

.section-desc {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  color: var(--pencil-mid);
  margin-bottom: var(--spacing-md);
}

.generate-btn {
  width: 100%;
  padding: var(--spacing-md);
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border: none;
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generated-code {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--bg-paper);
  border-radius: 12px;
}

.code-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.code-label {
  font-family: 'Patrick Hand', cursive;
  color: var(--pencil-mid);
}

.code-value {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--pencil-dark);
  letter-spacing: 4px;
}

.copy-btn {
  background: none;
  border: 2px solid var(--pencil-light);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: 8px;
  font-family: 'Patrick Hand', cursive;
  cursor: pointer;
  color: var(--pencil-dark);
}

.copy-btn:hover {
  background: var(--pencil-light);
}

.code-expires {
  font-family: 'Caveat', cursive;
  color: var(--pencil-mid);
  margin-top: var(--spacing-xs);
}

.input-code {
  display: flex;
  gap: var(--spacing-sm);
}

.code-input {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-align: center;
}

.use-code-btn {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border: none;
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.use-code-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.use-code-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
}

.empty-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: var(--spacing-md);
}

.friends-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.friend-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--bg-paper-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 16px;
  transition: all 0.2s;
}

.friend-card.online {
  border-color: #22c55e;
}

.friend-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.friend-avatar {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border-radius: 50%;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.5rem;
}

.friend-details {
  display: flex;
  flex-direction: column;
}

.friend-name {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.3rem;
  color: var(--pencil-dark);
}

.friend-status {
  font-family: 'Caveat', cursive;
  font-size: 1rem;
  color: var(--pencil-mid);
}

.friend-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.action-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 2px solid var(--pencil-light);
  border-radius: 10px;
  background: var(--bg-paper);
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.play {
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.action-btn.remove {
  background: #fee2e2;
  border-color: #ef4444;
  color: #ef4444;
  padding: var(--spacing-xs) var(--spacing-sm);
}

/* Full Screen Messaging - WhatsApp Style */
.messaging-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-paper);
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--pencil-dark);
  color: var(--bg-paper);
}

.chat-header .back-btn {
  color: var(--bg-paper);
  font-size: 1.5rem;
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-paper);
  color: var(--pencil-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.3rem;
  font-weight: bold;
}

.chat-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-name {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  font-weight: bold;
}

.chat-status {
  font-size: 0.8rem;
  opacity: 0.8;
}

.chat-header .play-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-paper);
  color: var(--pencil-dark);
  border: none;
  border-radius: 8px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
}

.chat-header .play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  background: var(--bg-paper-dark);
}

.chat-bubble {
  max-width: 75%;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-bubble.received {
  align-self: flex-start;
  background: white;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.chat-bubble.received .bubble-time {
  align-self: flex-start;
}

.chat-bubble.sent {
  align-self: flex-end;
  background: #dcf8c6;
  border-bottom-right-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.chat-bubble.sent .bubble-time {
  align-self: flex-end;
}

.bubble-text {
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  color: #333;
  word-wrap: break-word;
}

.bubble-time {
  font-size: 0.7rem;
  color: #666;
}

.no-chat-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--pencil-mid);
}

.chat-icon {
  font-size: 4rem;
  margin-bottom: var(--spacing-md);
}

.chat-input-area {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-paper);
  border-top: 2px solid var(--pencil-light);
}

.chat-input {
  flex: 1;
  padding: var(--spacing-md);
  border: 2px solid var(--pencil-light);
  border-radius: 24px;
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  outline: none;
  background: white;
}

.chat-input:focus {
  border-color: var(--pencil-dark);
}

.send-btn {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--pencil-dark);
  color: var(--bg-paper);
  border: none;
  border-radius: 24px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover {
  transform: scale(1.05);
}

/* Confirmation Popup */
.confirm-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-content {
  background: var(--bg-paper);
  padding: var(--spacing-xl);
  border-radius: 20px;
  border: 3px solid var(--pencil-dark);
  text-align: center;
  max-width: 350px;
}

.confirm-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--spacing-md);
}

.confirm-content h3 {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.5rem;
  color: var(--pencil-dark);
  margin-bottom: var(--spacing-sm);
}

.confirm-content p {
  font-family: 'Caveat', cursive;
  font-size: 1.2rem;
  color: var(--pencil-mid);
  margin-bottom: var(--spacing-lg);
}

.confirm-buttons {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
}

.confirm-buttons .cancel-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--bg-paper-dark);
  color: var(--pencil-dark);
  border: 2px solid var(--pencil-light);
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
}

.confirm-buttons .remove-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
}

.confirm-buttons .accept-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: #22c55e;
  color: white;
  border: none;
  border-radius: 12px;
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  cursor: pointer;
}
</style>
