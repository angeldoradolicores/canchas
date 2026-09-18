const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('./asistente_casi_funcionando.json', 'utf8'));

// 1. Update Normalize Incoming Message
const normNode = wf.nodes.find(n => n.name === 'Normalize Incoming Message');
if (normNode) {
  normNode.parameters.jsCode = `const rawInput = $input.first().json;
const body = rawInput.body || rawInput;

if (!body || !body.data) {
  return [];
}

const event = String(body.event || "").toLowerCase();
if (event && event !== "messages.upsert" && event !== "messages_upsert") {
  return [];
}

const data = Array.isArray(body.data) ? body.data[0] : body.data;
const key = data.key || {};
const message = data.message || {};

if (key.fromMe === true) {
  return [];
}

const actualMessage = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message;
let userText = "";
if (actualMessage.conversation) {
  userText = actualMessage.conversation;
} else if (actualMessage.extendedTextMessage?.text) {
  userText = actualMessage.extendedTextMessage.text;
} else if (actualMessage.imageMessage?.caption) {
  userText = actualMessage.imageMessage.caption;
} else if (actualMessage.videoMessage?.caption) {
  userText = actualMessage.videoMessage.caption;
} else if (actualMessage.documentMessage?.caption) {
  userText = actualMessage.documentMessage.caption;
}

if (!userText || !userText.trim()) {
  return [];
}

function formatPhone(p) {
  if (!p) return "";
  if (String(p).includes("@g.us")) return p;
  const c = String(p).replace(/\\D/g, "");
  if (c.length === 10) return "57" + c;
  if (c.length === 12 && c.startsWith("57")) return c;
  return c;
}

const remoteJid = key.remoteJid || "";

// Extraer el teléfono real del remitente (WhatsApp LID compatibility)
let senderRaw = "";
if (body.sender && String(body.sender).includes("@s.whatsapp.net")) {
  senderRaw = String(body.sender).replace("@s.whatsapp.net", "");
} else if (data.sender && String(data.sender).includes("@s.whatsapp.net")) {
  senderRaw = String(data.sender).replace("@s.whatsapp.net", "");
} else if (key.participant && String(key.participant).includes("@s.whatsapp.net")) {
  senderRaw = String(key.participant).replace("@s.whatsapp.net", "");
} else if (remoteJid.includes("@s.whatsapp.net")) {
  senderRaw = remoteJid.replace("@s.whatsapp.net", "");
}

const userPhone = remoteJid.includes("@g.us")
  ? remoteJid
  : (senderRaw ? formatPhone(senderRaw) : formatPhone(remoteJid));

const instanceName = body.instance || body.instanceName || rawInput.instance || "canchas_4dd6d2dce9f9";
const trimmedText = userText.trim();

const match = trimmedText.match(/(aprobar|aprobas|aprobás|aprovar|cancelar|confirmar|rechazar)\\s*([a-zA-Z0-9_-]{4,12})/i);
let isOwnerCommand = false;
let commandAction = "";
let commandCode = "";

if (match) {
  isOwnerCommand = true;
  const verb = match[1].toLowerCase();
  commandAction = (verb.includes("aprob") || verb === "confirmar") ? "confirmed" : "cancelled";
  commandCode = match[2];
}

return [{
  json: {
    sessionId: userPhone || remoteJid,
    instance: instanceName,
    remoteJid: remoteJid,
    userPhone: userPhone || remoteJid,
    messageText: trimmedText,
    isOwnerCommand: isOwnerCommand,
    commandAction: commandAction,
    commandCode: commandCode
  }
}];`;
}

// 2. Fix Gemini Model Names
const classifierNode = wf.nodes.find(n => n.name === 'Gemini Flash - Classifier');
if (classifierNode) {
  classifierNode.parameters.modelName = 'models/gemini-1.5-flash';
}

const agentModelNode = wf.nodes.find(n => n.name === 'Google Gemini 1.5 Flash');
if (agentModelNode) {
  agentModelNode.parameters.modelName = 'models/gemini-1.5-flash';
}

// 3. Update Prepare Resolution Notifications for combined message
const prepNode = wf.nodes.find(n => n.name === 'Prepare Resolution Notifications');
if (prepNode) {
  prepNode.parameters.jsCode = `const res = $input.first().json;

function formatPhone(p) {
  if (!p) return "";
  if (String(p).includes("@g.us")) return p;
  const c = String(p).replace(/\\D/g, "");
  if (c.length === 10) return "57" + c;
  if (c.length === 12 && c.startsWith("57")) return c;
  return c;
}

const ownerDestination = $("Normalize Incoming Message").item.json.userPhone;
const instance = $("Normalize Incoming Message").item.json.instance;

if (!res || res.success !== true) {
  return [{
    json: {
      toPhone: ownerDestination,
      instance: instance,
      message: "⚠️ No encontré esa reserva pendiente. Verifica el código e inténtalo de nuevo.",
      customerPhone: null,
      customerMessage: "",
      proofUrl: null
    }
  }];
}

const isConfirmed = res.status === "confirmed";
const shortId = res.short_id || (res.booking_id ? res.booking_id.slice(0, 6) : "N/A");
const booking = res.booking || {};
const proofUrl = booking.payment_proof_url || res.payment_proof_url || null;

const ownerMsg = isConfirmed
  ? \`✅ *Reserva #\${shortId} CONFIRMADA*\\nCliente: \${res.customer_name}\\n🏟️ \${res.company_name} - \${res.pitch_name}\\n📅 \${res.date_str} ⏰ \${res.time_str}\\n\\n🎫 Ticket enviado al cliente.\`
  : \`❌ *Reserva #\${shortId} CANCELADA*\\nCliente: \${res.customer_name}\\n\\n📩 Cliente notificado.\`;

let customerMsg = "";
if (res.customer_phone) {
  customerMsg = isConfirmed
    ? \`🎟️ *TICKET DE RESERVA CONFIRMADA*\\n\\n🏟️ *\${res.company_name}*\\n⚽ Cancha(s): \${res.pitch_name}\\n📅 Fecha: \${res.date_str}\\n⏰ Horario: \${res.time_str}\\n🎫 Ref: *#\${shortId}*\\n\\nPresenta este ticket al llegar. ¡Te esperamos para jugar! 🏆\`
    : \`⚠️ Tu reserva (Ref: *#\${shortId}*) en *\${res.company_name}* ha sido declinada.\\n\\nSi realizaste un pago, comunícate directamente con la administración.\`;
}

return [{
  json: {
    toPhone: ownerDestination,
    instance: instance,
    message: ownerMsg,
    customerPhone: formatPhone(res.customer_phone),
    customerMessage: customerMsg,
    proofUrl: proofUrl
  }
}];`;
}

// 4. Update Send WhatsApp via Evolution
const sendNode = wf.nodes.find(n => n.name === 'Send WhatsApp via Evolution');
if (sendNode) {
  sendNode.parameters.jsonBody = "={{ JSON.stringify({\n  number: $('Normalize Incoming Message').item.json.userPhone,\n  options: { delay: 1000, presence: 'composing', linkPreview: true },\n  text: ($json.output || '').trim()\n}) }}";
}

fs.writeFileSync('./asistente_casi_funcionando.json', JSON.stringify(wf, null, 2));
console.log('Successfully updated ./asistente_casi_funcionando.json');
