# Translation App - Socket.io Version

A real-time translation system using Socket.io for ultra-low latency communication. This version provides better performance than the Firebase version but requires server hosting.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start LibreTranslate
```bash
# Install LibreTranslate
pip install libretranslate

# Start LibreTranslate server
libretranslate
```

### 3. Start the Socket.io Server
```bash
npm start
# or for development with auto-restart:
npm run dev
```

### 4. Test the Integration
```bash
npm test
```

### 5. Open the App
- **Main page**: http://localhost:3000
- **Control page**: http://localhost:3000/control.html
- **Display page**: http://localhost:3000/display.html

### 6. Optional: HTTPS via ngrok
```bash
ngrok http 3000
# Use the HTTPS URL ngrok provides
```

## ⚡ Socket.io Features

### **Performance Benefits:**
- ✅ **Lower latency**: Direct WebSocket connection vs HTTP polling
- ✅ **Real-time**: True bidirectional communication
- ✅ **Efficient**: Only sends data when needed
- ✅ **Scalable**: Can handle thousands of concurrent connections

### **Server Features:**
- ✅ **Client tracking**: Knows who's connected and their type (control/display)
- ✅ **Custom events**: Streaming text and final translations
- ✅ **Acknowledgments**: Confirms message delivery
- ✅ **Health monitoring**: Server status endpoint with detailed metrics
- ✅ **Translation caching**: 1-hour cache TTL reduces API calls
- ✅ **Statistics tracking**: Monitor translation performance and cache hits
- ✅ **LibreTranslate integration**: Real machine translation with 48 languages
- ✅ **Error handling**: Graceful fallback with detailed error messages

### **Client Features:**
- ✅ **Auto-reconnection**: Handles connection drops
- ✅ **Status indicators**: Shows connection state with visual indicators
- ✅ **Event handling**: Real-time updates for streaming and final translations
- ✅ **Error handling**: Graceful failure recovery with fallback to original text
- ✅ **Speech recognition**: Web Speech API with interim and final results
- ✅ **Real-time streaming**: Shows live translation as user speaks
- ✅ **Translation history**: Maintains history with color-coded entries
- ✅ **Flag emojis**: Visual language identification with country flags
- ✅ **Dynamic language selection**: Input language selection with smart defaults
- ✅ **API-driven combinations**: Real LibreTranslate API language combinations
- ✅ **ASR confidence UI**: Numeric confidence on Control; High/Medium/Low on Display
- ✅ **Emoji indicators**: 🟢/🟠/🔴 mapped to high/medium/low ASR confidence
- ✅ **Seamless language switching**: Debounced stop/restart of ASR when input language changes

## 🎨 UI/UX Features

### **Modern Interface:**
- ✅ **Two-panel layout**: Control and history side-by-side
- ✅ **Color-coded history**: Progressive blue-to-gray color scheme
- ✅ **Flag emojis**: Visual language identification with country flags
- ✅ **Real-time indicators**: Connection status and streaming indicators
- ✅ **Responsive design**: Works on desktop, tablet, and mobile
- ✅ **Fullscreen mode**: Presentation-ready display page
- ✅ **Dynamic language dropdowns**: Populated from actual API data
- ✅ **Smart defaults**: English input → Dutch output, others → English output

### **Translation Display:**
- ✅ **Live streaming**: 25% size ratio for prominent live translation
- ✅ **Final translations**: Animated completion with language badges
- ✅ **History progression**: Newest entries with darkest blue, fading to gray
- ✅ **15-second persistence**: Live text stays visible for reading
- ✅ **Timestamp tracking**: Accurate time stamps for all translations
- ✅ **Join code UX**: Read-only after join, with "Change code" to switch sessions

## 🌐 LibreTranslate Integration

### **Real Machine Translation:**
- ✅ **48 languages**: Complete alphabetized list with flag emojis
- ✅ **High accuracy**: Professional translation quality via LibreTranslate
- ✅ **Alternatives**: Multiple translation options for each request
- ✅ **Caching**: 1-hour cache TTL reduces API calls and improves performance
- ✅ **Error handling**: Graceful fallback to original text with detailed logging
- ✅ **Form-encoded API**: Proper LibreTranslate API integration
- ✅ **Statistics tracking**: Monitor success rates, response times, and cache hits
- ✅ **API-driven combinations**: Real-time language combination validation

### **API Endpoints:**
- `POST /translate` - Translate text via LibreTranslate
- `GET /translation-stats` - View translation statistics and performance metrics
- `POST /clear-cache` - Clear translation cache
- `GET /health` - Server health check with client count and uptime

### **Language Selection Logic:**
- **Default Input Language**: English
- **Default Output Language**: 
  - When English is input → Dutch output
  - When any other language is input → English output
- **Dynamic Validation**: Only shows valid language combinations from LibreTranslate API
- **Runtime switching**: If mic is on, switching input language aborts and auto-restarts recognition with the new language; if mic is off, the language is applied immediately with a brief status notice

