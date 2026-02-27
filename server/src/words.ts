import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load dictionary on startup
let dictionary: Set<string> | null = null
let sourceWords: string[] | null = null

// Cache for API-validated words (to avoid repeated API calls)
const apiValidatedWords = new Map<string, boolean>()

export function loadDictionary(): Set<string> {
  if (dictionary) return dictionary
  
  try {
    const wordsPath = path.join(__dirname, '..', 'data', 'words.txt')
    const content = fs.readFileSync(wordsPath, 'utf-8')
    dictionary = new Set(
      content
        .toLowerCase()
        .split(/\r?\n/)
        .map(w => w.trim())
        .filter(w => w.length >= 2 && /^[a-z]+$/.test(w))
    )
    console.log(`Loaded ${dictionary.size} dictionary words`)
    return dictionary
  } catch (error) {
    console.error('Failed to load dictionary:', error)
    // Fallback minimal dictionary
    dictionary = new Set(['word', 'game', 'play', 'letter', 'score', 'round', 'player', 'win'])
    return dictionary
  }
}

export function loadSourceWords(): string[] {
  if (sourceWords) return sourceWords
  
  try {
    const wordsPath = path.join(__dirname, '..', 'data', 'source_words.txt')
    const content = fs.readFileSync(wordsPath, 'utf-8')
    sourceWords = content
      .toLowerCase()
      .split(/\r?\n/)
      .map(w => w.trim())
      .filter(w => w.length >= 6 && w.length <= 9 && /^[a-z]+$/.test(w))
    console.log(`Loaded ${sourceWords.length} source words`)
    return sourceWords
  } catch (error) {
    console.error('Failed to load source words:', error)
    // Fallback source words
    sourceWords = [
      'letters', 'wording', 'spelling', 'writing', 'reading',
      'amazing', 'fantastic', 'creative', 'language', 'vocabulary'
    ]
    return sourceWords
  }
}

export function isInDictionary(word: string): boolean {
  const dict = loadDictionary()
  return dict.has(word.toLowerCase())
}

