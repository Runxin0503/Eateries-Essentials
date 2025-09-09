# Cornell Dining Flashcards App

A modern, interactive web application that displays Cornell University dining halls as swipeable flashcards with heart/like functionality and user authentication.

## Features

### 🍽️ **Flashcard Interface**
- Swipeable cards showing Cornell dining halls
- Front: Dining hall info with image placeholder, name, hours, and description
- Back: Detailed menus (breakfast, lunch, dinner, brunch)
- Touch/mouse swipe navigation and keyboard controls (arrow keys, spacebar to flip)

### ❤️ **Heart/Like System**
- Double-tap dining halls (when card is front-facing) to heart the dining hall
- Double-tap individual menu items (when card is flipped) to heart specific items
- Visual feedback with heart animations
- Instagram-like interaction pattern

### 👤 **User Authentication**
- Simple name-based sign-in system
- Device-based authentication (auto sign-in on same device)
- Profile management with sign-out functionality
- Must be signed in to use heart/like features

### 💾 **Data Persistence**
- User data stored in Docker volumes
- Hearts/likes persist across sessions
- Device recognition for automatic sign-in
- Sign-out removes device data for privacy

### 🎨 **Modern UI/UX**
- Responsive design for mobile and desktop
- Beautiful gradient backgrounds and smooth animations
- Touch-friendly interactions
- Loading screens and error handling

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Data Source**: Cornell Dining API
- **Containerization**: Docker & Docker Compose
- **Data Storage**: File-based JSON storage in Docker volumes

## Quick Start

1. **Clone and Navigate**
   ```bash
   git clone <repository-url>
   cd "eateries essentials"
   ```

2. **Build and Run**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

3. **Access the Application**
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3000

## API Endpoints

### Authentication
- `POST /api/auth/signin` - Sign in with name and device ID
- `GET /api/auth/check/:deviceId` - Check if user is signed in
- `DELETE /api/auth/signout/:deviceId` - Sign out and remove device data

### Dining Data
- `GET /api/dining/:date?` - Get Cornell dining data (defaults to today)

### Heart/Like System
- `POST /api/hearts/dining-hall` - Like/unlike a dining hall
- `POST /api/hearts/menu-item` - Like/unlike a menu item
- `GET /api/hearts/:userId` - Get user's hearts/likes

## Development

### Project Structure
```
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── styles.css
    └── script.js
```

### Environment Variables
- `NODE_ENV`: Set to 'production' in container
- `PORT`: Backend port (default: 3000)

### Data Storage
- User data: `/app/data/users.json`
- Hearts data: `/app/data/hearts.json`
- Stored in Docker volume: `user_data`

## Usage Instructions

1. **Navigation**
   - Swipe left/right or use arrow keys to navigate between dining halls
   - Click dots below cards to jump to specific halls
   - Press spacebar to flip current card

2. **Authentication**
   - Click profile button (top-right) to sign in
   - Enter your name to create an account
   - Device will remember you for future visits

3. **Liking Items**
   - Must be signed in to heart items
   - Double-tap dining hall name/image to heart the dining hall
   - Double-tap menu items to heart specific foods
   - Hearts are saved and persist across sessions

4. **Sign Out**
   - Click profile button and then "Sign Out"
   - Removes your data from this device
   - You'll need to sign in again to access hearts

## Contributing

1. Make changes to the codebase
2. Test locally with `docker-compose up --build`
3. Commit changes with descriptive messages
4. Update README if adding new features

## License

Built for educational purposes using Cornell University's public dining API.

---

**Enjoy exploring Cornell's dining options! 🏫🍕**
