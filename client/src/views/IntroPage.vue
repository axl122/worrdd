<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

const router = useRouter()
const store = useGameStore()
const animationPhase = ref<'drawing' | 'complete' | 'fading'>('drawing')
const showLoading = ref(false)
const showAuthOptions = ref(false)
const isSigningIn = ref(false)
const authError = ref('')

// Letters to animate
const letters = ['W', 'W', 'O', 'O', 'R', 'R', 'D', 'D', '!']
const letterStates = ref<boolean[]>(new Array(letters.length).fill(false))

// Check if user is already authenticated
const checkAuth = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
      credentials: 'include'
    })
    if (response.ok) {
      const data = await response.json()
      store.setAuthenticatedUser(data.user)
      return true
    }
  } catch (error) {
    console.log('Not authenticated')
  }
  return false
}

// Google Sign In
const handleGoogleSignIn = async () => {
  isSigningIn.value = true
  authError.value = ''
  
  try {
    // Initialize Google Identity Services
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    
    if (!googleClientId) {
      // Fallback: skip auth if no client ID configured
      showAuthOptions.value = false
      proceedToMenu()
      return
    }
    
    // Use Google One Tap or Sign In button
    const client = (window as any).google?.accounts?.id
    if (!client) {
      authError.value = 'Google Sign In not loaded. Please refresh.'
      isSigningIn.value = false
      return
    }
    
    client.initialize({
      client_id: googleClientId,
      callback: async (response: any) => {
        if (response.credential) {
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ idToken: response.credential })
            })
            
            if (res.ok) {
              const data = await res.json()
              store.setAuthenticatedUser(data.user)
              proceedToMenu()
            } else {
              const err = await res.json()
              authError.value = err.error || 'Sign in failed'
            }
          } catch (err) {
            authError.value = 'Connection error'
          }
          isSigningIn.value = false
        }
      }
    })
    
    // Show the Google Sign In prompt
    client.prompt()
  } catch (error) {
    console.error('Google sign in error:', error)
    authError.value = 'Sign in failed'
    isSigningIn.value = false
  }
}

// Skip sign in (guest mode)
const skipSignIn = () => {
  store.setAuthenticatedUser(null)
  proceedToMenu()
}

const proceedToMenu = () => {
  animationPhase.value = 'fading'
  setTimeout(() => {
    router.push('/menu')
  }, 500)
}

onMounted(async () => {
  // Load Google Sign In script
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (googleClientId && !(window as any).google) {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }
  
  // Animate each letter appearing sequentially
  letters.forEach((_, index) => {
    setTimeout(() => {
      letterStates.value[index] = true
    }, 150 * index)
  })

  // Show loading after all letters appear
  setTimeout(() => {
    showLoading.value = true
  }, 150 * letters.length + 200)

  // Check auth status
  const isAuthenticated = await checkAuth()
  
  // Start fading to menu or show auth options
  setTimeout(() => {
    animationPhase.value = 'complete'
  }, 3000)

  setTimeout(() => {
    if (isAuthenticated) {
      proceedToMenu()
    } else if (googleClientId) {
      showLoading.value = false
      showAuthOptions.value = true
    } else {
      proceedToMenu()
    }
  }, 3500)
})
</script>

