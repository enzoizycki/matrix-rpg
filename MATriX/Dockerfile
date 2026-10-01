FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# O build só precisa de uma URL de banco em formato válido; nada se conecta nesta etapa.
# (As fontes do tema são baixadas da internet durante o build.)
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

ENV NODE_ENV=production
EXPOSE 3000
# As tabelas do banco são criadas automaticamente na inicialização.
CMD ["npm", "run", "start"]
