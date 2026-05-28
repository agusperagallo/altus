// api/send-whatsapp.js
// Función serverless de Vercel que envía el WhatsApp via Twilio

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { telefono, instructor, cliente, disciplina, nivel, hora, claseId } = req.body;

  // Credenciales desde variables de entorno de Vercel
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // whatsapp:+14155238886
  const appUrl     = process.env.APP_URL || 'https://altus-cb.vercel.app';

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(503).json({ error: 'Twilio no configurado' });
  }

  if (!telefono) {
    return res.status(400).json({ error: 'Teléfono requerido' });
  }

  // Normalizar número — asegurar formato internacional
  let toNumber = telefono.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  if (!toNumber.startsWith('+')) toNumber = '+54' + toNumber;
  toNumber = 'whatsapp:' + toNumber;

  const linkResena = `${appUrl}/altus_resena.html?clase=${claseId}`;

  // Mensaje bilingüe
  const mensaje = `¡Hola! 🎿

Gracias por tu clase de *${disciplina}* con *${instructor}* en Cerro Bayo.

Nos encantaría saber tu opinión. ¿Podés dedicarnos 1 minuto?

👉 ${linkResena}

---
Hi! Thanks for your *${disciplina}* class with *${instructor}* at Cerro Bayo. We'd love your feedback!

👉 ${linkResena}`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toNumber,
          Body: mensaje,
        }).toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      return res.status(400).json({ error: data.message || 'Error de Twilio' });
    }

    return res.status(200).json({ success: true, sid: data.sid });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}