<template>
  <div class="intro-container" :class="{ fading: animationPhase === 'fading' }">
    <!-- Decorative corner doodles -->
    <svg class="corner-doodle top-left" width="80" height="80" viewBox="0 0 80 80">
      <path 
        d="M10 70 Q 5 40, 15 20 Q 25 5, 50 10 Q 70 15, 75 35" 
        stroke="#1a1a1a" 
        stroke-width="2" 
        fill="none"
        stroke-linecap="round"
        stroke-dasharray="200"
        style="animation: pencil-draw 1.5s ease forwards"
      />
      <circle cx="15" cy="20" r="3" fill="#1a1a1a" />
      <circle cx="50" cy="12" r="2" fill="#1a1a1a" />
    </svg>

    <svg class="corner-doodle top-right" width="80" height="80" viewBox="0 0 80 80">
      <path 
        d="M70 70 Q 75 40, 65 20 Q 55 5, 30 10 Q 10 15, 5 35" 
        stroke="#1a1a1a" 
        stroke-width="2" 
        fill="none"
        stroke-linecap="round"
        stroke-dasharray="200"
        style="animation: pencil-draw 1.5s ease 0.3s forwards; stroke-dashoffset: 200"
      />
      <path 
        d="M60 25 L 55 35 M 65 30 L 60 40" 
        stroke="#1a1a1a" 
        stroke-width="1.5" 
        stroke-linecap="round"
        stroke-dasharray="30"
        style="animation: pencil-draw 0.5s ease 1.5s forwards; stroke-dashoffset: 30"
      />
    </svg>

    <svg class="corner-doodle bottom-left" width="80" height="80" viewBox="0 0 80 80">
      <path 
        d="M10 10 Q 5 30, 20 50 Q 35 70, 60 65 Q 75 60, 70 45" 
        stroke="#1a1a1a" 
        stroke-width="2" 
        fill="none"
        stroke-linecap="round"
        stroke-dasharray="200"
        style="animation: pencil-draw 1.5s ease 0.5s forwards; stroke-dashoffset: 200"
      />
    </svg>

    <svg class="corner-doodle bottom-right" width="80" height="80" viewBox="0 0 80 80">
      <path 
        d="M70 10 Q 75 30, 60 50 Q 45 70, 20 65 Q 5 60, 10 45" 
        stroke="#1a1a1a" 
        stroke-width="2" 
        fill="none"
        stroke-linecap="round"
        stroke-dasharray="200"
        style="animation: pencil-draw 1.5s ease 0.7s forwards; stroke-dashoffset: 200"
      />
    </svg>

    <!-- Main title -->
    <div class="title-container">
      <div class="title-wrapper">
        <span 
          v-for="(letter, index) in letters" 
          :key="index"
          class="title-letter"
          :class="{ visible: letterStates[index], 'sketch-wiggle': letterStates[index] && animationPhase === 'complete' }"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          {{ letter }}
          <!-- Underline doodle for each letter -->
          <svg 
            v-if="letterStates[index]" 
            class="letter-underline"
            width="40" 
            height="10" 
            viewBox="0 0 40 10"
          >
            <path 
              d="M2 5 Q 10 2, 20 5 T 38 5" 
              stroke="#1a1a1a" 
              stroke-width="2" 
              fill="none"
              stroke-linecap="round"
              stroke-dasharray="50"
              style="animation: pencil-draw 0.3s ease forwards"
            />
          </svg>
        </span>
      </div>

      <!-- Pencil decoration -->
      <svg class="pencil-icon" width="60" height="60" viewBox="0 0 60 60">
        <path 
          d="M15 45 L 5 55 L 15 50 L 50 15 L 45 10 L 10 45 Z" 
          stroke="#1a1a1a" 
          stroke-width="2" 
          fill="#f5f5dc"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="200"
          style="animation: pencil-draw 1s ease 1.2s forwards; stroke-dashoffset: 200"
        />
        <path 
          d="M50 15 L 55 10 L 50 5 L 45 10 Z" 
          stroke="#1a1a1a" 
          stroke-width="2" 
          fill="#1a1a1a"
          stroke-dasharray="50"
          style="animation: pencil-draw 0.5s ease 1.8s forwards; stroke-dashoffset: 50"
        />
        <path 
          d="M5 55 L 8 52 L 10 55 Z" 
          fill="#1a1a1a"
          stroke-dasharray="20"
          style="animation: pencil-draw 0.3s ease 2s forwards; stroke-dashoffset: 20"
        />
      </svg>
    </div>

    <!-- Loading animation -->
    <div v-if="showLoading" class="loading-container">
      <div class="loading-dots">
        <span class="dot" style="animation-delay: 0s"></span>
        <span class="dot" style="animation-delay: 0.15s"></span>
        <span class="dot" style="animation-delay: 0.3s"></span>
      </div>
      <span class="loading-text">Loading...</span>
    </div>

    <!-- Auth Options -->
    <div v-if="showAuthOptions" class="auth-container">
      <p class="auth-title">Sign in to save your progress</p>
      
      <button 
        class="google-btn" 
        @click="handleGoogleSignIn"
        :disabled="isSigningIn"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span>{{ isSigningIn ? 'Signing in...' : 'Continue with Google' }}</span>
      </button>
      
      <p v-if="authError" class="auth-error">{{ authError }}</p>
      
      <button class="skip-btn" @click="skipSignIn">
        Play as Guest
      </button>
      
      <p class="auth-note">Your progress will only be saved on this device</p>
    </div>

    <!-- Creator credit -->
    <div class="creator-credit">
      <span class="credit-text">Created by</span>
      <span class="credit-name">Samathy</span>
      <!-- Small heart doodle -->
      <svg class="heart-doodle" width="20" height="18" viewBox="0 0 20 18">
        <path 
          d="M10 16 Q 5 12, 2 8 Q 0 5, 3 3 Q 6 1, 10 5 Q 14 1, 17 3 Q 20 5, 18 8 Q 15 12, 10 16 Z" 
          stroke="#1a1a1a" 
          stroke-width="1.5" 
          fill="none"
          stroke-dasharray="60"
          style="animation: pencil-draw 0.8s ease 2.2s forwards; stroke-dashoffset: 60"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.intro-container {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  background: var(--bg-paper);
  transition: opacity 0.5s ease;
  padding: var(--spacing-md);
}

