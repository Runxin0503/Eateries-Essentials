# Multi-stage build combining backend and frontend for Fly.io deployment

# Stage 1: Build and setup backend
FROM node:18-alpine as backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./

# Stage 2: Final image with nginx and node
FROM nginx:alpine

# Install Node.js and supervisor for running multiple processes
RUN apk add --no-cache nodejs npm supervisor

# Create app directory
WORKDIR /app

# Copy backend from previous stage
COPY --from=backend-build /app/backend ./backend

# Copy frontend files
COPY frontend/ ./frontend/

# Copy nginx configuration (modified to proxy to localhost)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend static files to nginx html directory
COPY frontend/*.html frontend/*.css frontend/*.js frontend/*.png /usr/share/nginx/html/

# Update nginx config to point to localhost instead of backend service
RUN sed -i 's/http:\/\/backend:3000/http:\/\/localhost:3000/g' /etc/nginx/conf.d/default.conf

# Create supervisor configuration to run both nginx and node backend
RUN echo -e '[supervisord]\n\
nodaemon=true\n\
user=root\n\
\n\
[program:backend]\n\
command=npm start\n\
directory=/app/backend\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
\n\
[program:nginx]\n\
command=nginx -g "daemon off;"\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0' > /etc/supervisord.conf

# Expose port 80 for the frontend
EXPOSE 80

# Start supervisor to run both services
CMD ["supervisord", "-c", "/etc/supervisord.conf"]