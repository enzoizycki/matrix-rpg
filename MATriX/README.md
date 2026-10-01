# MORPHEUS // Matrix RPG solo

Aplicação dedicada a **Matrix RPG, de Dan Aguiar / Artefato**, com as regras fornecidas pelo jogador incorporadas ao código. Homenagem não oficial à obra de Lilly e Lana Wachowski. O RPG é gratuito e feito de fã para fã; o uso de APIs pode ter custos do provedor.

## Jogar

1. Abra a aplicação: Morpheus apresenta uma introdução original, seguida da arte ASCII e do resumo do jogo.
2. Clique em **Entrar na Matrix**. Não há upload de PDF, escolha de outro sistema ou etapa de identificação pela IA.
3. Conecte **Google Gemini** ou **Ollama** no botão da conexão.
4. Escolha pelo chat entre **Resgatado**, **Reconectado** ou **Mundo Real**. Morpheus explica cada caminho e constrói a ficha com você, uma escolha por vez.
5. Revise e **aprove a ficha** antes de começar a aventura. Ela fica fixada na mesa, com Saúde, DM e os recursos do seu caminho.

O botão de livro abre as regras pesquisáveis. Morpheus consulta a mesma base: `src/lib/matrix/rulebook.ts`. O texto foi organizado a partir do material enviado, preservando tabelas e créditos. Notas de adaptação ficam explicitamente separadas das regras originais.

## Mecânicas digitais

- Apenas **d6** nesta edição. A bandeja permite quantidade e modificador, rolagem solicitada ou livre.
- **DM é um contador**: não é um terceiro dado rolado. Limite de 1 a 6 nesta adaptação; inicia em 3 para Resgatados e 2 para Reconectados.
- Resgatados: 2d6, maior na afinidade / menor fora dela, sucesso ≥ DM.
- Reconectados: 2d6, menor na afinidade / maior fora dela, sucesso ≤ DM. TH é diferente: maior ≥ DM.
- As faces são registradas no servidor. O servidor calcula os testes tipados e entrega a Morpheus a resolução; reenviar o mesmo resultado não duplica suas consequências.
- Trinity e Vet comparam os dois dados com o DM **anterior** ao teste.
- No Mundo Real somam-se 3d6 e os bônus contra a oposição rolada. Dano, custos e efeitos narrativos complementares são conduzidos por Morpheus conforme as regras.
- Os pontos pouco claros no texto original (empates, exemplo naval e tabela desalinhada) são identificados nas notas da adaptação; decisões devem ser anunciadas.

## Instalar em outro computador (Docker)

Requer [Docker Desktop](https://www.docker.com/products/docker-desktop/) no Windows/macOS ou Docker Engine com Compose no Linux.

1. Copie o projeto inteiro para o computador.
2. Windows: execute **iniciar.bat**. macOS/Linux: execute **sh iniciar.sh**.
3. Abra **http://localhost:3000**.

Alternativa: execute `docker compose up -d --build`.

O primeiro build requer internet para dependências e fontes. O banco é preparado automaticamente. A IA remota também requer internet; Ollama local usa o servidor/modelo instalado por você. Os dados ficam no volume `db-data`.

- Parar sem apagar: `docker compose down`.
- Atualizar código: `docker compose up -d --build`.
- Consultar erros: `docker compose logs app`.
- **Apagar o banco inteiro**: `docker compose down -v` (destrutivo).

Para acessar a mesma instalação de outro computador na rede local, abra `http://IP-DO-COMPUTADOR:3000`, conforme o firewall. O sistema é pessoal e não tem autenticação: **não o exponha publicamente sem proteção por login/VPN/proxy**. Instalações separadas têm bancos e configurações separados; copiar só o código não transfere campanhas/chaves. Para migrá-las, faça backup/restore do PostgreSQL.

## Provedores de IA

### Ollama Cloud — apenas sua chave

Crie a chave em **https://ollama.com/settings/keys**. Na aplicação, abra a conexão, escolha **Ollama → Ollama Cloud**, cole sua chave e valide.

`gemma4:31b` e `gpt-oss:120b` são opções com ferramentas. A lista de modelos é consultada no provedor. O app aceita a chave pura ou o comando `export OLLAMA_API_KEY="..."`; rejeita `YOUR_API_KEY`, que é só exemplo.

Também é possível definir `AI_PROVIDER=ollama`, `OLLAMA_API_KEY` e `OLLAMA_MODEL` no `.env`.

### Ollama local

Instale Ollama e um modelo com tool calling. Informe `http://localhost:11434` se o app roda fora do Docker, ou `http://host.docker.internal:11434` se roda dentro dele. O endereço é visto pelo **servidor da aplicação**, não pelo navegador remoto. No Linux, configure o Ollama para aceitar a rede do Docker e proteja a porta no firewall.

Use modelo com ferramentas e contexto suficiente. O app envia as regras centrais em todo turno e permite consulta das seções completas por ferramenta. Modelos pequenos podem ter dificuldade para seguir as regras.

### Google Gemini

Crie sua chave em **https://aistudio.google.com/apikey** e cole na aba Gemini. Ou defina `GEMINI_API_KEY` no `.env`.

As configurações salvas pelo site têm prioridade sobre `.env`. Elas ficam no banco e não são devolvidas ao navegador. Uma falha temporária de verificação não apaga a configuração. Revogue chaves expostas; não publique `.env` ou backups do banco.

## Sem Docker

Requisitos: Node.js 22+ e PostgreSQL 14+.

1. Crie um banco vazio.
2. Copie `.env.example` para `.env`, configure `DATABASE_URL` e a IA desejada.
3. Execute `npm install`, `npm run build` e `npm run start`.
4. Abra http://localhost:3000. As tabelas são criadas automaticamente.

## Campanhas de versões anteriores

Os dados antigos não são apagados. A edição atual inicia e retoma apenas campanhas marcadas como `matrix-artefato`. Livros de PDF anteriormente salvos e a pasta `rulebooks/` não substituem mais as regras incorporadas. Nenhum PDF precisa acompanhar esta instalação.

## Testes

`npx playwright test --config=playwright.config.cjs` executa os testes da edição Matrix. Os testes de integração que alteram a configuração da IA só são executados com `scripts/test-isolated.sh` em banco descartável. Eles usam um provedor simulado e não consomem uma chave real.

A introdução de Morpheus é um texto original desta adaptação, não diálogo transcrito do filme. Regras do RPG: Dan Aguiar / Artefato — www.artefatojogos.com.
