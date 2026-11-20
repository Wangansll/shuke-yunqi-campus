FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com

COPY . .

EXPOSE 80
CMD ["node", "server.js"]
