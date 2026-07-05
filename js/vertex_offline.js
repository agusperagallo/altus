// ── Vertex Offline Manager ────────────────────────────────────
// Maneja caché local de datos del día y sincronización offline

const VERTEX_DB_NAME    = 'vertex_offline';
const VERTEX_DB_VERSION = 1;
const SYNC_KEY         = 'vertex_sync_queue';

// ── IndexedDB setup ─────────────────────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VERTEX_DB_NAME, VERTEX_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('clases_dia'))
        db.createObjectStore('clases_dia', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ninos_grupo'))
        db.createObjectStore('ninos_grupo', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('asistencia_offline'))
        db.createObjectStore('asistencia_offline', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'clave' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPut(store, data) {
  const db  = await abrirDB();
  const tx  = db.transaction(store, 'readwrite');
  const st  = tx.objectStore(store);
  const arr = Array.isArray(data) ? data : [data];
  arr.forEach(item => st.put(item));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function dbGetAll(store) {
  const db = await abrirDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbClear(store) {
  const db = await abrirDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).clear();
    req.onsuccess = res; req.onerror = rej;
  });
}

// ── Estado de conexión ───────────────────────────────────────
let estaOnline = navigator.onLine;

function mostrarBannerOffline(show) {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:9999',
      'background:#B45309','color:#fff','text-align:center',
      'padding:8px 16px','font-size:13px','font-weight:500',
      'font-family:DM Sans,sans-serif','display:none',
      'align-items:center','justify-content:center','gap:8px'
    ].join(';');
    banner.innerHTML = '📵 Sin conexión — mostrando datos guardados';
    document.body.prepend(banner);
  }
  banner.style.display = show ? 'flex' : 'none';
}

window.addEventListener('online',  () => { estaOnline = true;  mostrarBannerOffline(false); sincronizarPendientes(); });
window.addEventListener('offline', () => { estaOnline = false; mostrarBannerOffline(true); });
if (!estaOnline) mostrarBannerOffline(true);

// ── Guardar datos del día ────────────────────────────────────
async function cachearDatosDelDia(instructorId, gruposIds) {
  if (!estaOnline) return;
  try {
    const hoy = new Date().toISOString().split('T')[0];

    // Clases del día
    const { data: clases } = await sb.from('clases')
      .select('*, clientes(nombre,telefono)')
      .eq('instructor_id', instructorId)
      .eq('fecha', hoy);
    if (clases?.length) {
      await dbClear('clases_dia');
      await dbPut('clases_dia', clases);
    }

    // Niños de cada grupo
    if (gruposIds?.length) {
      const { data: ninos } = await sb.from('grupo_ninos')
        .select('*')
        .in('grupo_id', gruposIds)
        .eq('activo', true);
      if (ninos?.length) {
        await dbClear('ninos_grupo');
        await dbPut('ninos_grupo', ninos);
      }
    }

    // Guardar timestamp
    await dbPut('meta', { clave: 'ultimo_cache', valor: new Date().toISOString(), fecha: hoy });
    console.log('[Vertex Offline] Datos del día guardados ✓');
  } catch(e) {
    console.warn('[Vertex Offline] Error al cachear:', e);
  }
}

// ── Leer clases desde caché ──────────────────────────────────
async function obtenerClasesOffline() {
  return await dbGetAll('clases_dia');
}

// ── Leer niños desde caché ───────────────────────────────────
async function obtenerNinosOffline(grupoId) {
  const todos = await dbGetAll('ninos_grupo');
  return grupoId ? todos.filter(n => n.grupo_id === grupoId) : todos;
}

// ── Guardar asistencia offline ───────────────────────────────
async function marcarAsistenciaOffline(ninoId, grupoId, presente, fecha) {
  const registro = {
    id: `${ninoId}_${fecha}`,
    nino_id: ninoId,
    grupo_id: grupoId,
    presente,
    fecha,
    sincronizado: false,
    creado_en: new Date().toISOString()
  };
  await dbPut('asistencia_offline', registro);

  // Agregar a la cola de sincronización
  const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
  const idx = queue.findIndex(q => q.id === registro.id);
  if (idx >= 0) queue[idx] = registro;
  else queue.push(registro);
  localStorage.setItem(SYNC_KEY, JSON.stringify(queue));
}

// ── Sincronizar pendientes al reconectar ─────────────────────
async function sincronizarPendientes() {
  const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
  if (!queue.length) return;

  const pendientes = queue.filter(q => !q.sincronizado);
  if (!pendientes.length) return;

  console.log(`[Vertex Offline] Sincronizando ${pendientes.length} registros...`);
  let sincronizados = 0;

  for (const item of pendientes) {
    try {
      // Borrar registro del día y reinsertar
      await sb.from('asistencia_ninos')
        .delete()
        .eq('nino_id', item.nino_id)
        .eq('fecha', item.fecha);

      await sb.from('asistencia_ninos')
        .insert({ nino_id: item.nino_id, grupo_id: item.grupo_id, presente: item.presente, fecha: item.fecha });

      item.sincronizado = true;
      sincronizados++;
    } catch(e) {
      console.warn('[Vertex Offline] Error al sincronizar item:', item.id, e);
    }
  }

  localStorage.setItem(SYNC_KEY, JSON.stringify(queue));

  if (sincronizados > 0) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#0F6E56;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:999;font-family:DM Sans,sans-serif';
    toast.textContent = `✓ ${sincronizados} registro${sincronizados>1?'s':''} sincronizado${sincronizados>1?'s':''}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

// ── Verificar si los datos del caché son de hoy ──────────────
async function cacheFrescoDeHoy() {
  try {
    const meta = await new Promise((res, rej) => {
      abrirDB().then(db => {
        const req = db.transaction('meta','readonly').objectStore('meta').get('ultimo_cache');
        req.onsuccess = e => res(e.target.result);
        req.onerror   = rej;
      });
    });
    const hoy = new Date().toISOString().split('T')[0];
    return meta?.fecha === hoy;
  } catch { return false; }
}

// Exportar para uso desde el panel
window.vertexOffline = {
  cachearDatosDelDia,
  obtenerClasesOffline,
  obtenerNinosOffline,
  marcarAsistenciaOffline,
  sincronizarPendientes,
  cacheFrescoDeHoy,
  estaOnline: () => estaOnline
};
