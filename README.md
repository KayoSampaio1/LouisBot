# Zap Bot 🤖

Bot de WhatsApp feito do zero com [Baileys](https://github.com/WhiskeySockets/Baileys) (não precisa de navegador/Puppeteer, é leve e roda até em VPS bem simples).

Prefixo dos comandos: **/** (configurável no `.env`).

## 1. Instalar

Precisa ter **Node.js 18+** e o **ffmpeg** instalado no sistema não é obrigatório (o pacote `ffmpeg-static` já traz um binário embutido).

```bash
npm install
```

Se der erro ao instalar o `sharp` em algum sistema mais exótico, veja https://sharp.pixelplumbing.com/install.

## 2. Configurar

```bash
cp .env.example .env
```

Edite o `.env`:
- `OWNER_NUMBERS` — seu número (com DDI+DDD), pra ter acesso a comandos de dono.
- `REMOVEBG_API_KEY` — opcional, só necessário pro comando `/semfundo`. Crie uma chave grátis em https://www.remove.bg/api (50 imagens grátis/mês).
- `BIBLIA_API_TOKEN` — opcional, só necessário pros comandos de Bíblia (`/biblia`, `/capitulo`, `/versiculo`, `/buscarbiblia`, `/buscarbibliatodos`) e pra detecção automática de referências bíblicas no chat. Crie sua conta grátis em https://www.abibliadigital.com.br/api e gere um token.
- `KLIPY_API_KEY` — opcional, só necessário pros comandos `/ly`, `/pack` e `/trend` (busca de figurinhas prontas). Crie uma chave grátis vitalícia em https://klipy.com/developers.

## 3. Rodar

```bash
npm start
```

Vai aparecer um **QR code no terminal**. No seu celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho → escaneie o QR. Pronto, o bot fica online.

A sessão fica salva em `storage/auth/` — não precisa escanear de novo nas próximas vezes (a menos que apague essa pasta ou desconecte pelo celular).

## Estrutura do projeto

```
index.js                 → conexão com o WhatsApp + roteador de mensagens
src/config.js             → configurações lidas do .env
src/lib/                  → funções internas (handler de comandos, download de mídia, criação de figurinhas, etc)
src/commands/             → um arquivo por categoria de comando
src/data/                 → tabelas estáticas (DDDs, DDIs, fusos horários, fontes unicode)
storage/                  → sessão do WhatsApp + configurações por grupo (gerado automaticamente)
```

## Comandos

Rode `/menu` (ou `/help`) dentro do WhatsApp pra ver a lista completa e atualizada, organizada por categoria.

### 🎨 Figurinhas
`/s` `/ff` `/fc` `/fe` `/steal` `/arquivo` `/semfundo` `/ly` `/pack` `/trend` `/attp` `/ttp`

### 😄 Diversão
`/moeda` `/dado` `/calc` `/react` `/emoji` `/gato` `/cachorro` `/fontes` `/meme`

### 🔎 Utilitários
`/ddd` `/ddi` `/cep` `/jev`

### 👥 Grupo
`/config` `/on` `/off` `/set` `/abrir` `/fechar` `/promover` `/rebaixar` `/ban` `/adicionar` `/deletar` `/adm` `/sorteio` `/sorteioadm` `/roleta` `/regras` `/solicitacoes` `/todos`

### ⚙️ Sistema
`/ping` `/status` `/hora` `/menu`

### 🎬 Editor de mídia
`/pb` `/pride` `/craque`

### 📖 Bíblia Sagrada
`/biblia` `/capitulo` `/versiculo` `/buscarbiblia` `/buscarbibliatodos`

### 🎵 Música
`/play` `/letra`

## O que eu mudei/melhorei em relação à lista original

- **Prefixo trocado de `!` para `/`**, como pedido.
- **`/menu`** — lista automática e sempre atualizada de todos os comandos (novo).
- **Sistema de cooldown** — evita spam/flood de comando por pessoa (novo, configurável por comando).
- **Configuração por grupo persistida em JSON** (`storage/groups.json`) em vez de guardada na descrição do grupo — mais confiável, não depende do texto da descrição não ser editado por engano.
- **`/antilink`** (ativável com `/on antilink`) — apaga links automaticamente e avisa quem mandou, exceto admins (novo).
- **Boas-vindas e despedida automáticas** (`/on boasvindas`, `/on despedida`) quando alguém entra/sai do grupo (novo).
- **Checagem de permissão automática**: comandos de admin (`adminOnly`) e comandos que exigem o bot ser admin (`botAdminRequired`) são bloqueados educadamente em vez de falhar com erro feio.
- **Tratamento de erro em todo comando** — se algo falhar (API fora do ar, mídia inválida etc), o bot avisa em vez de travar ou cair.
- **`/status`** mostra uptime, memória e versão do Node (novo).
- Atalhos diretos continuam funcionando: `/2d6+3`, `/d20` (sem precisar digitar "dado"), e `/ly2`, `/ly3` para paginar buscas do sticker.ly.

## Observações importantes

- A biblioteca usada (**Baileys**) é uma implementação **não-oficial** do protocolo do WhatsApp Web. Funciona muito bem para bots pessoais/pequenos, mas o uso de automações fere os Termos de Serviço do WhatsApp — use por sua conta e risco, com um número que não seja crítico.
- `/ly`, `/pack` e `/trend` usam a **KLIPY API** (`api.klipy.co`), gratuita e estável — é a mesma API pra onde Discord, WhatsApp e Bluesky migraram depois que o Google desligou a API do Tenor em 30/06/2026. A forma exata dos campos de mídia retornados não é 100% documentada publicamente, então o código procura a URL da figurinha de forma resiliente dentro da resposta; se um dia parar de achar nada, o código já imprime a resposta crua no terminal pra facilitar o ajuste (`src/lib/klipyApi.js`).
- `/play` (baixar música) depende do `ytdl-core`, que quebra sempre que o YouTube muda algo. Se parar de funcionar, normalmente é só questão de atualizar o pacote (`npm update @distube/ytdl-core`).