### **Supported Languages (48 total):**
- **en**: English (default input)
- **nl**: Dutch (default output for English)
- **es**: Spanish
- **fr**: French
- **de**: German
- **it**: Italian
- **pt**: Portuguese
- **ru**: Russian
- **ja**: Japanese
- **ko**: Korean
- **zh-Hans**: Chinese (Simplified)
- **zh-Hant**: Chinese (Traditional)
- **ar**: Arabic
- **pl**: Polish
- **tr**: Turkish
- **th**: Thai
- **uk**: Ukrainian
- **ur**: Urdu
- **sv**: Swedish
- **da**: Danish
- **nb**: Norwegian
- **fi**: Finnish
- **hu**: Hungarian
- **cs**: Czech
- **sk**: Slovak
- **bg**: Bulgarian
- **ro**: Romanian
- **sl**: Slovenian
- **et**: Estonian
- **lv**: Latvian
- **lt**: Lithuanian
- **el**: Greek
- **he**: Hebrew
- **hi**: Hindi
- **bn**: Bengali
- **fa**: Persian
- **id**: Indonesian
- **ms**: Malay
- **tl**: Tagalog
- **sq**: Albanian
- **az**: Azerbaijani
- **eu**: Basque
- **ca**: Catalan
- **gl**: Galician
- **ga**: Irish
- **ky**: Kyrgyz
- **eo**: Esperanto
- **pt-BR**: Portuguese (Brazil)

## 🎯 How It Works

### **Server (server.js):**
1. **Express server**: Serves static files and API endpoints
2. **Socket.io**: Handles real-time communication with CORS support
3. **LibreTranslate integration**: Server-side translation with caching
4. **Event handling**: Processes streaming and final translations
5. **Broadcasting**: Sends to all connected clients with acknowledgments
6. **Statistics tracking**: Monitors performance and cache efficiency
7. **Sessions & rooms**: In-memory sessions with 9-digit numeric codes; Socket.io rooms per session
8. **Role enforcement**: Only the Control of a session can broadcast translations to its room

### **Control Page:**
1. **Speech recognition**: Web Speech API with interim and final results
2. **Socket.io client**: Sends streaming and final translations to server
3. **Real-time streaming**: Shows live translation as user speaks
4. **Server-side translation**: Calls LibreTranslate API with caching
5. **Translation history**: Local history with color-coded entries
6. **Flag emojis**: Visual language selection with country flags
7. **Connection status**: Real-time connection indicators
8. **Dynamic language selection**: Input language selection with smart defaults
9. **Session code**: 9-digit code shown inline; persists across refresh; "Open Display" deep-link (`display.html?code=...`)
   - Visual grouping 3-3-3 via layout (no actual spaces in the text)
   - Click-to-copy writes digits-only to clipboard; highlight + Cmd/Ctrl+C also copies digits-only
   - Stored in `localStorage` along with a server-issued `resumeToken` to reclaim the same session after refresh/reconnect
10. **Language switching**: Debounced restart of ASR with clear status messages

### **Display Page:**
1. **Socket.io client**: Listens for real-time updates
2. **Real-time display**: Shows streaming text with 25% size ratio
3. **Final translations**: Displays completed translations with animations
4. **Translation history**: Maintains history with color-coded progression
5. **Connection status**: Bottom-right status indicator
6. **Fullscreen support**: Toggle fullscreen for presentation mode
7. **Responsive design**: Adapts to different screen sizes
8. **Join session**: Enter a code in any format (spaces/dashes allowed); field becomes read-only after join; "Change code" unlocks input to switch sessions
9. **Code display**: Shown as digits-only (no spaces) on the Display after join

## 📊 Performance Comparison

| Feature | Firebase Version | Socket.io Version |
|---------|------------------|-------------------|
| **Latency** | ~100-500ms | ~10-50ms |
| **Connection** | HTTP polling | WebSocket |
| **Scalability** | Firebase limits | Server capacity |
| **Deployment** | GitHub Pages | Server hosting |
| **Cost** | Free tier | Server costs |
| **Control** | Limited | Full control |

## 🔧 Customization

### **Adding New Events:**
```javascript
// Server
socket.on('custom-event', (data) => {
  socket.broadcast.emit('custom-event', data);
});

// Client
socket.on('custom-event', (data) => {
  // Handle custom event
});
```

### **Environment Variables:**
```bash
# LibreTranslate configuration
LIBRETRANSLATE_URL=http://127.0.0.1:5000
LIBRETRANSLATE_API_KEY=your_api_key_here
```

### **Language Combinations:**
The app automatically fetches and validates language combinations from the LibreTranslate API. The `public/language-combinations.js` file contains the current supported combinations and is updated automatically.

### **Sessions & Scaling:**
- Default: In-memory session store with 9-digit numeric codes and Socket.io rooms (`sess:<code>`)
- Optional Redis: When available, used for session persistence and the Socket.io Redis adapter (multi-instance ready)
- Session persistence: Control stores `controlSessionCode` + short-lived `resumeToken` in `localStorage` to resume the same session across refresh/reconnect
- Example Redis keys: `sess:<code>` (hash), `sess:<code>:presence` (set), `sess:<code>:displays` (set), `sess:<code>:resume:<token>` (string with TTL)
- Expiry & stale handling: TTL-based expiration with groundwork for warnings and rolling extension when active

## 🔒 Security Considerations

### **API Key Management:**
- API keys are stored in environment variables
- No hardcoded secrets in the codebase
- `.env` files are properly gitignored

### **CORS Configuration:**
- CORS is enabled for development
- Should be restricted to specific domains in production

### **Input Validation:**
- All translation requests are validated
- Text length and format are checked
- Error handling prevents crashes

## 🚀 Deployment

### **Requirements:**
- Node.js 16+ 
- LibreTranslate server running
- Environment variables configured

### **Production Setup:**
1. Set up environment variables
2. Configure CORS for your domain
3. Set up proper logging
4. Configure SSL/TLS
5. Set up monitoring and health checks

## 📝 License

MIT License - see LICENSE file for details. 