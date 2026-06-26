FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY . .

RUN npx prisma generate
RUN npm run build

CMD ["node", "dist/index.js"]
