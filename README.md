# Cornell Dining Halls App

A modern, user-friendly web application for browsing Cornell University dining halls and their menus. Built with Docker for easy deployment and cross-platform compatibility.

## Features

### 🍽️ **Single-Column Layout**
- Simple, organized list of Cornell dining halls
- Each hall shows current status and operating hours
- Expandable menu sections for breakfast, lunch, dinner
- Date and time filtering for accurate information
- Mobile-responsive design with touch-friendly interactions

### ❤️ **Favorites System**
- Double-tap dining halls to add them to your favorites
- Visual feedback with heart animations
- Simple and intuitive interaction pattern

### 👤 **User Authentication**
- Simple name-based sign-in system
- Device-based authentication (auto sign-in on same device)
- Profile management with sign-out functionality
- Must be signed in to use favorites features

### 💾 **Data Persistence**
- User data stored in Docker volumes
- Favorites persist across sessions
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
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## API Endpoints

### Authentication
- `POST /api/auth/signin` - Sign in with name and device ID
- `GET /api/auth/check/:deviceId` - Check if user is signed in
- `DELETE /api/auth/signout/:deviceId` - Sign out and remove device data

### Dining Data
- `GET /api/dining/:date?` - Get Cornell dining data (defaults to today)

### Favorites System
- `POST /api/hearts/dining-hall` - Like/unlike a dining hall
- `POST /api/hearts/menu-item` - Like/unlike a menu item
- `GET /api/hearts/:userId` - Get user's favorites

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
- User data: `/app/data/hearts.json`
- Stored in Docker volume: `user_data`

## Usage Instructions

1. **Navigation**
   - Browse dining halls in a simple single-column layout
   - Use date selector to view menus for different days
   - Use time selector to filter by currently open dining halls

2. **Authentication**
   - Click profile button (top-right) to sign in
   - Enter your name to create an account
   - Device will remember you for future visits

3. **Adding Favorites**
   - Must be signed in to favorite items
   - Double-tap dining halls to add them to your favorites
   - Favorites are saved and persist across sessions

4. **Sign Out**
   - Click profile button and then "Sign Out"
   - Removes your data from this device
   - You'll need to sign in again to access favorites

## Contributing

1. Make changes to the codebase
2. Test locally with `docker-compose up --build`
3. Commit changes with descriptive messages
4. Update README if adding new features

## License

Built for educational purposes using Cornell University's public dining API.

---

**Enjoy exploring Cornell's dining options! 🏫🍕**
