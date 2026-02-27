# WORRDD! 📝

A multiplayer word game with a beautiful pencil sketch aesthetic. Create words from letters, compete with friends, and have fun!

![WORRDD Screenshot](screenshot.png)

## 🎮 How to Play

1. **Create or Join a Room** - Start a new game or join with a room code
2. **Wait for Players** - Need at least 2 players to start
3. **Make Words** - When the round starts, type words using only the letters shown
4. **Score Points** - Longer words = more points!
   - 3 letters: 1 point
   - 4 letters: 2 points
   - 5 letters: 4 points
   - 6 letters: 7 points
   - 7+ letters: 11 points
   - **Bonus**: Use ALL letters for +8 extra points!
5. **Win!** - Highest score after all rounds wins

## 🛠️ Tech Stack

- **Frontend**: Vue 3 + TypeScript + Pinia + Socket.IO Client
- **Backend**: Node.js + Express + Socket.IO
- **Styling**: Custom CSS with pencil sketch aesthetic
- **Deployment**: Netlify (frontend) + Render (backend)

## 📦 Installation

```bash
# Install all dependencies
npm run install:all

# Or install separately
npm install
cd client && npm install
cd ../server && npm install
```

## 🚀 Development

```bash
# Run both frontend and backend
npm run dev

# Or run separately
npm run dev:client  # Frontend at http://localhost:5173
npm run dev:server  # Backend at http://localhost:3001
```

## 🏗️ Build

```bash
# Build frontend for production
npm run build

# Build backend
cd server && npm run build
```

## 🌐 Deployment

### Frontend (Netlify)

1. Connect your GitHub repo to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `client/dist`
4. Set environment variable: `VITE_SERVER_URL` = your Render backend URL

### Backend (Render)

1. Connect your GitHub repo to Render
2. Set build command: `npm install && npm run build`
3. Set start command: `npm run start`
4. Set environment variable: `CORS_ORIGIN` = your Netlify frontend URL

## 📁 Project Structure

```
worrdd/
├── client/                 # Vue 3 frontend
│   ├── src/
│   │   ├── views/         # Page components
│   │   ├── stores/        # Pinia stores
│   │   ├── router/        # Vue Router config
│   │   └── style.css      # Global styles
│   └── netlify.toml       # Netlify config
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── index.ts       # Express + Socket.IO server
│   │   ├── rooms.ts       # Room management
│   │   ├── words.ts       # Word validation & scoring
│   │   └── types.ts       # TypeScript types
│   ├── data/
│   │   ├── words.txt      # Dictionary (50k words)
│   │   └── source_words.txt # Source words for rounds
│   └── render.yaml        # Render config
└── package.json           # Root package with scripts
```

## 🎨 Features

- **Pencil Sketch Aesthetic** - Hand-drawn fonts, sketchy borders, paper textures
- **Real-time Multiplayer** - Socket.IO for instant updates
- **Responsive Design** - Works on desktop and mobile
- **Room Codes** - Easy 6-character codes to share with friends
- **Host Controls** - Customize rounds, timer, and rules
- **Live Leaderboard** - See scores update in real-time

## 📝 License

MIT

---

Made with ✏️ and ❤️