.intro-container.fading {
  opacity: 0;
}

/* Corner doodles */
.corner-doodle {
  position: absolute;
  opacity: 0.4;
  width: clamp(40px, 10vw, 80px);
  height: auto;
}

.corner-doodle.top-left {
  top: var(--spacing-sm);
  left: var(--spacing-sm);
}

.corner-doodle.top-right {
  top: var(--spacing-sm);
  right: var(--spacing-sm);
}

.corner-doodle.bottom-left {
  bottom: var(--spacing-sm);
  left: var(--spacing-sm);
}

.corner-doodle.bottom-right {
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
}

/* Title */
.title-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title-wrapper {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(1px, 1vw, 4px);
  max-width: 95vw;
}

.title-letter {
  font-family: 'Caveat', cursive;
  font-size: clamp(2rem, 10vw, 5rem);
  font-weight: 700;
  color: var(--pencil-dark);
  opacity: 0;
  transform: translateY(20px) rotate(-5deg);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  position: relative;
  text-shadow: 
    1px 1px 0 rgba(26, 26, 26, 0.1),
    2px 2px 4px rgba(0, 0, 0, 0.1);
}

.title-letter.visible {
  opacity: 1;
  transform: translateY(0) rotate(0deg);
}

.title-letter.sketch-wiggle {
  animation: bounce-sketch 2s ease-in-out infinite;
}

.title-letter:nth-child(odd).visible {
  transform: translateY(-2px) rotate(1deg);
}

.title-letter:nth-child(even).visible {
  transform: translateY(2px) rotate(-1deg);
}

.letter-underline {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: clamp(20px, 5vw, 40px);
}

/* Pencil icon */
.pencil-icon {
  margin-top: var(--spacing-md);
  opacity: 0.8;
  width: clamp(40px, 10vw, 60px);
  height: auto;
}

/* Loading */
.loading-container {
  margin-top: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  animation: fade-in 0.5s ease forwards;
}

.loading-dots {
  display: flex;
  gap: clamp(4px, 2vw, 8px);
}

.dot {
  width: clamp(8px, 2vw, 12px);
  height: clamp(8px, 2vw, 12px);
  border: 2px solid var(--pencil-dark);
  border-radius: 50% 45% 55% 50%;
  background: transparent;
  animation: loading-dot 1.4s ease-in-out infinite;
}

.loading-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-medium);
  letter-spacing: 1px;
}

/* Creator credit */
.creator-credit {
  position: absolute;
  bottom: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  animation: fade-in 0.8s ease 2s forwards;
  opacity: 0;
}

.credit-text {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  color: var(--pencil-light);
}

.credit-name {
  font-family: 'Caveat', cursive;
  font-size: var(--font-size-lg);
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

/* Auth container */
.auth-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
  animation: fade-in 0.5s ease forwards;
}

.auth-title {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
  text-align: center;
}

.google-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 12px 24px;
  background: white;
  border: 2px solid var(--pencil-medium);
  border-radius: 8px;
  cursor: pointer;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-lg);
  color: var(--pencil-dark);
  transition: all 0.2s;
  box-shadow: 2px 2px 0 var(--pencil-light);
}

.google-btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--pencil-light);
}

.google-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.google-btn svg {
  flex-shrink: 0;
}

.auth-error {
  color: #dc2626;
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
}

.skip-btn {
  background: transparent;
  border: none;
  color: var(--pencil-light);
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-base);
  cursor: pointer;
  text-decoration: underline;
  padding: var(--spacing-xs);
}

.skip-btn:hover {
  color: var(--pencil-medium);
}

.auth-note {
  font-family: 'Patrick Hand', cursive;
  font-size: var(--font-size-sm);
  color: var(--pencil-light);
  text-align: center;
}

/* Pencil draw animation */
@keyframes pencil-draw {
  0% {
    stroke-dashoffset: 200;
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}

@keyframes bounce-sketch {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-3px) rotate(-1deg); }
  75% { transform: translateY(-2px) rotate(0.5deg); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes loading-dot {
  0%, 80%, 100% { 
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% { 
    transform: scale(1);
    opacity: 1;
  }
}
</style>
