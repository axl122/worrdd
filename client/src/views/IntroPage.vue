<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const animationPhase = ref<'drawing' | 'complete' | 'fading'>('drawing')
const showLoading = ref(false)

// Letters to animate
const letters = ['W', 'W', 'O', 'O', 'R', 'R', 'D', 'D', '!']
const letterStates = ref<boolean[]>(new Array(letters.length).fill(false))

onMounted(() => {
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

  // Start fading to menu
  setTimeout(() => {
    animationPhase.value = 'complete'
  }, 3000)

  setTimeout(() => {
    animationPhase.value = 'fading'
  }, 3500)

  setTimeout(() => {
    router.push('/menu')
  }, 4000)
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
