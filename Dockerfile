# Build Stage
FROM node:24-alpine AS builder
WORKDIR /app

# Copy package files first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install

COPY . .
ARG VITE_API_BASE_URL=https://ai-cart-backend.onrender.com
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Runtime Stage
FROM node:24-alpine AS runtime
WORKDIR /app

COPY --from=builder /app ./
# The requested dev command needs Vite and the other development dependencies.
RUN npm install

# The runtime stage has its own environment and serves source through Vite.
ARG VITE_API_BASE_URL=https://ai-cart-backend.onrender.com
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000", "--strictPort"]
