FROM node:20-slim

# Install OpenSSL (required for Prisma ORM)
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Use BuildKit cache mount to speed up npm installs across builds
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy the rest of the backend files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 4000

# Start the Express server
CMD ["npx", "ts-node", "server.ts"]
