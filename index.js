const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('./src/lib/logger');

const config = require('./src/config');
const bot = require('./src/lib/commandHandler');
const store = require('./src/lib/store');
const {
  getText,
  getQuotedMessage,
  getMediaMessage,
  downloadMedia,
  getTargetJids,
  getNumbersFromArgs,
  isParticipantAdmin,
} = require('./src/lib/helpers');
const { bufferToSticker } = require('./src/lib/mediaUtils');
const biblia = require('./src/lib/bibliaApi');

// registra todos os módulos de comando
require('./src/commands/sistema')(bot);
require('./src/commands/diversao')(bot);
require('./src/commands/utilitarios')(bot);
require('./src/commands/grupo')(bot);
require('./src/commands/figurinhas')(bot);
require('./src/commands/editor')(bot);
require('./src/commands/biblia')(bot);
require('./src/commands/musica')(bot);
require('./src/commands/jogos')(bot);

const LINK_REGEX = /(https?:\/\/\S+|chat\.whatsapp\.com\/\S+|www\.\S+\.\S+)/i;
const BIBLE_REF_REGEX = /\b([1-3]?\s?[A-Za-zÀ-ÖØ-öø-ÿ]{2,})\s+(\d{1,3}):(\d{1,3})\b/;

const botStartTime = Date.now();

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('storage/auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P,
    printQRInTerminal: false,
    auth: state,
    browser: ['Zap Bot', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nEscaneie o QR code abaixo no WhatsApp (Aparelhos conectados > Conectar um aparelho):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão encerrada.', shouldReconnect ? 'Reconectando...' : 'Deslogado, apague a pasta storage/auth e escaneie o QR novamente.');
      if (shouldReconnect) start();
    } else if (connection === 'open') {
      console.log('✅ Bot conectado ao WhatsApp!');
    }
  });

  // boas-vindas / despedida
  sock.ev.on('group-participants.update', async (ev) => {
    try {
      const cfg = store.getGroupConfig(ev.id);
      if (ev.action === 'add' && cfg.boasvindas) {
        for (const p of ev.participants) {
          await sock.sendMessage(ev.id, { text: `👋 Bem-vindo(a) @${p.split('@')[0]}!`, mentions: [p] });
        }
      }
      if (ev.action === 'remove' && cfg.despedida) {
        for (const p of ev.participants) {
          await sock.sendMessage(ev.id, { text: `😢 @${p.split('@')[0]} saiu do grupo.`, mentions: [p] });
        }
      }
    } catch (e) {
      /* silencioso */
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (e) {
        console.error('Erro ao processar mensagem:', e);
      }
    }
  });
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = msg.key.participant || msg.key.remoteJid;
  const text = getText(msg).trim();

  let groupMetadata = null;
  if (isGroup) {
    try {
      groupMetadata = await sock.groupMetadata(jid);
    } catch (e) {
      groupMetadata = { participants: [] };
    }
  }

  // --- antilink ---
  if (isGroup && text && LINK_REGEX.test(text)) {
    const cfg = store.getGroupConfig(jid);
    const senderIsAdmin = isParticipantAdmin(groupMetadata, sender);
    if (cfg.antilink && !senderIsAdmin) {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {
        /* bot pode não ser admin */
      }
      await sock.sendMessage(
        jid,
        { text: `🚫 Links não são permitidos aqui, @${sender.split('@')[0]}.`, mentions: [sender] },
        { quoted: msg }
      );
      return;
    }
  }

  // --- helpers de contexto (fechados sobre sock/msg) ---
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  const getQuoted = () => getQuotedMessage(msg);
  const getQuotedText = () => {
    const q = getQuoted();
    if (!q) return null;
    return getText({ message: q.message });
  };
  const getQuotedKey = () => {
    const q = getQuoted();
    return q ? q.key : null;
  };
  const hasMedia = () => !!getMediaMessage(msg);
  const downloadMediaNow = () => downloadMedia(sock, msg);
  const replySticker = async (buffer, opts = {}) => {
    let inputBuffer = buffer;
    if (!inputBuffer) {
      const media = await downloadMediaNow();
      if (!media) throw new Error('sem mídia');
      inputBuffer = media.buffer;
    }
    const stickerBuffer = await bufferToSticker(inputBuffer, { fitMode: opts.fitMode || 'fit' });
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
  };

  // --- comando explícito ---
  if (text.startsWith(config.prefix)) {
    const semPrefixo = text.slice(config.prefix.length).trim();
    const [commandRaw, ...args] = semPrefixo.split(/\s+/);
    const command = (commandRaw || '').toLowerCase();
    let def = bot.resolve(command);

    // atalhos dinâmicos: /ly2, /ly3... (paginação da busca sticker.ly)
    if (!def && /^ly\d+$/.test(command)) def = bot.resolve('ly');
    // atalhos dinâmicos: /2d6, /d20, /4d6+3... (rolagem de dados direto, sem digitar "dado")
    if (!def && /^\d*d\d+([+-]\d+)?$/.test(command)) def = bot.resolve('dado');

    if (!def) return; // comando desconhecido, ignora silenciosamente

    const cooldown = bot.isOnCooldown(def.name, sender);
    if (cooldown) {
      await reply(`⏳ Calma! Espere mais ${cooldown}s para usar /${def.name} de novo.`);
      return;
    }

    if (def.groupOnly && !isGroup) {
      await reply('❌ Esse comando só funciona dentro de um grupo.');
      return;
    }

    const isOwner = config.ownerNumbers.includes(sender.split('@')[0]);
    const senderIsAdmin = isGroup && isParticipantAdmin(groupMetadata, sender);

    if (def.ownerOnly && !isOwner) {
      await reply('❌ Só o dono do bot pode usar esse comando.');
      return;
    }
    if (def.adminOnly && !senderIsAdmin && !isOwner) {
      await reply('❌ Esse comando é só para admins do grupo.');
      return;
    }
    if (def.botAdminRequired && isGroup) {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      if (!isParticipantAdmin(groupMetadata, botJid)) {
        await reply('❌ Preciso ser admin do grupo para fazer isso.');
        return;
      }
    }

    const targets = [...new Set([...getTargetJids(msg), ...getNumbersFromArgs(args)])];

    const ctx = {
      sock,
      msg,
      args,
      command,
      text,
      jid,
      groupId: jid,
      isGroup,
      groupMetadata,
      sender,
      targets,
      reply,
      getQuoted,
      getQuotedText,
      getQuotedKey,
      hasMedia,
      downloadMediaNow,
      replySticker,
      botStartTime,
      store,
    };

    try {
      await def.run(ctx);
    } catch (e) {
      console.error(`Erro no comando ${def.name}:`, e);
      await reply('❌ Deu um erro executando esse comando.');
    }
    return;
  }

  // --- referência bíblica implícita (ex: "Salmos 23:1") — checada primeiro por ser mais específica ---
  if (text && config.bibliaApiToken) {
    const m = text.match(BIBLE_REF_REGEX);
    if (m) {
      try {
        const book = await biblia.findBook(m[1]);
        if (book) {
          const v = await biblia.getVerse(book.abbrev.pt, parseInt(m[2]), parseInt(m[3]));
          if (v && v.text) {
            await reply(`📖 *${v.book.name} ${v.chapter}:${v.number}*\n\n${v.text}`);
            return;
          }
        }
      } catch (e) {
        /* referência não encontrada, ignora e cai pro resto do fluxo */
      }
    }
  }

  // --- ttp implícito: qualquer texto no privado vira figurinha de texto ---
  if (!isGroup && text && text.length <= 30 && !LINK_REGEX.test(text)) {
    try {
      const { textToStickerStatic } = require('./src/lib/mediaUtils');
      const buffer = await textToStickerStatic(text);
      await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
      return;
    } catch (e) {
      /* silencioso, deixa passar */
    }
  }
}

start();
