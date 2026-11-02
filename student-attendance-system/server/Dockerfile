FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p uploads/teachers uploads/students
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
CMD ["node", "src/app.js"]
