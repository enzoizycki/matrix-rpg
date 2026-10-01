// Regras fornecidas pelo usuário nesta instalação, organizadas por seção para leitura e consulta.
// Não são regras de outros RPGs nem uma licença sobre a propriedade cinematográfica.
export const MATRIX_SYSTEM_ID = "matrix-artefato";
export const MATRIX_SYSTEM_NAME = "Matrix — Dan Aguiar / Artefato";
export const MATRIX_VERSION = "matrix-artefato/1";
export const MATRIX_SUMMARY = `[${MATRIX_VERSION}] RPG minimalista e narrativo de Dan Aguiar / Artefato, ambientado antes de Morpheus encontrar Neo. Usa d6, os atributos Corpo, Mente e Social, antecedentes e três caminhos: Resgatados, Reconectados e Deserto do Mundo Real. O DM é um contador, nunca uma rolagem.`;

export type MatrixRuleSection = { id: string; chapter: number; title: string; page: number; text: string };
export const MATRIX_CHAPTERS = ["Sobre o jogo", "A Pílula Vermelha", "A Pílula Azul", "O Deserto do Mundo Real", "O Oráculo", "Notas da adaptação"];

export const MATRIX_RULES: MatrixRuleSection[] = [
  { id: "credits", chapter: 0, title: "Alerta, autoria e proposta", page: 0, text: `Matrix é um jogo feito de fã para fã e totalmente gratuito. É uma homenagem à obra cinematográfica Matrix, lançada em 1999, cujo roteiro e direção pertencem a Lilly e Lana Wachowski.
Autor do RPG: Dan Aguiar. ARTEFATO — www.artefatojogos.com.
Com isso em mente: Siga o coelho branco.

Introdução: o autor conta que assistiu ao filme em 1999 e só anos depois compreendeu sua proposta. Questões como “E se Neo tivesse escolhido a pílula azul?”, “E se Neo tivesse fugido pelo telhado?” e “E se Cypher tivesse sido bem-sucedido?” inspiraram o jogo, originalmente publicado como panfleto em três volumes e depois compilado.
Matrix é um RPG minimalista. As regras são soltas; a narrativa tem muito mais importância. Quando faltar uma regra, o grupo pode criá-la, lembrando que o foco é a história.
Para jogar, o material pede três dados de seis lados, papel, lápis e borracha. As tabelas auxiliam partidas solo ou em grupo. Algumas regras posteriores pedem mais dados, como 6d6 para O Escolhido; podem ser rolados em lotes.
O jogo é essencialmente difícil em termos mecânicos: narrativa e criatividade são aliadas. O personagem não é Neo; o Oráculo descreve uma condição específica para tornar-se um Escolhido. Neo está prestes a despertar neste universo.
Sumário: Parte 1, A Pílula Vermelha, p.1; Parte 2, A Pílula Azul, p.7; Parte 3, O Deserto do Mundo Real, p.13; Parte 4, O Oráculo, p.28.` },
  { id: "red-creation", chapter: 1, title: "A Matrix tem você · criação de Resgatados", page: 1, text: `Matrix é uma realidade programada: tudo que se vê, cheira, prova e sente. Os humanos adormecidos servem às máquinas como fontes de energia. Quem não foi desconectado faz parte do sistema e pode defendê-lo como inimigo.
O cenário se passa ANTES de Morpheus encontrar Neo.
O Dado da Matrix (DM) é um d6 usado SOMENTE COMO CONTADOR: inicia em 3 e chega ao máximo 6. Esse dado NÃO É ROLADO. Eventos incrementam ou decrementam o DM.

Criação de personagem — Resgatado / Pílula Vermelha:
Atributos: Corpo, Mente e Social. Eles não recebem valores numéricos por distribuição de pontos; a escolha ou sorteio do antecedente determina a afinidade.
Saúde inicial: 5. Pontos de Distorção (PD) iniciais: 5.
Antecedente, 1d6 ou escolha:
1–2: esportista, bombeiro, ladrão, soldado… afinidade com Corpo.
3–4: professor, investigador, cientista, hacker, engenheiro… afinidade com Mente.
5–6: líder de gangue, político, chefe de empresa, comunicador, artista… afinidade com Social.

Equipe que resgatou o personagem, lance 1d6:
1–2: Ordeira — defende Zion discretamente; evita violência na Matrix porque ferir um conectado pode matá-lo no mundo real.
3–4: Caótica — não mede esforços para defender Zion. O sistema deve cair; a morte de conectados faz parte da guerra.
5–6: Piratas — humanos de comunidades resistentes além de Zion. Atuam livremente, podendo servir a seus próprios interesses ou aos das máquinas.` },
  { id: "red-tests", chapter: 1, title: "Testes e Pontos de Distorção", page: 2, text: `TESTES DOS RESGATADOS: lance 2d6. Se o atributo testado corresponde ao antecedente, considere o MAIOR dado; caso contrário, considere o MENOR. Não some esses dois dados.
Se o dado considerado é MAIOR OU IGUAL ao DM, a ação tem sucesso. Caso contrário, falha; uma falha incrementa o DM em 1 (até o máximo 6).
Distorção é o efeito de alguém consciente dentro da Matrix, permitindo alterar as regras desse mundo.
Cada personagem tem 5 PD.

Usos de PD:
• Alterar o valor do dado: 1 PD para sucesso automático; DM +1.
• Criar efeitos: 1 a 4 PD conforme o impacto da distorção; DM +1 a +4.
• Estabilizar a Matrix: 1 PD para reduzir o DM em 1.
• Contrabandear: com programa hacker, levar armas e equipamentos para a missão custa 1 PD irrecuperável durante essa missão.

Recuperação depende da equipe:
• Ordeira: distorções NÃO presenciadas por conectados recuperam 1 PD.
• Caótica: distorções presenciadas por conectados recuperam 1 PD.
• Pirata: usar equipamentos hacker dentro da Matrix recupera 1 PD.
Não ultrapasse 5 PD nem recupere durante a missão o ponto comprometido por contrabando.

Áreas de distorção:
Física: saltos gigantescos, desviar de balas, andar pelas paredes.
Química: alterar ebulição, atear fogo, alterar matéria.
Matemática: controlar probabilidades, manipular máquinas e sistemas.
Biologia: envelhecer ou rejuvenescer seres vivos, curar ou criar doenças e ferimentos.
São exemplos, não lista fechada. O jogador descreve e justifica o efeito; gasta a quantidade combinada de PD. Quanto mais fora da realidade, maior o custo. Use bom senso e narrativa.` },
  { id: "red-combat", chapter: 1, title: "Combate, ameaças e dano dos Resgatados", page: 3, text: `Quanto mais ações na Matrix, mais o sistema detecta e quer eliminar os personagens. Os conectados são inimigos em potencial:
DM 4: policiais, civis e criminosos próximos podem atacar.
DM 5: soldados e forças especiais.
DM 6: Agentes.

Os personagens dos jogadores SEMPRE têm iniciativa. Podem atacar ou esquivar.
Ataque é teste de Corpo com 2d6: use o maior com antecedente de Corpo, ou o menor sem ele. Compare o dado considerado com o DM; não é ataque de d20 e não há atributo numérico para somar.
Em seguida, role o dano da arma:
Punhos: 1d6.
Pistolas / revólveres: 1d6+1.
Metralhadoras: 1d6+2.
Rifles / fuzis: 1d6+3.
Espingardas: 1d6 +2 a +4 (definir conforme contexto).
O inimigo é derrotado se o resultado do dano for MAIOR OU IGUAL ao DM.
Quando o personagem sofre um ataque, o dano recebido é sempre igual ao DM.
Esquiva: teste simples de Corpo, ou automaticamente consumindo 1 PD.
Saúde 0: ainda pode ser resgatado por companheiros, com chance de sobreviver.
Saúde inferior a 0: o personagem morreu.
Não transforme os inimigos dentro da Matrix em blocos de PV de outro sistema.` },
  { id: "trinity", chapter: 1, title: "Trinity: os dois dados e o DM", page: 4, text: `Trinity ocorre quando os DOIS dados rolados em um teste e o valor atual do DM são iguais. O DM é o terceiro valor da comparação, não um terceiro dado lançado. Ex.: dados 4 e 4 com DM 4 = [4–4–4].
[1–1–1] Falha Crítica: problema em sistema conectado; acrescente 4 ao DM.
[2–2–2] Reboot: alguns sistemas reiniciaram; DM volta ao inicial 3.
[3–3–3] Déjà-vu: alguma mudança foi feita; o jogador pode rerrolar o próximo teste que realizar.
[4–4–4] Debug: todos os personagens conectados recebem 1d6 PD, até o máximo de 5.
[5–5–5] Firewall Desativado: no próximo turno os personagens podem solicitar ao operador qualquer arma ou equipamento.
[6–6–6] Proteção de Sistema Ativado: aparece um Agente para cada personagem; DM atinge o máximo 6.

Conectando em equipe: cada jogador tem seu próprio DM, que responde a suas ações. Os testes usam a média aritmética dos DMs do grupo. Aumentar ou reduzir o seu DM altera a dificuldade para todos. Em RPG solo com um personagem não se calcula média.` },
  { id: "red-missions", chapter: 1, title: "Missões, ideias e desconexão", page: 5, text: `Missões na Matrix — role 1d6 para cada coluna (ou use como inspiração):
D6 | O que fazer | Alvo | Onde
1 | Resgatar | Uma informação | Mega corporação
2 | Eliminar | Alguém conectado | Base militar
3 | Sequestrar | Um programa pirata | Apartamentos
4 | Corromper | Um sistema de defesa | Centro da cidade
5 | Hackear | Servidores de dados | Departamento de polícia
6 | Obter | Código-fonte | Usina de energia

Ideias — três colunas:
1: Homem | Taxista | Moto
2: Mulher | Médico | Carro
3: Idoso | Engenheiro | Caminhão
4: Criança | Professor | Ônibus
5: Adolescente | Advogado | Avião
6: Animais | Comerciante | Caminhonete

Ideias 0.1 — D6 e seis colunas:
1: Ferrugem | Infantil | Asfalto | Luz | Fogo | Traidor
2: Novo | Plástico | Roupas | Dia | Água | Fuga
3: Caro | Metal | Música | Noite | Grito | Cidade
4: Quebrado | Sangue | Frio | Tarde | Doente | Doença
5: Fedor | Telefone | Chuva | Torre | Pobre | Caminho
6: Colorido | Dinheiro | Filmes | Fios | Rico | Hacker

Oráculo sim/não, 1d6:
1 Não; 2 Não e…; 3 Não, mas…; 4 Sim; 5 Sim e…; 6 Sim, mas…

Sair da Matrix: é preciso atingir um TELEFONE FIXO e ter pelo menos 1 PD remanescente para se desconectar. Não invente saída por celular. O texto exige o PD remanescente, mas não explicita se é consumido na desconexão: Morpheus deve avisar se adotar esse custo como decisão de mesa.` },
  { id: "blue-creation", chapter: 2, title: "As pílulas e os Reconectados", page: 7, text: `A pílula vermelha convida a conhecer a verdade e sair da Matrix. Contém um programa de busca para a equipe localizar o corpo nas usinas.
A pílula azul apaga a memória do conectado e a relação com a equipe de resgate. Essa amnésia devolve a consciência ao padrão da Matrix por um programa de Reboot. Escolher a pílula é decisão exclusiva do conectado; qualquer opção muda sua vida.
A Matrix identificou o Reboot e passou a rastrear quem escolheu permanecer no sistema. Esses humanos passam a servir às máquinas.

Criação de Reconectado / Pílula Azul:
Atributos Corpo, Mente, Social, determinados pelo antecedente. Saúde 5; Humanidade (PH) 3 a 5 conforme a Função. DM inicial 2.
Antecedente, 1d6 ou escolha:
1–2: esportista, bombeiro, ladrão, soldado… Corpo (a lista original chama de “Físico”, sinônimo contextual de Corpo).
3–4: professor, investigador, cientista, hacker, engenheiro… Mente.
5–6: líder de gangue, político, chefe de empresa, comunicador, artista… Social.

Função após reinserção, 1d6 ou escolha:
1–2: Agente — maior ameaça às equipes conectadas. Cria distorções sem as penalidades dos Resgatados. Humanidade inicial e máxima 3.
3–4: Fantasma — navega pela rede elétrica e telefônica, controla aparelhos mecânicos/eletrônicos e atravessa barreiras reconfigurando seu código. Humanidade 4.
5–6: Sabotador — mais humano dos Reconectados. Emite falsos sinais de desejo de despertar, atraindo equipes de resgate; age com Agentes para caçar Resgatados. Humanidade 5.
Reconectados usam Humanidade, não os 5 PD dos Resgatados.` },
  { id: "blue-tests", chapter: 2, title: "Testes invertidos dos Reconectados", page: 8, text: `DM inicial do Reconectado é 2. Como faz parte do sistema, seus testes visam um resultado MENOR OU IGUAL ao DM. Um DM elevado favorece a ação mecânica, mas ameaça a Humanidade.
Role 2d6. Se o atributo testado pertence ao antecedente, fique com o MENOR; caso contrário, com o MAIOR. Não some os dados.
Resultado considerado ≤ DM: sucesso. Resultado > DM: falha. Falhar acrescenta 1 ao DM, pois um programa não deveria falhar.
Pode rerrolar o resultado de UM dado reduzindo o DM em 1.

Servindo à Matrix: seguir ordens à risca. Os Reconectados eram humanos e ainda carregam características representadas por Humanidade, parcialmente irreconhecíveis pelo sistema.
Toda vez que o DM atingir 5, faça um Teste de Humanidade (TH). Se falhar, perca 1 PH.
Ao chegar a Humanidade 0, o jogador perde o controle do personagem para a Matrix.` },
  { id: "humanity", chapter: 2, title: "Teste de Humanidade e seus custos", page: 9, text: `TESTE DE HUMANIDADE (TH): role 2d6 e SEMPRE use o MAIOR resultado. É bem-sucedido se esse maior resultado é MAIOR OU IGUAL ao DM. Um TH bem-sucedido sempre recupera 1 PH, respeitando o limite da Função e as perdas permanentes. Não confundir TH com o teste comum invertido do Reconectado.

Efeitos de Humanidade (principalmente interpretativos):
Criatividade: programas improvisam com a base de dados, mas não criam como humanos desconectados. Ações criativas exigem TH; falha aumenta DM de 1 a 3, conforme a ação.
Mentira: programas são literais. Mentir ou omitir deliberadamente exige TH; falha aumenta DM de 1 a 3, conforme a importância da informação.
Afeto / empatia: simular emoção humana complexa consome 2 PH e aumenta DM em 1.
Reagir à dor / sangramento: Agentes e Fantasmas não sentem dor nem sangram; simular isso para conectados consome 1 PH e aumenta DM em 1.
Simular necessidades fisiológicas: essencial em abordagens sociais; consome 1 PH e aumenta DM em 1.
Usos humanos anômalos podem fazer a Matrix perseguir e exterminar o Reconectado.` },
  { id: "blue-combat", chapter: 2, title: "Combate e distorções por Função", page: 10, text: `Ameaças para Reconectados: DM 4 policiais, civis e criminosos; DM 5 soldados e forças especiais; DM 6 Deletador, o Agente que caça e deleta Reconectados.
Jogadores sempre têm iniciativa. Ataques são testes de Corpo com 2d6: menor com antecedente correspondente, maior sem ele; sucesso ≤DM.
O dano do Reconectado é FIXO e baseado no DM — não pedir rolagem de dano de Resgatado:
Punhos DM−1; armas brancas DM; pistolas/revólveres DM+1; metralhadoras DM; rifles/fuzis DM+1; espingardas DM+2.
Inimigo derrotado se o dano for ≥5.
Dano sofrido é igual ao DM.
Esquiva: teste de Corpo ou diminuir DM em 1 para evitar automaticamente, sem reduzir o DM abaixo de 3 por essa esquiva.
Saúde 0: upload para outro corpo aleatório, conservando a Função. Custa 2 pontos PERMANENTES de Humanidade. Sem Humanidade suficiente, é eliminado da Matrix. Não restaure a reserva ou o limite de Humanidade silenciosamente.

Distorções por Função (exemplos; novas são possíveis narrativamente):
Agente: leis físicas sobre um corpo — gravidade, velocidade, força. Especial: mudar de corpo custa 1 PH.
Fantasma: eletricidade e aparelhos mecânicos/eletrônicos. Deslocar-se até 10 metros pela rede elétrica custa 2 PH; atravessar barreira sólida custa 1 PH.
Sabotador: biologia; hackear sistemas biológicos. Matar uma pessoa durante o processo causa perda de 1 PH permanente.` },
  { id: "vet", chapter: 2, title: "Vet x3 e ordens da Matrix", page: 11, text: `Vet x3: os dois dados de um teste mais o valor atual do DM são iguais; o DM não é rolado.
[1–1–1] Reboot: DM volta ao inicial 2.
[2–2–2] Redefinição de Parâmetros: faça TH; se bem-sucedido, recupere 1d6 PH até o máximo da Função.
[3–3–3] Desfragmentação: faça TH; se falhar, DM+1 e um Deletador estará caçando o personagem.
[4–4–4] Admin: permissão momentânea para alterar a Matrix; atribua o valor que quiser ao DM.
[5–5–5] Falta de RAM: o sistema congelou alguns processos; DM−1.
[6–6–6] Hackers: uma equipe hackeou a segurança; DM−2.

Ordens — role 1d6 para cada coluna:
D6 | O que fazer | Alvo | Onde
1 | Rastrear | Uma ação suspeita | Boate
2 | Eliminar | Alguém conectado | Galpão
3 | Interceptar | Um programa pirata | Apartamentos
4 | Grampear | Um Resgatado | Centro da cidade
5 | Hackear | Uma equipe | Universidade
6 | Investigar | Arquivos | Porto` },
  { id: "desert-people", chapter: 3, title: "2199 · Zion e outros povos", page: 13, text: `O ano é próximo de 2199. Humanos vivem à sombra das máquinas que criaram. Zion fica quilômetros abaixo da superfície, perto do núcleo ainda quente. Quem defende a cidade raramente explora a superfície fria e escura: a humanidade queimou a atmosfera tentando impedir a energia solar das máquinas.
Naves e veículos de flutuação magnética cruzam os esgotos das cidades mecânicas procurando falhas para invadir a Matrix.
Além de Zion, humanos sobreviveram em tribos de superfície com crenças baseadas nas máquinas.

Vermes (PV 4 a6): vivem nas entranhas das cidades das máquinas. Adoram-nas como divindades porque geram calor. Limpam estruturas, fazem graxa com corpos humanos descartados e lubrificam engrenagens. Máquinas os ignoram por serem submissos e úteis. Marcam os corpos com graxa em símbolos de engrenagens, garras, cabos e correntes. Atacam vorazmente quem tenta “machucar” suas divindades.
Ludistas (PV 5 a7): guerrilhas e resistência na superfície, inspiradas no movimento da Revolução Industrial. Enfrentam Rastreadores com armas improvisadas e usam carcaças para armaduras e implantes cibernéticos. Conflitos com Vermes são frequentes.` },
  { id: "desert-pirates", chapter: 3, title: "Piratas e Sentinelas", page: 14, text: `Piratas (PV 5 a7): únicos desses povos de superfície capazes de emitir sinal pirata por suas naves para acessar a Matrix. Originaram-se de três capitães expulsos de Zion, que fugiram com naves e tripulações, libertando mentes para fortalecê-las. Após a morte dos capitães, as tripulações perderam diretrizes e criaram novas naves e ideologias, sem se unir a Zion.
Saqueiam tecnologias, discos de treinamento e sistemas operacionais atualizados. Somente os piratas desenvolveram camuflagem que faz Sentinelas verem suas naves como máquinas no Mundo Real.
Os Resgatados e os demais povos conflitam por objetivos distintos, mas as máquinas ameaçam todos, da superfície ao núcleo.

Sentinelas: máquinas semelhantes a lulas; flutuam por campos magnéticos, sozinhas ou em bandos. Caçam e destroem naves nas profundezas, patrulhando rotas de Zion. Armadas com garras e laser direcional. PV 15 a20. Quando destruídas fornecem 2d6 sucatas.` },
  { id: "desert-machines", chapter: 3, title: "Máquinas e funções de tripulantes", page: 15, text: `Drones: insetoides; sobrevoam ruínas da superfície procurando organismos complexos. Metralhadoras de baixo calibre. PV 10 a12. Sucata1d6 quando destruídos.
Rastreadores: androides bípedes humanoides que patrulham instalações militares, combustíveis fósseis e restos de energia nuclear. Há modelos de combate (armas variadas) e de exploração (membros especiais para deslocamento). Ludistas os caçam e desmontam para implantes. PV 10 a14. Sucata1d6 +1 implante quando destruídos.
Batalhóides: robôs de cerca de 3m usados na guerra contra humanos. Soterrados sob ruínas, ainda funcionam como torretas ao detectar organismos complexos. PV 12 a14. Sucata2d6 quando destruídos.

No deserto: Resgatados podem defender Zion ou ser piratas, conforme a equipe que os resgatou. Recuperadas as funções fisiológicas a bordo, trabalham como tripulantes e podem assumir funções segundo a afinidade.
Operador (Mente, PV 5): emite sinal de invasão à Matrix; viabiliza entrada/saída, carrega treinamento, armas e equipamentos. Obtém informações sobre estruturas, pessoas, políticas e veículos.
Capitão (Social, PV 5): gerencia recursos e tripulação, designa missões e pilota a nave. Só ele autoriza libertar uma mente e responde por ela perante Zion até que se prove digna.
Engenheiro (Mente, PV 5): manutenção e melhoria da nave, armas, restauração de energia, preparação e reparação do pulso eletromagnético.
Atirador (Corpo, PV 5): controla pelos joysticks as armas de projéteis da nave.` },
  { id: "desert-tests", chapter: 3, title: "Testes, combate e durabilidade no Mundo Real", page: 16, text: `No Mundo Real não se usam PD ou DM para resolver ações. Testes e combates: jogador rola 3d6 e SOMA. O desafio/oponente rola 2d6 + modificador do desafio + modificador de bom senso de 1 a4 conforme vantagens e desvantagens narrativas.
Compare as somas. Em combate, a diferença positiva é dano causado; com soma inferior, o personagem sofre dano ou falha. O texto não define todos os empates: combine uma decisão de mesa e avise.
Exemplo: Resgatado contra Verme no território dos Vermes; o adversário recebe +3 por vantagem de terreno. Jogador2+4+5=11; Verme4+2+3=9. Diferença2, logo2 de dano no Verme.

Armas e equipamentos encontrados, criados ou negociados: até 3 níveis de durabilidade. Cada nível concede seu valor como bônus de ataque (arma) ou defesa (equipamento), somado aos3d6.
Ao encontrar/negociar arma ou equipamento, role 1d6: 1–2 nível1; 3–4 nível2; 5–6 nível3.
Não use as regras invertidas dos Reconectados nem seleção maior/menor nesse cenário.` },
  { id: "desert-missions", chapter: 3, title: "Exploração e missões no Deserto", page: 17, text: `Escavadores saem da proteção das naves e de Zion para buscar matéria-prima: ruínas, desertos, esgotos das cidades mecânicas e campos de batalha com sucata de máquinas.
Missões — role 1d6 para cada coluna:
1 Rastrear | Uma nave | Esgotos
2 Eliminar | Um líder Verme | Zion
3 Interceptar | Sistemas de segurança | Cidade das máquinas
4 Sabotar | Um líder Ludista | Acampamento dos Ludistas
5 Capturar | Uma Sentinela | Acampamento dos Vermes
6 Investigar | Piratas | Ruínas

Recompensas | Desafios | Reviravoltas:
1 Sucatas(1d6) | Vermes(1d6) | Alguém ajuda
2 Arma | Piratas(1d6) | Ameaça maior
3 Equipamentos | Ludistas(1d6) | Tempestade
4 Implantes | Sentinelas(2d6) | Armadilha
5 Munição | Drones(1d6−1) | Emboscada
6 Renome | Rastreadores(1d6−1) | Ataque a Zion

Ideias (seis colunas):
1 Ferrugem | Infantil | Asfalto | Luz | Fogo | Traidor
2 Novo | Plástico | Roupas | Dia | Água | Fuga
3 Caro | Metal | Arma | Noite | Grito | Cidade
4 Quebrado | Sangue | Frio | Tarde | Doente | Doença
5 Fedor | Telefone | Chuva | Torre | Pobre | Caminho
6 Colorido | Sucata | Nave | Fios | Rico | Fome

Oráculo1d6: 1 Não; 2 Não e…; 3 Não, mas…; 4 Sim; 5 Sim e…; 6 Sim, mas…` },
  { id: "ships-scout", chapter: 3, title: "Vida a bordo e Naves Batedoras", page: 18, text: `A nova vida como tripulante: a guerra contra as máquinas não se limita à conexão. O Resgatado se adapta ao deserto, assume função e protege a nave e as informações de máquinas e piratas. Piratas planejam obter tecnologia de Zion enquanto evitam Sentinelas.
Tripulação usual: capitão, engenheiros, operadores e atiradores. O número depende do tamanho e da importância da nave.

Naves Batedoras: PV 35 +5 por Engenheiro a bordo. Quando destruídas: 1d6+10 sucatas.
Pequenas, ágeis, em geral sem equipamento de conexão à Matrix. Tripulação de capitão, engenheiro e atiradores. Percorrem esgotos em alta velocidade para mapear rotas seguras e atrair/despistar enxames de Sentinelas.
Também resgatam os recém-libertos no campo de descarte das máquinas. O baixo custo de produção faz com que sejam comuns entre piratas.` },
  { id: "ships-cargo", chapter: 3, title: "Naves de Carga e Mineração", page: 19, text: `Naves de Carga e Mineração: PV 70 +15 por Engenheiro a bordo. Quando destruídas: 3d6+20 sucatas.
Zion produz recursos, mas ainda organiza missões de extração de matéria-prima na superfície. A cidade teme rastreamento, saque e morte pelas máquinas ou por humanos.
São naves grandes e poderosas, com tripulação ampla, mineiros e Escavadores. Normalmente capitão, engenheiros, atiradores e trabalhadores.
Por segurança não levam equipamentos de conexão à Matrix, pois são muito cobiçadas pelos piratas. Naves Batedoras fazem sua escolta.` },
  { id: "ships-transcoding", chapter: 3, title: "Naves de Transcodificação", page: 20, text: `Naves de Transcodificação: PV 50 +10 por Engenheiro a bordo. Quando destruídas: 2d6+15 sucatas.
Tecnologia complexa para emitir sinal pirata e invadir a Matrix. É mais seguro transmitir fora de Zion. Há rumores de nova tecnologia que permitiria conectar dentro da cidade sem rastreamento, atraindo a cobiça dos piratas.
Um operador conecta a equipe para missões na Matrix. Essas naves passam longos períodos nos esgotos e campos de cultivo buscando sinais de desejo de despertar; rastreiam o corpo para resgatá-lo antes dos Agentes.
Um capitão dedica muito tempo à busca do Escolhido, acreditando na Profecia de alguém capaz de moldar a Matrix e trazer paz. O Conselho o respeita publicamente, mas o considera maluco em privado.
Tripulação: capitão, operador, engenheiros e atiradores.` },
  { id: "ship-fuel", chapter: 3, title: "Estrutura das naves · combustível", page: 21, text: `Naves usam combinação de eletricidade com combustível nuclear para produzir o campo magnético de levitação e deslocamento. Engenheiros de Zion aperfeiçoaram essa tecnologia ao longo dos séculos.
As máquinas identificaram os minérios necessários e destruíram muitas reservas ao redor de Zion, forçando missões de carga e mineração.
Piratas adaptaram a tecnologia e encontraram fonte mais eficiente nas entranhas das cidades mecânicas. Contratam Ludistas para infiltrar-se entre os Vermes e obter informações sobre “O Grande Deus”.
Os Vermes dão esse nome a estruturas brilhantes cercadas pelas máquinas nas profundezas: geram calor e parecem veneradas pelas próprias máquinas. Existem vários pontos assim.
Na realidade são jazidas de material radioativo isoladas em metal. O comportamento de devoção é proteção e escaneamento das máquinas para usar o minério como energia em vez de corpos humanos, possibilitando eliminar a humanidade.
A nave consome combustível ao navegar, disparar armas e emitir PEM. O consumo é lento, mas constante preocupação. Não há capacidade numérica universal fornecida no texto; inventar uma exige acordo explícito.` },
  { id: "ship-weapons-pem", chapter: 3, title: "Armas, defesa e PEM", page: 22, text: `Armas usuais das naves: metralhadoras e canhões que concentram plasma gerado pela eletricidade e combustível. Piratas também usam projéteis, mais baratos. Atiradores operam essas armas.
Metralhadoras: +1 dano. Canhão: +4 dano.
Defesas: placas metálicas e outros materiais resistentes. Engenheiros consertam avarias com sucata, mantendo também o armamento.
PEM, pulso eletromagnético: último recurso desesperado do capitão. Consome enorme quantidade de combustível e desliga equipamentos eletromecânicos no raio de ação, inclusive os de invasão à Matrix, separando a mente do corpo dos conectados.
Somente o capitão pode ordenar a ativação do PEM. Não tratar como uma saída segura para quem está conectado.` },
  { id: "ship-systems", chapter: 3, title: "Sistemas e o trabalho do operador", page: 23, text: `Sistemas operacionais localizam, resgatam e treinam mentes libertadas. Vão de engenharia molecular avançada a culinária gourmet; são instalados por upload na mente dos Resgatados.
O operador desenvolve sistemas, realiza instalação e fornece informações, equipamento e armamento para incursões.
Sua maior responsabilidade é criptografar sistemas e sinais de invasão contra a Matrix e piratas. Um operador inexperiente pode contaminar o código de um equipamento, que será detectado como vírus e perseguido por Agentes.` },
  { id: "ship-combat", chapter: 3, title: "Combate entre naves", page: 24, text: `Combate entre naves é comum em emboscadas piratas contra embarcações de mineração e transcodificação. Piloto/capitão e atiradores devem agir coordenadamente.
Role 1d6 para o piloto:
1–3 Bom posicionamento: role 1d6 e some o valor do dado do piloto.
4–5 Mau posicionamento: role 1d6.
6 Sem possibilidade de acertar.

Canhão: antes do disparo, role 1d6 e altere o dado do piloto: acrescente1 se o dado do canhão sair1–3; acrescente2 se sair4–6. Concentrar energia e combustível pode atrapalhar a navegação.
Se o dado do piloto sair da faixa boa, passa a mau posicionamento e causa apenas1d6 em vez de 1d6 + dado do piloto. Se ultrapassar a faixa má, falha.
O texto também informa bônus de arma (p.22), metralhadora+1 e canhão+4.
Exemplo original: piloto2; canhão5, somando2 ao piloto e levando-o a4 (mau posicionamento); o exemplo declara1d6+4 de dano. Não omita a diferença entre a fórmula básica do parágrafo e o exemplo. Avise como aplicará o bônus do canhão antes de resolver uma ambiguidade.
Dano reduz PV da nave. Nave em 0PV é destruída.
Após combate, reparar1 de dano custa1 sucata.` },
  { id: "ship-evasion", chapter: 3, title: "Manobra evasiva e adversários", page: 25, text: `Capitão/piloto pode sacrificar seu próximo turno de ataque para tentar esquivar.
Role 2d6 simultâneos: um representa seu capitão, outro o capitão adversário. Depois role o terceiro d6 como referência.
• Seu dado mais próximo da referência: manobra bem-sucedida, mas recebe METADE do dano.
• Seu dado igual à referência: manobra perfeita, sem dano.
• Seu dado mais distante: falha, recebe dano integral.
• Dado do oponente igual à referência: ataque excelente, recebe dano integral +1d6.
Empates de distância ou ambos exatos não são resolvidos explicitamente pelo texto; combine a prioridade e avise.

Adversários causam dano pela tabela1d6:
1–2: 5 dano.
3–4: 6 dano.
5: 7 dano.
6: 8 dano.` },
  { id: "real-equipment", chapter: 3, title: "Armas, equipamentos e sucata", page: 26, text: `No Deserto as armas dependem da criatividade de engenheiros armeiros, não de distorções da Matrix. Mesmo feitas de sucata, são produtos de alta tecnologia.
Habitantes e tripulantes de Zion devem registrar armas perante o Conselho e responder por elas. Perdidas ou roubadas, devem tentar recuperá-las. Piratas frequentemente têm tecnologia ultrapassada e valorizam a informação de que uma nave de Zion carrega armas.
A tabela fornecida no texto veio com colunas desalinhadas. Leitura organizada dos valores visíveis (confirmar narrativamente se houver dúvida):
Armas de projétil | Dano adicionado no combate | Custo médio em sucata
Pistola / Revólver | +1 a +2 | 35
Submetralhadora | +3 | 45
Espingarda | +2 a +4 | 60
Granada de Fragmentação | +4 a +5 | 50
Armas de energia:
Espingarda de Energia | +5 | 250
Granada de Energia | +6 | 120
Valores são base e podem variar com a narrativa. O texto menciona o dado/valor da arma adicionado ao combate, mas a tabela colada mostra bônus; não invente tamanhos de dados para os itens.
Sucata significa RECURSOS TECNOLÓGICOS FUNCIONAIS: mistura de metal e objetos tecnológicos utilizáveis, de placas a microchips. O resto é lixo.
Personagens carregam até 5 sucatas sem mochila ou outro equipamento; naves de carga suportam quantidades enormes. A natureza da sucata depende do contexto.` },
  { id: "oracle", chapter: 4, title: "Temet Nosce · o Oráculo", page: 28, text: `O Oráculo é um programa enigmático capaz de assumir formas diferentes, que prefere feições humildes, carinhosas, maternas e empáticas.
Mostra caminhos às mentes incomodadas que procuram, mesmo sem saber, ser resgatadas. Sua função é equilibrar o sistema: uma mente inquieta pode afetar outras.
Usa a Matrix para instigar possíveis despertos através de questionamentos filosóficos sobre a própria existência, algo que as máquinas não sabem fazer.
“Conhece-te a ti mesmo.”
Motivações são mensagens pessoais e interpretativas que orientam missões. Cabe ao jogador justificá-las durante a partida. Ao compreender uma motivação, o personagem pode criar seu próprio efeito de Distorção da Matrix.
Para gerar uma motivação, lance 1d6 para CADA uma das três colunas da tabela. Não escolha resultados aleatórios sem rolagens quando prometer sorteá-los.` },
  { id: "motivations-chosen", chapter: 4, title: "Motivações e O Escolhido", page: 29, text: `Motivações — combine três resultados de 1d6:
Coluna 1:
1 Aquilo que você ama
2 Uma dor que você sente
3 Um caminho que você procura
4 A resposta que você espera
5 O segredo que você carrega
6 A vida de quem você ama
Coluna 2:
1 Estará perto de acabar
2 Será colocado à prova
3 Se apresentará para você
4 Será trocado por outra vida
5 Surgirá como um presente
6 Deixará de ter importância
Coluna 3:
1 Quando você decidir viver
2 Quando sua voz se calar
3 Quando seus olhos enxergarem
4 Quando seu caminho for destruído
5 Quando você salvar a verdade
6 Quando a realidade se unir com o sonho

O Escolhido: quando COMPREENDER UMA MOTIVAÇÃO, lance 6d6. Se obtiver a sequência [1,2,3,4,5,6], será o Escolhido e verá a verdadeira Matrix, podendo distorcê-la como quiser. Seu novo caminho estará apenas no início. Não conceda esse estado na criação, por pedido simples ou por uma rolagem sem motivação compreendida.` },
  { id: "adaptation", chapter: 5, title: "Notas desta adaptação digital — não são regras originais", page: 0, text: `As conveniências abaixo são decisões desta adaptação digital, não acréscimos atribuídos ao autor. O texto fornecido foi organizado em seções e tabelas, com normalização de espaçamento e palavras quebradas. Os créditos são preservados. A introdução de Morpheus no app é original desta adaptação, não uma transcrição de diálogo do filme.
A mesa é solo. O contador DM fica entre 1 e6 nesta adaptação: a abertura dos Resgatados é3 e dos Reconectados2, mas tabelas Trinity/Vet incluem1 e2. Usos que têm mínimo próprio, como esquiva de Reconectado (mínimo 3), conservam esse limite.
Para Trinity/Vet, compare os dados com o DM que existia ANTES de aplicar a consequência do teste. Falha Crítica111 de Resgatado aplica o aumento especial+4, sem acumular+1 de falha comum.
Nesta adaptação, o conjunto1,2,3,4,5,6 em seis dados simultâneos vale para O Escolhido independentemente da ordem visual. Só é permitido após a motivação ser compreendida na narrativa e registrada.
Ao cruzar de DM abaixo de 5 para DM 5 ou6, sinaliza-se um TH pendente para o Reconectado; não se repetem TH apenas porque a tela atualizou.
PV, PD e PH não ficam acima dos máximos sem justificativa de regra; PD de contrabando reduz temporariamente o teto durante a missão. Perda permanente de PH reduz o teto.
O modo de criação rápida, se o jogador pedir, permite Morpheus sugerir um personagem inteiro sem dados. É uma conveniência desta mesa, não uma tabela nova. Se o jogador quiser sorteio mecânico (antecedente ou equipe), rola-se o d6 indicado pelo livro. A ficha só é finalizada depois da aprovação do jogador.
Empates no Mundo Real, prioridades de manobra evasiva, bônus do exemplo naval e pontos pouco claros devem ser explicados como decisão de mesa. Não invente respostas atribuídas ao autor.
Não há raças fantásticas, níveis, classes de D&D, teste de d20, Fate ou distribuição numérica de atributos neste jogo. Morpheus é o narrador; o personagem é de autoria do jogador.` },
];

export const MATRIX_PAGES = MATRIX_RULES.map(section => ({ file: `Matrix · ${MATRIX_CHAPTERS[section.chapter]} · ${section.title}`, page: section.page, text: section.text }));
export const MATRIX_RULES_TEXT = MATRIX_RULES.map(section => `## ${section.title} ${section.page > 0 ? `[p.${section.page}]` : "[sem página original]"}\n${section.text}`).join("\n\n");

export function isMatrixGame(game: { systemName?: string; systemSummary?: string }): boolean {
  return game.systemName === MATRIX_SYSTEM_NAME || Boolean(game.systemSummary?.includes(`[${MATRIX_VERSION}]`));
}
