@echo off
rem THE CONSTRUCT - inicia o sistema no Windows (requer Docker Desktop).
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker nao encontrado. Instale o Docker Desktop:
  echo https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)

if not exist .env copy .env.example .env >nul

docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Confira se o Docker Desktop esta aberto e tente de novo.
  pause
  exit /b 1
)

echo.
echo Pronto! Abrindo http://localhost:3000
echo (Se voce mudou a PORT no arquivo .env, use a porta escolhida.)
start "" http://localhost:3000
pause
