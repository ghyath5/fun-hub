FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY hub.js node.mjs ./
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "node.mjs"]
