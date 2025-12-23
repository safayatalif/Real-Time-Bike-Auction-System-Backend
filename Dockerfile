FROM node:18-alpine

WORKDIR /app

# Install dependencies for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "start"]
