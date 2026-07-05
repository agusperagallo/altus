// ── Vertex Audit Log ─────────────────────────────────────────
// Registra acciones críticas del sistema en la tabla audit_log

async function audit(accion, tabla, registroId, detalle) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('audit_log').insert({
      usuario_id: user?.id || null,
      usuario_email: user?.email || null,
      accion,
      tabla: tabla || null,
      registro_id: registroId || null,
      detalle: detalle || null
    });
  } catch(e) { console.warn('Audit log error:', e); }
}