// Check if word is valid - uses local dict first, then API fallback
export async function isValidWordAsync(word: string): Promise<boolean> {
  const normalizedWord = word.toLowerCase().trim()
  
  // Check local dictionary first (fast)
  const dict = loadDictionary()
  if (dict.has(normalizedWord)) {
    return true
  }
  
  // Check API cache
  if (apiValidatedWords.has(normalizedWord)) {
    return apiValidatedWords.get(normalizedWord)!
  }
  
  // Fallback to Free Dictionary API
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)
    
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${normalizedWord}`, {
      method: 'HEAD',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    const isValid = response.ok
    apiValidatedWords.set(normalizedWord, isValid)
    
    // Also add to local dictionary for future use
    if (isValid) {
      dict.add(normalizedWord)
    }
    
    return isValid
  } catch (error) {
    // API failed - word not found or network error
    // Be lenient: accept words that look valid (3+ letters, only alphabetic)
    const looksValid = normalizedWord.length >= 3 && /^[a-z]+$/.test(normalizedWord)
    if (looksValid) {
      apiValidatedWords.set(normalizedWord, true)
      dict.add(normalizedWord)
    }
    return looksValid
  }
}

export function getRandomSourceWord(excludeWords?: Set<string>): string {
  const words = loadSourceWords()
  
  // Filter out already used words
  let availableWords = words
  if (excludeWords && excludeWords.size > 0) {
    availableWords = words.filter(w => !excludeWords.has(w))
  }
  
  // If all words have been used, reset and use all words
  if (availableWords.length === 0) {
    console.log('All source words have been used, resetting...')
    availableWords = words
  }
  
  return availableWords[Math.floor(Math.random() * availableWords.length)]
}

export function canBuildFromLetters(word: string, sourceWord: string): boolean {
  const wordLower = word.toLowerCase()
  const sourceLower = sourceWord.toLowerCase()
  
  // Count letter frequency in source word
  const sourceLetterCount: Record<string, number> = {}
  for (const char of sourceLower) {
    sourceLetterCount[char] = (sourceLetterCount[char] || 0) + 1
  }
  
  // Check if word can be built
  const wordLetterCount: Record<string, number> = {}
  for (const char of wordLower) {
    wordLetterCount[char] = (wordLetterCount[char] || 0) + 1
    if (!sourceLetterCount[char] || wordLetterCount[char] > sourceLetterCount[char]) {
      return false
    }
  }
  
  return true
}

export function usesAllLetters(word: string, sourceWord: string): boolean {
  return word.length === sourceWord.length && canBuildFromLetters(word, sourceWord)
}

// Scoring
export function calculatePoints(wordLength: number): number {
  if (wordLength === 3) return 1
  if (wordLength === 4) return 2
  if (wordLength === 5) return 4
  if (wordLength === 6) return 7
  return 11 // 7+ letters
}

export function calculateFullBonus(word: string, sourceWord: string, bonusEnabled: boolean): number {
  if (bonusEnabled && usesAllLetters(word, sourceWord)) {
    return 8
  }
  return 0
}

// Get random dictionary word for game modes
export function getRandomDictionaryWord(minLength: number = 4, maxLength: number = 8, excludeWords?: Set<string>): string {
  const dict = loadDictionary()
  let words = Array.from(dict).filter(w => w.length >= minLength && w.length <= maxLength)
  
  // Filter out already used words
  if (excludeWords && excludeWords.size > 0) {
    words = words.filter(w => !excludeWords.has(w))
  }
  
  // Fallback if no words available
  if (words.length === 0) {
    words = Array.from(dict).filter(w => w.length >= minLength && w.length <= maxLength)
  }
  
  return words[Math.floor(Math.random() * words.length)]
}

// Generate Guess Word puzzle (e.g., "a_p_e" for "apple")
export function generateGuessPuzzle(minLength: number = 5, maxLength: number = 8, excludeWords?: Set<string>): { word: string; puzzle: string; hint: string } {
  const word = getRandomDictionaryWord(minLength, maxLength, excludeWords)
  
  // Create puzzle - always show first letter, plus ~40% of remaining letters
  const letters = word.split('')
  const revealIndices = new Set<number>()
  revealIndices.add(0) // Always show first letter
  
  // Reveal ~40% of remaining letters (excluding first)
  const remainingIndices = Array.from({ length: word.length - 1 }, (_, i) => i + 1)
  const additionalReveals = Math.ceil((word.length - 1) * 0.4)
  
  while (revealIndices.size < additionalReveals + 1 && remainingIndices.length > 0) {
    const randomIdx = Math.floor(Math.random() * remainingIndices.length)
    revealIndices.add(remainingIndices[randomIdx])
    remainingIndices.splice(randomIdx, 1)
  }
  
  const puzzle = letters.map((l, i) => revealIndices.has(i) ? l : '_').join(' ')
  
  // Generate hint with more info
  const lastLetter = word[word.length - 1].toUpperCase()
  const hint = `Starts with "${word[0].toUpperCase()}", ends with "${lastLetter}" (${word.length} letters)`
  
  return { word, puzzle, hint }
}

// Generate Scramble puzzle
export function generateScramblePuzzle(minLength: number = 5, maxLength: number = 8, excludeWords?: Set<string>): { word: string; scrambled: string } {
  const word = getRandomDictionaryWord(minLength, maxLength, excludeWords)
  
  // Scramble the letters using Fisher-Yates shuffle
  const letters = word.split('')
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = letters[i]
    letters[i] = letters[j]
    letters[j] = temp
  }
  
  let scrambled = letters.join('')
  
  // Make sure it's actually scrambled
  while (scrambled === word) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = letters[i]
      letters[i] = letters[j]
      letters[j] = temp
    }
    scrambled = letters.join('')
  }
  
  return { word, scrambled: scrambled.toUpperCase() }
}

// Riddle type
interface Riddle {
  riddle: string
  answer: string
  category: string
}

// Load riddles from JSON file
let riddlesCache: Riddle[] | null = null

function loadRiddles(): Riddle[] {
  if (riddlesCache) return riddlesCache
  
  try {
    const data = fs.readFileSync(path.join(__dirname, '../data/riddles.json'), 'utf-8')
    riddlesCache = JSON.parse(data)
    return riddlesCache!
  } catch {
    console.error('Failed to load riddles.json')
    return []
  }
}

// Generate Game Teaser (riddle)
export function generateTeaser(): { riddle: string; answer: string; hint: string } {
  const riddles = loadRiddles()
  if (riddles.length === 0) {
    return { 
      riddle: 'I am a backup riddle. What has keys but no locks?', 
      answer: 'keyboard',
      hint: 'First letter: K (8 letters)'
    }
  }
  
  const riddle = riddles[Math.floor(Math.random() * riddles.length)]
  
  // Generate hint showing first letter and length
  const hint = `First letter: "${riddle.answer[0].toUpperCase()}" (${riddle.answer.length} letters)`
  
  return {
    riddle: riddle.riddle,
    answer: riddle.answer.toLowerCase(),
    hint
  }
}
