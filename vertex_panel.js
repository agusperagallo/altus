// ═══════════════════════════════════════════════════════════════
// VERTEX PANEL — ÍNDICE
// Buscá el nombre de la sección (Ctrl+F) o saltá directo a la línea.
// Nota: algunas secciones de Escuelita (familias, asistencia niños,
// páginas esc-*) quedaron intercaladas con el resto en vez de juntas,
// porque varias declaran variables propias (let/const) y agruparlas
// físicamente sin verificar cada referencia cruzada podía romper algo
// en producción. Quedan marcadas con 🎿 para encontrarlas rápido.
// ═══════════════════════════════════════════════════════════════
// 🎿 L190   FAMILIAS (ESCUELITA)
// 🎿 L272   ASISTENCIA ESCUELITA
// 🎿 L423   ASISTENCIA POR INSTRUCTOR (ESCUELITA)
//    L728   FECHA EN ESPAÑOL — Flatpickr
//    L769   SKELETONS
//    L772   FLUJO TIPO DE CLIENTE
// 🎿 L936   PÁGINAS ESCUELITA
//    L1748  BAJAS TEMPORALES
//    L1839  CARGA MASIVA
//    L2569  CARGA INICIAL
//    L2570  DASHBOARD: TOP RANKING, CUMPLEAÑOS, ALERGIAS
//    L2689  CONFIGURACIÓN DE RANKING — qué componentes cuentan
//    L2743  PÁGINAS
//    L3067  NUEVO / EDITAR CLIENTE
//    L3762  MINI HEADER MOBILE
// ═══════════════════════════════════════════════════════════════

const { createClient } = supabase;
const hoy = new Date();
const fechaISO = new Date().toLocaleString('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).split(' ')[0];
const sb = createClient('https://pngtxnpywchizyyynuyb.supabase.co','sb_publishable_-TBqMvOtGY0CPamchZN_jA_vPYl4f5-', { auth: { persistSession: true, autoRefreshToken: true } });

// Cliente aislado, exclusivo para crear cuentas nuevas (signUp) sin afectar
// la sesión activa del supervisor logueado en el cliente principal "sb".
// Usa una storageKey distinta para que no comparta ni pise la sesión guardada.
const sbAuthAux = createClient(
  'https://pngtxnpywchizyyynuyb.supabase.co',
  'sb_publishable_-TBqMvOtGY0CPamchZN_jA_vPYl4f5-',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vertex-aux-signup' } }
);

// Auth check
sb.auth.getSession().then(async ({data}) => {
  if (!data?.session) { window.location.href='vertex_login.html'; return; }

  // Validar rol/email cacheados contra la sesión real (mismo fix que en vertex_instructor.html)
  const { data: usuario } = await sb.from('usuarios').select('rol').eq('id', data.session.user.id).single();
  const emailReal = data.session.user.email || '';
  if (localStorage.getItem('vertex_email') !== emailReal) localStorage.setItem('vertex_email', emailReal);
  if (usuario?.rol && usuario.rol !== localStorage.getItem('vertex_rol')) {
    localStorage.setItem('vertex_rol', usuario.rol);
    if (!sessionStorage.getItem('vertex_id_corregido')) {
      sessionStorage.setItem('vertex_id_corregido', '1');
      window.location.reload();
      return;
    }
  }
  sessionStorage.removeItem('vertex_id_corregido');

  const rol = localStorage.getItem('vertex_rol');
  if (rol==='instructor') { window.location.href='vertex_instructor.html'; return; }
  const email = localStorage.getItem('vertex_email')||'';
  const ini = email.split('@')[0].slice(0,2).toUpperCase();
  if (ini) document.getElementById('user-avatar').textContent = ini;
  document.getElementById('pm-email').textContent = email;
  document.getElementById('pm-nombre').textContent = rol==='admin'?'Administrador':'Supervisor';
});

// Gestión de temporadas
document.getElementById('pm-temporada').addEventListener('click', async() => {
  if (!esSuperadmin()) { toast('Solo el superadmin puede configurar la temporada','err'); return; }
  document.getElementById('profile-menu').classList.remove('open');
  openModal('modal-temporada');
  await cargarTemporadas();
  // Cargar fecha de inicio actual
  const {data:cfg} = await sb.from('configuracion').select('temporada_inicio,temporada_nombre').single();
  if (cfg?.temporada_inicio) {
    document.getElementById('mt-inicio-fecha').value = cfg.temporada_inicio;
  }
});

async function guardarInicioTemporada() {
  const fecha = document.getElementById('mt-inicio-fecha').value;
  if (!fecha) { toast('Seleccioná una fecha','err'); return; }
  const {error} = await sb.from('configuracion').update({ temporada_inicio: fecha }).not('id','is',null);
  if (error) { toast('Error al guardar','err'); return; }
  toast('Inicio de temporada guardado ✓');
  audit('temporada_inicio_actualizado', 'configuracion', null, { fecha });
  closeModal('modal-temporada');
}
window.guardarInicioTemporada = guardarInicioTemporada;

document.getElementById('mt-close').addEventListener('click', () => closeModal('modal-temporada'));

// Highlight opción seleccionada
['mt-reinicio','mt-continuar'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    document.getElementById('opt-reinicio-label').style.borderColor = document.getElementById('mt-reinicio').checked ? 'var(--accent)' : 'var(--line)';
    document.getElementById('opt-continuar-label').style.borderColor = document.getElementById('mt-continuar').checked ? 'var(--accent)' : 'var(--line)';
  });
});

async function cargarTemporadas() {
  const { data } = await sb.from('temporadas').select('*').order('creado_en', { ascending: false });
  if (!data?.length) return;

  const activa = data.find(t => t.activa);
  const anteriores = data.filter(t => !t.activa);

  if (activa) {
    document.getElementById('mt-nombre-activa').textContent = activa.nombre;
    const inicio = new Date(activa.fecha_inicio).toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' });
    document.getElementById('mt-fecha-activa').textContent = `Desde el ${inicio}`;
    // Sugerir nombre siguiente temporada
    const añoActual = new Date().getFullYear();
    document.getElementById('mt-nueva-nombre').value = `Temporada ${añoActual + 1}`;
  }

  const histEl = document.getElementById('mt-historial');
  if (!anteriores.length) {
    histEl.innerHTML = '<div style="font-size:13px;color:var(--silver);text-align:center;padding:12px">No hay temporadas anteriores</div>';
    return;
  }
  histEl.innerHTML = anteriores.map(t => {
    const inicio = new Date(t.fecha_inicio).toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' });
    const cierre = t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' }) : '—';
    const tipo = t.reinicio_total ? 'Reinicio total' : 'Puntajes continuados';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--ice)">
      <div>
        <div style="font-size:13px;font-weight:500;color:var(--text)">${t.nombre}</div>
        <div style="font-size:11px;color:var(--silver);margin-top:2px">${inicio} → ${cierre} · ${tipo}</div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('mt-cerrar-btn').addEventListener('click', async() => {
  const nuevaNombre = document.getElementById('mt-nueva-nombre').value.trim();
  const reinicio = document.getElementById('mt-reinicio').checked;
  const continuar = document.getElementById('mt-continuar').checked;

  if (!nuevaNombre) { toast('Ingresá el nombre de la nueva temporada','err'); return; }
  if (!reinicio && !continuar) { toast('Seleccioná qué hacer con los puntajes','err'); return; }

  if (!confirm(`¿Cerrar la temporada actual y abrir "${nuevaNombre}"? Esta acción no se puede deshacer.`)) return;

  const btn = document.getElementById('mt-cerrar-btn');
  btn.textContent = 'Procesando...'; btn.disabled = true;

  // 1. Obtener temporada activa
  const { data: activa } = await sb.from('temporadas').select('id').eq('activa', true).single();

  // 2. Archivar ranking actual en ranking_historico
  const { data: snapshots } = await sb.from('ranking_snapshot').select('*');
  if (snapshots?.length) {
    const historico = snapshots.map((s, i) => ({
      temporada_id: activa.id,
      instructor_id: s.instructor_id,
      puntaje_opinion: s.puntaje_opinion,
      puntaje_asistencia: s.puntaje_asistencia,
      puntaje_fidelizacion: s.puntaje_fidelizacion,
      puntaje_historico: s.puntaje_historico,
      puntaje_perfil: s.puntaje_perfil,
      puntaje_total: s.puntaje_total,
      posicion: i + 1
    }));
    await sb.from('ranking_historico').insert(historico);
  }

  // 3. Cerrar temporada activa
  await sb.from('temporadas').update({ activa: false, fecha_cierre: new Date().toISOString().split('T')[0] }).eq('activa', true);

  // 4. Si reinicio total: calcular promedio y resetear
  //    Usa el puntaje efectivo (respeta qué componentes cuentan según
  //    "Configurar ranking"), no el puntaje_total crudo — para que el
  //    reinicio no vuelva a mezclar un componente que el supervisor
  //    desactivó a propósito.
  if (reinicio) {
    await cargarRankingCfg();
    const efectivos = (snapshots||[]).map(s => calcularPuntajeEfectivo(s)).filter(v => v != null);
    const promedio = efectivos.length ? efectivos.reduce((s,v)=>s+v,0)/efectivos.length : 5.0;
    await sb.from('ranking_snapshot').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Insertar puntaje base para todos los instructores activos
    const { data: insts } = await sb.from('instructores').select('id').eq('activo', true);
    if (insts?.length) {
      await sb.from('ranking_snapshot').insert(insts.map(i => ({
        instructor_id: i.id,
        puntaje_opinion: promedio, puntaje_asistencia: promedio,
        puntaje_fidelizacion: promedio, puntaje_historico: promedio,
        puntaje_perfil: promedio, puntaje_total: promedio
      })));
    }
  }

  // 5. Abrir nueva temporada
  await sb.from('temporadas').insert({
    nombre: nuevaNombre,
    fecha_inicio: new Date().toISOString().split('T')[0],
    activa: true,
    reinicio_total: reinicio
  });

  closeModal('modal-temporada');
  toast(`Temporada cerrada. Bienvenido a ${nuevaNombre}`);
  btn.textContent = 'Cerrar temporada y abrir nueva'; btn.disabled = false;

  // Actualizar stat de período
  location.reload();
});
// ── FAMILIAS (ESCUELITA) ──────────────────────────────
async function loadFamilias() {
  const tabla = document.getElementById('fam-tabla');
  const buscar = document.getElementById('f-fam-buscar')?.value?.toLowerCase()||'';
  const grupoFil = document.getElementById('f-fam-grupo')?.value||'';

  // Cargar grupos en el filtro si no están
  const selGrupo = document.getElementById('f-fam-grupo');
  if (selGrupo && selGrupo.options.length === 1) {
    const {data:grupos} = await sb.from('grupos').select('id,nombre').eq('activo',true).order('nombre');
    (grupos||[]).forEach(g => {
      const o = document.createElement('option');
      o.value = g.id; o.textContent = g.nombre;
      selGrupo.appendChild(o);
    });
  }

  const {data} = await sb.from('grupo_ninos')
    .select('*, grupos(nombre, edad_min, edad_max)')
    .eq('activo', true)
    .order('nombre');

  let ninos = data||[];
  if (grupoFil) ninos = ninos.filter(n => n.grupo_id === grupoFil);
  if (buscar) ninos = ninos.filter(n =>
    n.nombre?.toLowerCase().includes(buscar) ||
    n.tutor1_nombre?.toLowerCase().includes(buscar) ||
    n.tutor2_nombre?.toLowerCase().includes(buscar)
  );

  document.getElementById('fam-ct').textContent = `${ninos.length} niños`;
  const isMobile = window.innerWidth < 768;

  if (!ninos.length) { tabla.innerHTML = '<div class="empty">No se encontraron niños</div>'; return; }

  tabla.innerHTML = ninos.map(n => {
    const tel = n.tutor1_telefono || n.telefono_contacto || '';
    const telClean = tel.replace(/\s+/g,'').replace(/[^+\d]/g,'');
    const telWA = telClean.startsWith('+') ? telClean.slice(1) : '54'+telClean;
    const contactBtns = tel ? `
      <a href="tel:${tel}" style="font-size:11px;color:var(--accent2);text-decoration:none;padding:3px 8px;border:1px solid var(--accent);border-radius:4px">📞</a>
      <a href="https://wa.me/${telWA}" target="_blank" style="font-size:11px;color:#25D366;text-decoration:none;padding:3px 8px;border:1px solid #25D366;border-radius:4px">WA</a>
    ` : '—';

    const alertas = [];
    if (n.alergias) alertas.push(`⚠️ ${n.alergias}`);
    if (n.condiciones_medicas) alertas.push(`🏥 ${n.condiciones_medicas}`);

    if (isMobile) return `<div style="padding:14px 16px;border-bottom:1px solid var(--ice)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:500;color:var(--navy)">${n.nombre} <span style="font-size:12px;color:var(--silver);font-weight:400">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${n.grupos?.nombre||'—'}</div>
          ${n.tutor1_nombre ? `<div style="font-size:12px;color:var(--silver);margin-top:2px">${n.tutor1_nombre}${n.tutor1_relacion?' ('+n.tutor1_relacion+')':''}</div>` : ''}
          ${alertas.length ? `<div style="font-size:11px;color:var(--danger);margin-top:4px">${alertas.join(' · ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
          ${contactBtns}
          <button onclick="abrirFichaNino('${n.id}')" style="font-size:11px;color:var(--accent2);background:none;border:none;cursor:pointer;padding:3px 0">Ver ficha</button>
        </div>
      </div>
    </div>`;

    return `<div class="t-row">
      <div style="flex:1">
        <div style="font-weight:500">${n.nombre} <span style="font-size:11px;color:var(--silver);font-weight:400">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>
        ${alertas.length ? `<div style="font-size:10px;color:var(--danger);margin-top:2px">${alertas.join(' · ')}</div>` : ''}
      </div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${n.grupos?.nombre||'—'}</div>
      <div style="flex:1;font-size:12px">
        ${n.tutor1_nombre||'—'}
        ${n.tutor1_relacion?`<span style="color:var(--silver)"> · ${n.tutor1_relacion}</span>`:''}
      </div>
      <div style="width:130px;flex-shrink:0;display:flex;gap:5px">${contactBtns}</div>
      <div style="width:80px;flex-shrink:0;text-align:center">
        <button class="inst-action-btn" onclick="abrirFichaNino('${n.id}')">Ficha</button>
      </div>
    </div>`;
  }).join('');
}
window.loadFamilias = loadFamilias;

// ── ASISTENCIA ESCUELITA ──────────────────────────────
function setEscAsistTab(tab) {
  document.getElementById('esc-asist-tab-ninos').style.borderBottomColor = tab==='ninos' ? 'var(--navy)' : 'transparent';
  document.getElementById('esc-asist-tab-ninos').style.color = tab==='ninos' ? 'var(--navy)' : 'var(--muted)';
  document.getElementById('esc-asist-tab-grupos').style.borderBottomColor = tab==='grupos' ? 'var(--navy)' : 'transparent';
  document.getElementById('esc-asist-tab-grupos').style.color = tab==='grupos' ? 'var(--navy)' : 'var(--muted)';
  document.getElementById('esc-asist-tab-inst').style.borderBottomColor = tab==='inst' ? 'var(--navy)' : 'transparent';
  document.getElementById('esc-asist-tab-inst').style.color = tab==='inst' ? 'var(--navy)' : 'var(--muted)';
  document.getElementById('esc-asist-panel-ninos').style.display = tab==='ninos' ? 'block' : 'none';
  document.getElementById('esc-asist-panel-grupos').style.display = tab==='grupos' ? 'block' : 'none';
  document.getElementById('esc-asist-panel-inst').style.display = tab==='inst' ? 'block' : 'none';
  if (tab==='ninos') loadAsistEscNinos();
  else if (tab==='grupos') cargarSelectorGrupoAsist();
  else if (tab==='inst') loadAsistEscInstructores();
}
window.setEscAsistTab = setEscAsistTab;

async function cargarFiltroGruposAsist() {
  const sels = ['ea-grupo','eg-grupo'];
  for (const selId of sels) {
    const sel = document.getElementById(selId);
    if (!sel || sel.dataset.loaded) continue;
    const {data:grupos} = await sb.from('grupos').select('id,nombre').order('nombre');
    (grupos||[]).forEach(g => {
      const o = document.createElement('option');
      o.value = g.id; o.textContent = g.nombre;
      sel.appendChild(o);
    });
    sel.dataset.loaded = '1';
  }
}

async function loadAsistEscNinos() {
  await cargarFiltroGruposAsist();
  const mes = parseInt(document.getElementById('ea-mes').value || (new Date().getMonth()+1));
  const anio = parseInt(document.getElementById('ea-anio').value || new Date().getFullYear());
  const grupoFil = document.getElementById('ea-grupo').value;

  // Setear mes actual por defecto
  if (!document.getElementById('ea-mes').dataset.init) {
    document.getElementById('ea-mes').value = new Date().getMonth()+1;
    document.getElementById('ea-anio').value = new Date().getFullYear();
    document.getElementById('ea-mes').dataset.init = '1';
  }

  const tabla = document.getElementById('ea-ninos-tabla');
  tabla.innerHTML = '<div class="empty">Cargando...</div>';

  let q = sb.from('grupo_ninos').select('id,nombre,grupo_id,grupos(nombre)').eq('activo',true);
  if (grupoFil) q = q.eq('grupo_id', grupoFil);
  const {data:ninos} = await q.order('nombre');
  if (!ninos?.length) { tabla.innerHTML = '<div class="empty">Sin niños</div>'; return; }

  const inicio = `${anio}-${String(mes).padStart(2,'0')}-01`;
  const fin = new Date(anio, mes, 0).toISOString().split('T')[0];

  const ids = ninos.map(n=>n.id);
  const {data:asist} = await sb.from('asistencia_ninos').select('nino_id,presente').gte('fecha',inicio).lte('fecha',fin).in('nino_id',ids);

  document.getElementById('ea-ninos-ct').textContent = `${ninos.length} niños`;
  const isMobile = window.innerWidth < 768;

  tabla.innerHTML = ninos.map(n => {
    const regs = (asist||[]).filter(a => a.nino_id === n.id);
    const pres = regs.filter(a=>a.presente).length;
    const aus = regs.filter(a=>!a.presente).length;
    const total = pres+aus;
    const pct = total>0 ? Math.round((pres/total)*100) : null;
    const pC = pct===null?'var(--silver)':pct>=90?'#0F6E56':pct>=70?'var(--warn)':'var(--danger)';
    const pB = pct===null?'var(--ice)':pct>=90?'#E1F5EE':pct>=70?'var(--warn-bg)':'var(--danger-bg)';
    const pctTxt = pct===null?'—':pct+'%';

    if (isMobile) return `<div style="padding:12px 16px;border-bottom:1px solid var(--ice);display:flex;align-items:center;justify-content:space-between">
      <div><div style="font-size:13px;font-weight:500">${n.nombre}</div><div style="font-size:11px;color:var(--silver)">${n.grupos?.nombre||'—'}</div></div>
      <div style="display:flex;gap:10px;align-items:center">
        <div style="text-align:center"><div style="font-size:13px;font-weight:600;color:#0F6E56">${pres}</div><div style="font-size:9px;color:var(--silver)">PRES</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:600;color:var(--danger)">${aus}</div><div style="font-size:9px;color:var(--silver)">AUS</div></div>
        ${badge(pctTxt,pC,pB)}
      </div>
    </div>`;

    return `<div class="t-row">
      <div style="flex:1;font-weight:500">${n.nombre}</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${n.grupos?.nombre||'—'}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;color:#0F6E56;font-weight:500">${pres}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;color:var(--danger);font-weight:500">${aus}</div>
      <div style="width:100px;text-align:center;flex-shrink:0">${badge(pctTxt,pC,pB)}</div>
    </div>`;
  }).join('');
}
window.loadAsistEscNinos = loadAsistEscNinos;

async function cargarSelectorGrupoAsist() {
  await cargarFiltroGruposAsist();
}

async function loadAsistEscGrupo() {
  const grupoId = document.getElementById('eg-grupo').value;
  const tabla = document.getElementById('eg-tabla');
  if (!grupoId) { tabla.innerHTML = '<div class="empty">Seleccioná un grupo para ver su historial</div>'; document.getElementById('eg-ct').textContent='—'; return; }

  tabla.innerHTML = '<div class="empty">Cargando...</div>';

  const {data:sesiones} = await sb.from('sesiones_escuelita')
    .select('*, instructores(nombre)')
    .eq('grupo_id', grupoId)
    .order('fecha', {ascending:false})
    .limit(60);

  if (!sesiones?.length) { tabla.innerHTML = '<div class="empty">Sin sesiones registradas para este grupo</div>'; document.getElementById('eg-ct').textContent='0 sesiones'; return; }

  // Para cada sesión, contar asistencia de niños ese día
  const fechas = [...new Set(sesiones.map(s=>s.fecha))];
  const {data:ninosGrupo} = await sb.from('grupo_ninos').select('id').eq('grupo_id', grupoId);
  const ninoIds = (ninosGrupo||[]).map(n=>n.id);
  const {data:asistTodas} = ninoIds.length
    ? await sb.from('asistencia_ninos').select('fecha,nino_id,presente').in('nino_id',ninoIds).in('fecha',fechas)
    : {data:[]};

  document.getElementById('eg-ct').textContent = `${sesiones.length} sesiones`;
  const isMobile = window.innerWidth < 768;

  tabla.innerHTML = sesiones.map(s => {
    const regsDia = (asistTodas||[]).filter(a => a.fecha === s.fecha);
    const pres = regsDia.filter(a=>a.presente).length;
    const aus = regsDia.filter(a=>!a.presente).length;
    const fechaStr = new Date(s.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const estadoColor = s.estado==='completada'?'#0F6E56':s.estado==='cancelada'?'var(--danger)':'var(--silver)';
    const estadoBg = s.estado==='completada'?'#E1F5EE':s.estado==='cancelada'?'var(--danger-bg)':'var(--ice)';
    const onclick = `onclick="abrirDetalleSesionAsist('${grupoId}','${s.fecha}','${fechaStr}')" style="cursor:pointer"`;

    if (isMobile) return `<div ${onclick} style="padding:12px 16px;border-bottom:1px solid var(--ice)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:13px;font-weight:500">${fechaStr} · ${s.hora_inicio?.slice(0,5)}</div>
        ${badge(s.estado,estadoColor,estadoBg)}
      </div>
      <div style="font-size:11px;color:var(--silver)">${s.instructores?.nombre||'—'} · ${pres} presentes / ${aus} ausentes</div>
    </div>`;

    return `<div class="t-row" ${onclick} onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="width:130px;flex-shrink:0;font-weight:500">${fechaStr}</div>
      <div style="width:70px;flex-shrink:0;color:var(--muted);font-size:12px">${s.hora_inicio?.slice(0,5)}</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${s.instructores?.nombre||'—'}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;color:#0F6E56">${pres} pres.</div>
      <div style="width:90px;text-align:center;flex-shrink:0;color:var(--danger)">${aus} aus.</div>
      <div style="width:110px;text-align:center;flex-shrink:0">${badge(s.estado,estadoColor,estadoBg)}</div>
    </div>`;
  }).join('');
}
window.loadAsistEscGrupo = loadAsistEscGrupo;

// ── ASISTENCIA POR INSTRUCTOR (ESCUELITA) ─────────────
function getSemanaActual() {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() + offsetLunes);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  return { desde: lunes.toISOString().split('T')[0], hasta: domingo.toISOString().split('T')[0] };
}
function getMesActual() {
  const hoy = new Date();
  const desde = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
  const hasta = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
  return { desde, hasta };
}

async function loadAsistEscInstructores() {
  const tabla = document.getElementById('ei-tabla');
  tabla.innerHTML = '<div class="empty">Cargando...</div>';

  const {data:insts} = await sb.from('instructores').select('id,nombre').eq('activo',true).eq('escuelita',true).order('nombre');
  if (!insts?.length) { tabla.innerHTML = '<div class="empty">No hay instructores de escuelita</div>'; return; }

  const semana = getSemanaActual();
  const mes = getMesActual();

  const {data:sesionesMes} = await sb.from('sesiones_escuelita').select('instructor_id,fecha,duracion_horas').gte('fecha',mes.desde).lte('fecha',mes.hasta);

  document.getElementById('ei-ct').textContent = `${insts.length} instructores`;
  const isMobile = window.innerWidth < 768;

  tabla.innerHTML = insts.map(inst => {
    const delMes = (sesionesMes||[]).filter(s=>s.instructor_id===inst.id);
    const deLaSemana = delMes.filter(s=>s.fecha>=semana.desde && s.fecha<=semana.hasta);
    const horasMes = delMes.reduce((s,x)=>s+(parseFloat(x.duracion_horas)||0),0);
    const onclick = `onclick="abrirDetalleSesionesInstEsc('${inst.id}','${inst.nombre.replace(/'/g,"\\'")}')" style="cursor:pointer"`;

    if (isMobile) return `<div ${onclick} style="padding:14px 16px;border-bottom:1px solid var(--ice);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:500">${inst.nombre}</div>
      <div style="display:flex;gap:14px;align-items:center">
        <div style="text-align:center"><div style="font-size:14px;font-weight:600;color:var(--navy)">${deLaSemana.length}</div><div style="font-size:9px;color:var(--silver)">SEM</div></div>
        <div style="text-align:center"><div style="font-size:14px;font-weight:600;color:var(--navy)">${delMes.length}</div><div style="font-size:9px;color:var(--silver)">MES</div></div>
      </div>
    </div>`;

    return `<div class="t-row" ${onclick} onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="flex:1;font-weight:500">${inst.nombre}</div>
      <div style="width:100px;text-align:center;flex-shrink:0">${deLaSemana.length} sesiones</div>
      <div style="width:100px;text-align:center;flex-shrink:0">${delMes.length} sesiones</div>
      <div style="width:110px;text-align:center;flex-shrink:0">${horasMes.toFixed(1)} hs</div>
    </div>`;
  }).join('');
}
window.loadAsistEscInstructores = loadAsistEscInstructores;

let deiInstId = null;
async function abrirDetalleSesionesInstEsc(instId, nombre) {
  let modal = document.getElementById('modal-detalle-sesiones-inst');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-detalle-sesiones-inst';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-head"><span class="modal-title" id="dei-titulo">Sesiones</span><button class="modal-close" onclick="document.getElementById('modal-detalle-sesiones-inst').remove()">&times;</button></div>
        <div class="modal-body" style="max-height:75vh;overflow-y:auto">
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <button id="dei-tab-semana" onclick="setDeiTab('semana')" style="flex:1;height:34px;border:1px solid var(--line);border-radius:6px;background:var(--navy);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;font-weight:500">Esta semana</button>
            <button id="dei-tab-mes" onclick="setDeiTab('mes')" style="flex:1;height:34px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;font-weight:500">Este mes</button>
          </div>
          <div id="dei-stats" style="display:flex;gap:10px;margin-bottom:16px"></div>
          <div id="dei-lista" style="border:1px solid var(--line);border-radius:8px;overflow:hidden"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } else {
    modal.style.display = 'flex';
  }
  document.getElementById('dei-titulo').textContent = nombre;
  deiInstId = instId;
  setDeiTab('semana');
}
window.abrirDetalleSesionesInstEsc = abrirDetalleSesionesInstEsc;

function setDeiTab(tab) {
  const esSemana = tab === 'semana';
  document.getElementById('dei-tab-semana').style.background = esSemana ? 'var(--navy)' : '#fff';
  document.getElementById('dei-tab-semana').style.color = esSemana ? '#fff' : 'var(--muted)';
  document.getElementById('dei-tab-mes').style.background = !esSemana ? 'var(--navy)' : '#fff';
  document.getElementById('dei-tab-mes').style.color = !esSemana ? '#fff' : 'var(--muted)';
  cargarSesionesInstEscDetalle(tab);
}
window.setDeiTab = setDeiTab;

async function cargarSesionesInstEscDetalle(periodo) {
  const lista = document.getElementById('dei-lista');
  const stats = document.getElementById('dei-stats');
  lista.innerHTML = '<div style="padding:20px;text-align:center;color:var(--silver);font-size:13px">Cargando...</div>';
  stats.innerHTML = '';

  const {desde, hasta} = periodo === 'semana' ? getSemanaActual() : getMesActual();

  const {data:sesiones} = await sb.from('sesiones_escuelita')
    .select('*, grupos(nombre, nivel)')
    .eq('instructor_id', deiInstId)
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha').order('hora_inicio');

  const completadas = (sesiones||[]).filter(s=>s.estado==='completada').length;
  const horas = (sesiones||[]).reduce((s,x)=>s+(parseFloat(x.duracion_horas)||0),0);

  stats.innerHTML = `
    <div style="flex:1;background:var(--ice);border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:var(--navy)">${sesiones?.length||0}</div>
      <div style="font-size:9px;color:var(--silver);text-transform:uppercase">Sesiones</div>
    </div>
    <div style="flex:1;background:#E1F5EE;border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:#0F6E56">${completadas}</div>
      <div style="font-size:9px;color:#0F6E56;text-transform:uppercase">Completadas</div>
    </div>
    <div style="flex:1;background:var(--ice);border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:var(--navy)">${horas.toFixed(1)}</div>
      <div style="font-size:9px;color:var(--silver);text-transform:uppercase">Horas</div>
    </div>
  `;

  if (!sesiones?.length) { lista.innerHTML = '<div class="empty">Sin sesiones en este período</div>'; return; }

  lista.innerHTML = sesiones.map(s => {
    const fechaStr = new Date(s.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const estadoColor = s.estado==='completada'?'#0F6E56':s.estado==='cancelada'?'var(--danger)':'var(--accent2)';
    const estadoBg = s.estado==='completada'?'#E1F5EE':s.estado==='cancelada'?'var(--danger-bg)':'#E6F1FB';
    return `<div style="padding:10px 14px;border-bottom:1px solid var(--ice);display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${fechaStr} · ${s.hora_inicio?.slice(0,5)}</div>
        <div style="font-size:11px;color:var(--silver);margin-top:1px">${s.grupos?.nombre||'—'} · ${s.grupos?.nivel||''} · ${s.duracion_horas}h</div>
      </div>
      <span style="font-size:10px;font-weight:500;color:${estadoColor};background:${estadoBg};padding:2px 8px;border-radius:10px;flex-shrink:0">${s.estado}</span>
    </div>`;
  }).join('');
}

// Modal de detalle: quién asistió ese día
async function abrirDetalleSesionAsist(grupoId, fecha, fechaStr) {
  let modal = document.getElementById('modal-detalle-sesion-asist');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-detalle-sesion-asist';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-head"><span class="modal-title" id="dsa-titulo">Asistencia</span><button class="modal-close" onclick="document.getElementById('modal-detalle-sesion-asist').remove()">&times;</button></div>
        <div class="modal-body" id="dsa-body" style="max-height:70vh;overflow-y:auto"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } else {
    modal.style.display = 'flex';
  }
  document.getElementById('dsa-titulo').textContent = fechaStr;
  const body = document.getElementById('dsa-body');
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--silver);font-size:13px">Cargando...</div>';

  const {data:ninos} = await sb.from('grupo_ninos').select('id,nombre,edad').eq('grupo_id', grupoId).order('nombre');
  if (!ninos?.length) { body.innerHTML = '<div class="empty">Sin niños en este grupo</div>'; return; }

  const ids = ninos.map(n=>n.id);
  const {data:asist} = await sb.from('asistencia_ninos').select('nino_id,presente').eq('fecha', fecha).in('nino_id', ids);
  const asistMap = {};
  (asist||[]).forEach(a => { asistMap[a.nino_id] = a.presente; });

  const presentes = ninos.filter(n => asistMap[n.id] === true);
  const ausentes = ninos.filter(n => asistMap[n.id] === false);
  const sinRegistro = ninos.filter(n => asistMap[n.id] === undefined);

  body.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:18px">
      <div style="flex:1;background:#E1F5EE;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:600;color:#0F6E56;font-family:'Cormorant Garamond',serif">${presentes.length}</div>
        <div style="font-size:10px;color:#0F6E56;text-transform:uppercase;letter-spacing:.05em">Presentes</div>
      </div>
      <div style="flex:1;background:var(--danger-bg);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:600;color:var(--danger);font-family:'Cormorant Garamond',serif">${ausentes.length}</div>
        <div style="font-size:10px;color:var(--danger);text-transform:uppercase;letter-spacing:.05em">Ausentes</div>
      </div>
      ${sinRegistro.length ? `<div style="flex:1;background:var(--ice);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:600;color:var(--silver);font-family:'Cormorant Garamond',serif">${sinRegistro.length}</div>
        <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.05em">Sin registro</div>
      </div>` : ''}
    </div>
    ${presentes.length ? `
      <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:500">✓ Presentes</div>
      <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px">
        ${presentes.map(n=>`<div style="padding:9px 14px;border-bottom:1px solid var(--ice);font-size:13px">${n.nombre} <span style="color:var(--silver);font-size:11px">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>`).join('')}
      </div>` : ''}
    ${ausentes.length ? `
      <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:500">✕ Ausentes</div>
      <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px">
        ${ausentes.map(n=>`<div style="padding:9px 14px;border-bottom:1px solid var(--ice);font-size:13px">${n.nombre} <span style="color:var(--silver);font-size:11px">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>`).join('')}
      </div>` : ''}
    ${sinRegistro.length ? `
      <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:500">— Sin registrar</div>
      <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
        ${sinRegistro.map(n=>`<div style="padding:9px 14px;border-bottom:1px solid var(--ice);font-size:13px;color:var(--silver)">${n.nombre} <span style="font-size:11px">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>`).join('')}
      </div>` : ''}
  `;
}
window.abrirDetalleSesionAsist = abrirDetalleSesionAsist;
let rolActual = null;

async function loadUsuarios() {
  if (!esSuperadmin()) { setPage('asignacion'); return; }
  const tabla = document.getElementById('usuarios-tabla');
  tabla.innerHTML = '<div class="empty">Cargando...</div>';
  const {data} = await sb.from('usuarios').select('*, instructores(nombre)').order('rol');
  document.getElementById('usuarios-ct').textContent = `${data?.length||0} usuarios`;
  if (!data?.length) { tabla.innerHTML = '<div class="empty">No hay usuarios</div>'; return; }

  const colores = {superadmin:{c:'#7C3AED',bg:'#EDE9FE'}, admin:{c:'#0F6E56',bg:'#E1F5EE'}, supervisor:{c:'#185FA5',bg:'#E6F1FB'}, instructor:{c:'var(--muted)',bg:'var(--ice)'}};

  tabla.innerHTML = data.map(u => {
    const esSuperadmin = u.rol === 'superadmin';
    const {c,bg} = colores[u.rol]||colores.instructor;
    return `<div class="t-row">
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email}</div>
      <div style="width:130px;flex-shrink:0"><span style="font-size:11px;font-weight:500;color:${c};background:${bg};padding:3px 10px;border-radius:20px">${u.rol}</span></div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${u.instructores?.nombre||'—'}</div>
      <div style="width:100px;flex-shrink:0;text-align:center">
        ${esSuperadmin ? '<span style="font-size:11px;color:var(--silver)">Protegido</span>' :
          `<button class="inst-action-btn" onclick="abrirCambiarRol('${u.id}','${u.email}','${u.rol}')">Cambiar rol</button>`}
      </div>
    </div>`;
  }).join('');
}

// Modal cambiar rol
let usuarioACambiar = null;
document.getElementById('mcr-close').addEventListener('click',()=>closeModal('modal-cambiar-rol'));
document.getElementById('mcr-cancel').addEventListener('click',()=>closeModal('modal-cambiar-rol'));
document.getElementById('mcr-save').addEventListener('click', async()=>{
  if (!usuarioACambiar) return;
  const nuevoRol = document.querySelector('input[name="mcr-rol"]:checked')?.value;
  if (!nuevoRol) { toast('Seleccioná un rol','err'); return; }
  const btn = document.getElementById('mcr-save');
  btn.textContent='Guardando...'; btn.disabled=true;
  await sb.from('usuarios').update({rol:nuevoRol}).eq('id',usuarioACambiar);
  // Si cambia a no-instructor, desvincular instructor_id
  if (nuevoRol !== 'instructor') {
    await sb.from('usuarios').update({instructor_id:null}).eq('id',usuarioACambiar);
  }
  closeModal('modal-cambiar-rol');
  toast('Rol actualizado correctamente');
  btn.textContent='Guardar cambio'; btn.disabled=false;
  loadUsuarios();
  usuarioACambiar=null;
});

function abrirCambiarRol(id, email, rolActualVal) {
  usuarioACambiar = id;
  document.getElementById('mcr-email').textContent = email;
  document.getElementById('mcr-rol-actual').textContent = `Rol actual: ${rolActualVal}`;
  // Seleccionar rol actual
  const radios = document.querySelectorAll('input[name="mcr-rol"]');
  radios.forEach(r => { r.checked = r.value === rolActualVal; });
  openModal('modal-cambiar-rol');
}
window.abrirCambiarRol = abrirCambiarRol;

// Control de acceso por rol
let ROL_ACTUAL = 'supervisor';

async function checkSuperadmin() {
  const {data:{session}} = await sb.auth.getSession();
  if (!session) return;
  const {data:u} = await sb.from('usuarios').select('rol').eq('id',session.user.id).maybeSingle();
  ROL_ACTUAL = u?.rol || 'supervisor';

  if (ROL_ACTUAL === 'superadmin') {
    // Secciones exclusivas de superadmin
    document.getElementById('nav-usuarios').style.display = 'flex';
    document.getElementById('pm-temporada').style.display = 'flex';
    // Mostrar nav de Sistema si está oculto
    document.querySelectorAll('.nav-sec').forEach(el => {
      if (el.textContent.trim() === 'Sistema') el.style.display = '';
    });
  } else {
    // Supervisor — ocultar sección Sistema del sidebar si no tiene nada visible
    const navSistema = document.querySelectorAll('.nav-sec');
    navSistema.forEach(el => {
      if (el.textContent.trim() === 'Sistema') el.style.display = 'none';
    });
  }
}

function esSuperadmin() { return ROL_ACTUAL === 'superadmin'; }
window.esSuperadmin = esSuperadmin;


let modoActual = 'escuela';

// Guardar modo y página al cambiar
// ── FECHA EN ESPAÑOL — Flatpickr ──────────────────────
function normalizarFecha(val) {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  if (val.includes('/')) {
    const p = val.split('/');
    if (p[2]?.length === 4) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    if (p[0]?.length === 4) return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  return val;
}

function initDatePickers() {
  if (typeof flatpickr === 'undefined') return;
  const locale = {
    weekdays:{shorthand:['Do','Lu','Ma','Mi','Ju','Vi','Sá'],longhand:['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']},
    months:{shorthand:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],longhand:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']},
    firstDayOfWeek:1
  };
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (input._flatpickr) return;
    flatpickr(input, {
      locale,
      dateFormat:'Y-m-d',
      altInput:true,
      altFormat:'d/m/Y',
      defaultDate: input.value || fechaISO,
      disableMobile: true,
      onReady: (_, __, fp) => {
        // Hacer readonly el input de año para evitar borrado
        const yearInput = fp.calendarContainer?.querySelector('.numInput.cur-year');
        if (yearInput) yearInput.setAttribute('readonly', true);
      },
      onChange: (dates, dateStr) => {
        input.value = dateStr;
        input.dispatchEvent(new Event('change'));
      }
    });
  });
}

// ── SKELETONS ─────────────────────────────────────────
function skRows(n=4,h=48){return Array(n).fill(`<div class="sk sk-row" style="height:${h}px;margin-bottom:6px"></div>`).join('');}
function skPresencia(n=5){return Array(n).fill(`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--ice)"><div style="flex:1"><div class="sk sk-text" style="width:55%;margin-bottom:6px"></div><div class="sk" style="height:10px;width:35%"></div></div><div class="sk" style="width:70px;height:26px;border-radius:20px"></div></div>`).join('');}
// ── FLUJO TIPO DE CLIENTE ─────────────────────────────
function elegirTipoCliente(tipo) {
  document.getElementById('paso-tipo-cliente').style.display = 'none';
  if (tipo === 'nuevo') {
    document.getElementById('cli-id-existente').value = '';
    document.getElementById('cli-existente-badge').style.display = 'none';
    document.getElementById('form-cliente-label').textContent = 'Datos del cliente nuevo';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-tel').value = '';
    document.getElementById('paso-form-cliente').style.display = 'block';
    initDatePickers();
  } else {
    document.getElementById('paso-buscar-cliente').style.display = 'block';
    setTimeout(() => document.getElementById('cli-buscar').focus(), 100);
  }
}
window.elegirTipoCliente = elegirTipoCliente;

function resetTipoCliente() {
  document.getElementById('paso-tipo-cliente').style.display = 'block';
  document.getElementById('paso-buscar-cliente').style.display = 'none';
  document.getElementById('paso-form-cliente').style.display = 'none';
  document.getElementById('cli-resultados').style.display = 'none';
  document.getElementById('cli-buscar').value = '';
  document.getElementById('cli-id-existente').value = '';
  // Re-habilitar campos que puedan haber quedado bloqueados
  ['cli-nombre','cli-tel'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) { el.disabled = false; el.style.background = ''; el.style.color = ''; }
  });
  document.getElementById('rk-lista').innerHTML = '<div style="padding:18px 0;text-align:center;color:var(--silver);font-size:13px">Completá los datos y buscá instructores</div>';
}
window.resetTipoCliente = resetTipoCliente;

// Datos del cliente en preview (para pasar a seleccionar/modificar)
let _previewCli = null;

async function buscarClienteExistente() {
  const q = document.getElementById('cli-buscar').value.trim();
  const res = document.getElementById('cli-resultados');
  if (q.length < 2) { res.style.display = 'none'; return; }
  const {data} = await sb.from('clientes').select('*').or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`).order('nombre').limit(8);
  if (!data?.length) {
    res.style.display = 'block';
    res.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:var(--silver)">No encontrado — <button onclick="elegirTipoCliente('nuevo')" style="background:none;border:none;cursor:pointer;color:var(--accent2);font-weight:500;font-size:13px">Crear como nuevo</button></div>`;
    return;
  }
  res.style.display = 'block';
  res.innerHTML = data.map(c => {
    const ultimaClase = c.ultima_clase ? new Date(c.ultima_clase+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : null;
    const disc = c.disciplina||'';
    const nivel = c.nivel_validado||c.nivel_declarado||'';
    const info = [disc, nivel].filter(Boolean).join(' · ');
    return `<div onclick="abrirPreviewCliente(${JSON.stringify(c).replace(/"/g,'&quot;')})" style="padding:12px 14px;border-bottom:1px solid var(--ice);cursor:pointer;display:flex;align-items:center;gap:12px;transition:background .1s" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0">${(c.nombre||'?')[0].toUpperCase()}</div>
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--navy)">${c.nombre}</div>
        <div style="font-size:11px;color:var(--silver);margin-top:1px">${info}${ultimaClase?' · Últ: '+ultimaClase:''}</div>
      </div>
      <div style="margin-left:auto;color:var(--silver);font-size:16px;flex-shrink:0">›</div>
    </div>`;
  }).join('');
}
window.buscarClienteExistente = buscarClienteExistente;

function abrirPreviewCliente(c) {
  _previewCli = c;
  const inicial = (c.nombre||'?')[0].toUpperCase();
  document.getElementById('mpc-avatar').textContent = inicial;
  document.getElementById('mpc-nombre').textContent = c.nombre||'—';
  const disc = c.disciplina||'';
  const nivel = c.nivel_validado||c.nivel_declarado||'';
  document.getElementById('mpc-sub').textContent = [disc, nivel].filter(Boolean).join(' · ') || '—';
  // Pills
  const pills = [];
  if (c.telefono) pills.push(`<span style="background:var(--ice);border:1px solid var(--line);border-radius:20px;padding:4px 10px;font-size:11px;color:var(--muted)">📞 ${c.telefono}</span>`);
  if (c.rango_etario) pills.push(`<span style="background:var(--ice);border:1px solid var(--line);border-radius:20px;padding:4px 10px;font-size:11px;color:var(--muted)">${c.rango_etario}</span>`);
  document.getElementById('mpc-pills').innerHTML = pills.join('');
  const ult = c.ultima_clase ? new Date(c.ultima_clase+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}) : null;
  document.getElementById('mpc-ultima').textContent = ult ? `Última clase: ${ult}` : 'Sin clases registradas';
  // Botones
  document.getElementById('mpc-btn-seleccionar').onclick = () => { closeModal('modal-preview-cli'); seleccionarClienteExistente(false); };
  document.getElementById('mpc-btn-modificar').onclick = () => { closeModal('modal-preview-cli'); seleccionarClienteExistente(true); };
  openModal('modal-preview-cli');
}
window.abrirPreviewCliente = abrirPreviewCliente;

function abrirPreviewClienteDesdeForm() {
  if (_previewCli) abrirPreviewCliente(_previewCli);
}
window.abrirPreviewClienteDesdeForm = abrirPreviewClienteDesdeForm;

function seleccionarClienteExistente(editable) {
  const c = _previewCli;
  if (!c) return;
  document.getElementById('cli-buscar').value = '';
  document.getElementById('cli-resultados').style.display = 'none';
  document.getElementById('paso-buscar-cliente').style.display = 'none';
  document.getElementById('cli-id-existente').value = c.id;
  document.getElementById('cli-id-existente-hidden').value = c.id;
  document.getElementById('cli-nombre').value = c.nombre||'';
  document.getElementById('cli-tel').value = c.telefono||'';
  if (c.disciplina) document.getElementById('cli-disc').value = c.disciplina;
  if (c.rango_etario) document.getElementById('cli-rango').value = c.rango_etario;
  const nivel = c.nivel_validado||c.nivel_declarado||'';
  if (nivel) {
    document.querySelectorAll('.nivel-btn[data-nivel]').forEach(b => b.classList.toggle('active', b.dataset.nivel === nivel));
    nivelCliente = nivel;
  }
  // Mostrar/ocultar campos de edición
  const camposEdicion = document.getElementById('cli-campos-edicion');
  camposEdicion.style.display = editable ? '' : 'none';
  // Badge
  const badge = document.getElementById('cli-existente-badge');
  badge.style.display = 'flex';
  document.getElementById('cli-badge-nombre').textContent = c.nombre||'—';
  document.getElementById('cli-badge-avatar').textContent = (c.nombre||'?')[0].toUpperCase();
  const disc = c.disciplina||'';
  const nivel2 = c.nivel_validado||c.nivel_declarado||'';
  document.getElementById('cli-badge-info').textContent = [disc, nivel2, c.telefono].filter(Boolean).join(' · ');
  document.getElementById('form-cliente-label').textContent = editable ? 'Modificar cliente' : 'Cliente seleccionado';
  document.getElementById('paso-form-cliente').style.display = 'block';
  initDatePickers();
}
window.seleccionarClienteExistente = seleccionarClienteExistente;

function initSkeletons(){
  try{ document.getElementById('clases-hoy-lista').innerHTML=skRows(3,56); }catch(e){}
  try{ document.getElementById('pres-lista').innerHTML=skPresencia(5); }catch(e){}
  try{ document.getElementById('rk-tabla').innerHTML=skRows(5); }catch(e){}
  try{ document.getElementById('cl-tabla').innerHTML=skRows(3); }catch(e){}
  try{ ['stat-clases','stat-insts','stat-resenas'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML='<span class="sk" style="display:inline-block;width:40px;height:28px;vertical-align:middle"></span>';
  }); }catch(e){}
}

function setModo(modo) {
  modoActual = modo;
  localStorage.setItem('vertex_modo', modo);
  const esCerro = modo === 'escuela';

  // Switch topbar + sidebar (mobile) — misma clase para ambas copias del control
  document.querySelectorAll('.modo-btn-escuela').forEach(b => b.classList.toggle('active', esCerro));
  document.querySelectorAll('.modo-btn-escuelita').forEach(b => b.classList.toggle('active', !esCerro));

  // Sidebar
  document.getElementById('nav-escuela').style.display = esCerro ? 'block' : 'none';
  document.getElementById('nav-escuelita').style.display = !esCerro ? 'block' : 'none';

  // Pantalla principal del modo
  if (esCerro) {
    setPage('asignacion');
    document.getElementById('fab-btn').style.display = 'flex';
    document.getElementById('fab-menu-escuela').style.display = 'flex';
    document.getElementById('fab-menu-escuelita').style.display = 'none';
  } else {
    setPage('esc-inicio');
    document.getElementById('fab-btn').style.display = 'flex';
    document.getElementById('fab-menu-escuela').style.display = 'none';
    document.getElementById('fab-menu-escuelita').style.display = 'flex';
  }
}

// ── PÁGINAS ESCUELITA ─────────────────────────────────
const PAGES_ESCUELITA = ['esc-inicio','esc-grupos','esc-sesiones','esc-admin-grupos','esc-familias','esc-asistencia'];
const TITLES_ESC = {'esc-inicio':'Inicio','esc-grupos':'Grupos de hoy','esc-sesiones':'Sesiones','esc-admin-grupos':'Administrar grupos','esc-familias':'Familias','esc-asistencia':'Asistencia'};

// Extender setPage para escuelita — se completa abajo cuando PAGES/TITLES/LOADERS estén definidos

// Grupos de hoy
async function loadEscGruposHoy() {
  const fecha = document.getElementById('f-fecha-esc').value || fechaISO;
  const lista = document.getElementById('esc-grupos-lista');
  lista.innerHTML='<div class="empty">Cargando...</div>';
  const {data:grupos} = await sb.from('grupos').select('*, instructores(nombre), sesiones_escuelita(*), grupo_ninos(*)').eq('activo',true).order('nombre');
  if (!grupos?.length) { lista.innerHTML='<div class="empty">No hay grupos activos. Creá uno desde "Administrar grupos".</div>'; document.getElementById('esc-grupos-ct').textContent='0 grupos'; return; }
  document.getElementById('esc-grupos-ct').textContent=`${grupos.length} grupos`;

  lista.innerHTML = grupos.map(g => {
    const ninos = (g.grupo_ninos||[]).filter(n=>n.activo);
    const sesionHoy = (g.sesiones_escuelita||[]).find(s=>s.fecha===fecha);
    const estadoColor = sesionHoy?.estado==='completada'?'#0F6E56':sesionHoy?.estado==='programada'?'#185FA5':'var(--silver)';
    const estadoBg    = sesionHoy?.estado==='completada'?'#E1F5EE':sesionHoy?.estado==='programada'?'#E6F1FB':'var(--ice)';
    const estadoLabel = sesionHoy?.estado==='completada'?'Completada':sesionHoy?.estado==='programada'?'Programada':'Sin sesión';
    return `
    <div style="padding:16px 18px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onclick="abrirDetalleGrupo('${g.id}','${g.nombre}','${g.instructores?.nombre||'Sin instructor'}','${g.edad_min}-${g.edad_max} años')" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;border-radius:10px;background:var(--navy);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:20px;color:#fff;font-weight:600;flex-shrink:0">${g.nombre[0]}</div>
          <div>
            <div style="font-size:14px;font-weight:500;color:var(--text)">${g.nombre}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${g.instructores?.nombre||'Sin instructor'} · ${g.edad_min}-${g.edad_max} años${g.nivel?' · '+g.nivel:''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="text-align:center">
            <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--navy)">${ninos.length}</div>
            <div style="font-size:10px;color:var(--silver)">niños</div>
          </div>
          <span style="font-size:11px;font-weight:500;color:${estadoColor};background:${estadoBg};padding:3px 10px;border-radius:20px">${estadoLabel}</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--silver)" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
        </div>
      </div>
      ${sesionHoy ? `<div style="margin-top:8px;font-size:12px;color:var(--muted);padding-left:58px">${sesionHoy.hora_inicio?.slice(0,5)||'—'} hs · ${sesionHoy.duracion_horas}h</div>` : ''}
    </div>`;
  }).join('');
}

// Sesiones
async function loadEscSesiones() {
  const fechaRaw = document.getElementById('f-fecha-ses').value || fechaISO;
  const estado   = document.getElementById('f-estado-ses').value;
  const tabla    = document.getElementById('esc-ses-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  let q = sb.from('sesiones_escuelita').select('*, grupos(nombre,edad_min,edad_max), instructores(nombre)').eq('fecha',fechaRaw).order('hora_inicio');
  if (estado) q = q.eq('estado',estado);
  const {data} = await q;
  document.getElementById('esc-ses-ct').textContent=`${data?.length||0} sesiones`;
  if (!data?.length) { tabla.innerHTML='<div class="empty">No hay sesiones para esta fecha</div>'; return; }
  const isMobile = window.innerWidth < 768;
  tabla.innerHTML = data.map(s => {
    const eC = s.estado==='completada'?'#0F6E56':s.estado==='programada'?'#185FA5':'var(--warn)';
    const eB = s.estado==='completada'?'#E1F5EE':s.estado==='programada'?'#E6F1FB':'var(--warn-bg)';
    if (isMobile) {
      return `<div style="padding:14px 16px;border-bottom:1px solid var(--ice)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:500;color:var(--navy)">${s.hora_inicio?.slice(0,5)||'—'} <span style="font-size:12px;color:var(--silver);font-weight:400">${s.duracion_horas}h</span></div>
            <div style="font-size:13px;color:var(--text);margin-top:2px">${s.grupos?.nombre||'—'} (${s.grupos?.edad_min}-${s.grupos?.edad_max} años)</div>
            <div style="font-size:12px;color:var(--muted);margin-top:1px">${s.instructores?.nombre||'—'}</div>
          </div>
          <span style="font-size:11px;font-weight:500;color:${eC};background:${eB};padding:3px 10px;border-radius:20px;flex-shrink:0">${s.estado}</span>
        </div>
        ${s.estado==='programada'?`<div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="finalizarSesion('${s.id}')" style="flex:1;height:34px;border:1px solid #E1F5EE;border-radius:6px;background:#E1F5EE;color:#0F6E56;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">Finalizar</button>
          <button onclick="cancelarSesion('${s.id}')" style="flex:1;height:34px;border:1px solid var(--danger-bg);border-radius:6px;background:var(--danger-bg);color:var(--danger);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">Cancelar</button>
        </div>`:''}
      </div>`;
    }
    return `<div class="t-row">
      <div style="width:70px;flex-shrink:0;font-weight:500;color:var(--navy)">${s.hora_inicio?.slice(0,5)||'—'}</div>
      <div style="flex:1">${s.grupos?.nombre||'—'} <span style="font-size:11px;color:var(--silver)">(${s.grupos?.edad_min}-${s.grupos?.edad_max} años)</span></div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${s.instructores?.nombre||'—'}</div>
      <div style="width:80px;text-align:center;flex-shrink:0;font-size:12px;color:var(--muted)">${s.duracion_horas}h</div>
      <div style="width:140px;flex-shrink:0;display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;font-weight:500;color:${eC};background:${eB};padding:2px 9px;border-radius:20px">${s.estado}</span>
        ${s.estado==='programada'?`
          <button class="inst-action-btn" title="Finalizar" onclick="finalizarSesion('${s.id}')" style="width:26px;padding:0;display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" stroke-width="2.5" stroke-linecap="round"><path d="M4 12l5 5L20 7"/></svg></button>
          <button class="inst-action-btn" title="Cancelar" onclick="cancelarSesion('${s.id}')" style="width:26px;padding:0;display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        `:''}
      </div>
    </div>`;
  }).join('');
}

// Admin grupos
async function loadEscAdminGrupos() {
  const tabla = document.getElementById('esc-grupos-admin-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  const {data} = await sb.from('grupos').select('*, instructores(nombre), grupo_ninos(id,activo)').order('nombre');
  document.getElementById('esc-grupos-admin-ct').textContent=`${data?.length||0} grupos`;
  if (!data?.length) { tabla.innerHTML='<div class="empty">No hay grupos. Creá el primero con el botón de arriba.</div>'; return; }
  const isMobile = window.innerWidth < 768;
  tabla.innerHTML = data.map(g => {
    const ninos = (g.grupo_ninos||[]).filter(n=>n.activo).length;
    if (isMobile) return `<div style="padding:14px 16px;border-bottom:1px solid var(--ice)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-size:14px;font-weight:500;color:var(--navy)">${g.nombre}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${g.instructores?.nombre||'Sin instructor'} · ${g.edad_min}-${g.edad_max} años · ${ninos} niños</div>
        </div>
        ${badge(g.activo?'Activo':'Inactivo',g.activo?'#0F6E56':'var(--silver)',g.activo?'#E1F5EE':'var(--ice)')}
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="abrirDetalleGrupo('${g.id}','${g.nombre}','${g.instructores?.nombre||'Sin instructor'}','${g.edad_min}-${g.edad_max} años')" style="flex:1;height:32px;border:1px solid var(--line);border-radius:6px;background:#fff;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">Ver grupo</button>
        <button onclick="toggleGrupo('${g.id}',${g.activo})" style="flex:1;height:32px;border:none;border-radius:6px;background:${g.activo?'var(--danger-bg)':'#E1F5EE'};color:${g.activo?'var(--danger)':'#0F6E56'};font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">${g.activo?'Dar de baja':'Activar'}</button>
        <button onclick="eliminarGrupo('${g.id}','${g.nombre}')" style="height:32px;width:32px;border:none;border-radius:6px;background:var(--danger-bg);color:var(--danger);font-size:14px;cursor:pointer">✕</button>
      </div>
    </div>`;
    return `<div class="t-row">
      <div style="flex:1;font-weight:500">${g.nombre}</div>
      <div style="width:120px;flex-shrink:0;font-size:12px;color:var(--muted)">${g.edad_min}-${g.edad_max} años</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${g.instructores?.nombre||'—'}</div>
      <div style="width:80px;text-align:center;flex-shrink:0">${ninos}</div>
      <div style="width:100px;text-align:center;flex-shrink:0">${badge(g.activo?'Activo':'Inactivo',g.activo?'#0F6E56':'var(--silver)',g.activo?'#E1F5EE':'var(--ice)')}</div>
      <div style="width:120px;text-align:center;flex-shrink:0;display:flex;gap:4px;justify-content:center">
        <button class="inst-action-btn" onclick="abrirDetalleGrupo('${g.id}','${g.nombre}','${g.instructores?.nombre||'Sin instructor'}','${g.edad_min}-${g.edad_max} años')">Ver</button>
        <button class="inst-action-btn ${g.activo?'danger':''}" onclick="toggleGrupo('${g.id}',${g.activo})">${g.activo?'Baja':'Activar'}</button>
        <button class="inst-action-btn danger" onclick="eliminarGrupo('${g.id}','${g.nombre}')" title="Eliminar grupo">✕</button>
      </div>
    </div>`;
  }).join('');
}

// Detalle grupo
let grupoActual = null;
async function abrirDetalleGrupo(id, nombre, instructor, edades) {
  grupoActual = id;
  document.getElementById('mdg-titulo').textContent = nombre;
  document.getElementById('mdg-instructor').textContent = instructor;
  document.getElementById('mdg-edades').textContent = edades;
  openModal('modal-detalle-grupo');
  await cargarNinosGrupo(id);
}

async function cargarNinosGrupo(grupoId) {
  const {data} = await sb.from('grupo_ninos').select('*').eq('grupo_id',grupoId).eq('activo',true).order('nombre');
  document.getElementById('mdg-count').textContent = data?.length||0;
  const lista = document.getElementById('mdg-ninos-lista');
  if (!data?.length) { lista.innerHTML='<div class="empty">Sin niños en este grupo</div>'; return; }

  // Cargar asistencia de hoy
  const ids = data.map(n=>n.id);
  const {data:asist} = await sb.from('asistencia_ninos').select('nino_id, presente').eq('fecha', fechaISO).in('nino_id', ids);
  const asistMap = {};
  (asist||[]).forEach(a => { asistMap[a.nino_id] = a.presente; });

  lista.innerHTML = data.map(n => {
    const tieneInfo = n.alergias || n.condiciones_medicas || n.tutor1_nombre;
    const estado = asistMap[n.id]; // true, false, o undefined
    const diasTxt = n.indefinido ? 'Indefinido' : (n.dias_semana?.length ? n.dias_semana.join(',') : '');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--ice)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px">
          ${n.nombre}
          ${tieneInfo ? `<span style="font-size:9px;background:#E6F1FB;color:#185FA5;padding:1px 6px;border-radius:10px;font-weight:500">Ficha</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--silver);margin-top:2px">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años${diasTxt ? ' · '+diasTxt : ''}${n.alergias ? ' · ⚠️ '+n.alergias : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
        <button onclick="marcarAsistenciaNino('${n.id}',true,this)" style="width:30px;height:30px;border-radius:6px;border:1.5px solid ${estado===true?'#0F6E56':'var(--line)'};background:${estado===true?'#E1F5EE':'#fff'};color:${estado===true?'#0F6E56':'var(--silver)'};cursor:pointer;font-size:14px" title="Presente">✓</button>
        <button onclick="marcarAsistenciaNino('${n.id}',false,this)" style="width:30px;height:30px;border-radius:6px;border:1.5px solid ${estado===false?'var(--danger)':'var(--line)'};background:${estado===false?'var(--danger-bg)':'#fff'};color:${estado===false?'var(--danger)':'var(--silver)'};cursor:pointer;font-size:14px" title="Ausente">✕</button>
        <button onclick="abrirFichaNino('${n.id}')" style="font-size:11px;color:var(--accent2);background:none;border:none;cursor:pointer;padding:4px 6px">Editar</button>
        <button onclick="quitarNino('${n.id}')" style="font-size:11px;color:var(--danger);background:none;border:none;cursor:pointer;padding:4px 6px">Quitar</button>
      </div>
    </div>`;
  }).join('');
}

async function marcarAsistenciaNino(ninoId, presente, btn) {
  await sb.from('asistencia_ninos').upsert({
    nino_id: ninoId, fecha: fechaISO, presente,
    registrado_en: new Date().toLocaleString('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).replace(' ','T')
  }, {onConflict:'nino_id,fecha'});
  toast(presente ? 'Marcado presente' : 'Marcado ausente');
  await cargarNinosGrupo(grupoActual);
}
window.marcarAsistenciaNino = marcarAsistenciaNino;

async function buscarNinoExistente() {
  const q = document.getElementById('fn-buscar-existente').value.trim();
  const res = document.getElementById('fn-resultados-busqueda');
  if (q.length < 2) { res.innerHTML=''; return; }
  const {data} = await sb.from('grupo_ninos').select('*, grupos(nombre)').ilike('nombre','%'+q+'%').eq('activo',true).limit(5);
  if (!data?.length) { res.innerHTML='<div style="font-size:12px;color:var(--silver);padding:4px 0">Sin resultados</div>'; return; }
  res.innerHTML = data.map(n => `
    <div onclick="cargarNinoExistente('${n.id}')" style="padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin-bottom:5px;cursor:pointer;background:#fff;transition:background .15s" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background='#fff'">
      <div style="font-size:13px;font-weight:500">${n.nombre} <span style="color:var(--silver);font-weight:400">${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</span></div>
      <div style="font-size:11px;color:var(--muted)">${n.grupos?.nombre||'Sin grupo'}</div>
    </div>`).join('');
}
window.buscarNinoExistente = buscarNinoExistente;

async function cargarNinoExistente(id) {
  await abrirFichaNino(id);
  document.getElementById('fn-buscar-existente').value = '';
  document.getElementById('fn-resultados-busqueda').innerHTML = '';
}
window.cargarNinoExistente = cargarNinoExistente;

// Días de la semana para asistencia del niño
let fnDiasSeleccionados = new Set(['Lu','Ma','Mi','Ju','Vi']);
let fnIndefinido = false;

function renderFnDias() {
  const container = document.getElementById('fn-dias-container');
  container.innerHTML = '';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => {
    const btn = document.createElement('button');
    btn.textContent = d;
    btn.type = 'button';
    const activo = fnDiasSeleccionados.has(d);
    btn.style.cssText = `width:36px;height:36px;border-radius:50%;border:1.5px solid ${activo?'var(--navy)':'var(--line)'};background:${activo?'var(--navy)':'#fff'};color:${activo?'#fff':'var(--muted)'};font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s`;
    btn.onclick = () => {
      if (fnDiasSeleccionados.has(d)) fnDiasSeleccionados.delete(d);
      else fnDiasSeleccionados.add(d);
      renderFnDias();
    };
    container.appendChild(btn);
  });
}

function toggleFnIndefinido() {
  fnIndefinido = !fnIndefinido;
  document.getElementById('fn-indefinido-toggle').style.background = fnIndefinido ? 'var(--accent)' : 'var(--line)';
  document.getElementById('fn-indefinido-knob').style.transform = fnIndefinido ? 'translateX(17px)' : 'translateX(0)';
  document.getElementById('fn-fechas-wrap').style.opacity = fnIndefinido ? '0.4' : '1';
  document.getElementById('fn-hasta').disabled = fnIndefinido;
  if (fnIndefinido) document.getElementById('fn-hasta').value = '';
}
window.toggleFnIndefinido = toggleFnIndefinido;

async function cargarSelectorGrupos(grupoSeleccionado) {
  const sel = document.getElementById('fn-grupo');
  sel.innerHTML = '';
  const {data:grupos} = await sb.from('grupos').select('id,nombre').eq('activo',true).order('nombre');
  (grupos||[]).forEach(g => {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = g.nombre;
    if (g.id === grupoSeleccionado) o.selected = true;
    sel.appendChild(o);
  });
}

function abrirModalAgregarNino() {
  ninoActualId = null;
  document.getElementById('fn-titulo').textContent = 'Agregar niño';
  document.getElementById('fn-save').textContent = 'Agregar al grupo';
  document.getElementById('fn-buscar-panel').style.display = 'block';
  document.getElementById('fn-grupo-wrap').style.display = 'none';
  document.getElementById('fn-buscar-existente').value = '';
  document.getElementById('fn-resultados-busqueda').innerHTML = '';
  ['fn-nombre','fn-edad','fn-tel','fn-t1-nombre','fn-t1-relacion','fn-t1-tel',
   'fn-t2-nombre','fn-t2-relacion','fn-t2-tel','fn-alergias','fn-condiciones','fn-medicacion','fn-observaciones']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('fn-nacimiento').value = '';
  document.getElementById('fn-desde').value = fechaISO;
  document.getElementById('fn-hasta').value = '';
  fnDiasSeleccionados = new Set(['Lu','Ma','Mi','Ju','Vi']);
  fnIndefinido = false;
  renderFnDias();
  document.getElementById('fn-indefinido-toggle').style.background = 'var(--line)';
  document.getElementById('fn-indefinido-knob').style.transform = 'translateX(0)';
  document.getElementById('fn-fechas-wrap').style.opacity = '1';
  document.getElementById('fn-hasta').disabled = false;
  openModal('modal-ficha-nino');
}

async function abrirFichaNino(ninoId) {
  ninoActualId = ninoId;
  const {data:n} = await sb.from('grupo_ninos').select('*').eq('id',ninoId).single();
  if (!n) return;
  document.getElementById('fn-titulo').textContent = n.nombre;
  document.getElementById('fn-save').textContent = 'Guardar cambios';
  document.getElementById('fn-buscar-panel').style.display = 'none';
  document.getElementById('fn-grupo-wrap').style.display = 'block';
  await cargarSelectorGrupos(n.grupo_id);
  document.getElementById('fn-nombre').value = n.nombre||'';
  document.getElementById('fn-edad').value = n.edad||'';
  document.getElementById('fn-nacimiento').value = n.fecha_nacimiento||'';
  document.getElementById('fn-tel').value = n.telefono_contacto||'';
  document.getElementById('fn-desde').value = n.fecha_desde||'';
  document.getElementById('fn-hasta').value = n.fecha_hasta||'';
  document.getElementById('fn-t1-nombre').value = n.tutor1_nombre||'';
  document.getElementById('fn-t1-relacion').value = n.tutor1_relacion||'';
  document.getElementById('fn-t1-tel').value = n.tutor1_telefono||'';
  document.getElementById('fn-t2-nombre').value = n.tutor2_nombre||'';
  document.getElementById('fn-t2-relacion').value = n.tutor2_relacion||'';
  document.getElementById('fn-t2-tel').value = n.tutor2_telefono||'';
  document.getElementById('fn-alergias').value = n.alergias||'';
  document.getElementById('fn-condiciones').value = n.condiciones_medicas||'';
  document.getElementById('fn-medicacion').value = n.medicacion||'';
  document.getElementById('fn-observaciones').value = n.observaciones||'';

  fnDiasSeleccionados = new Set(n.dias_semana || ['Lu','Ma','Mi','Ju','Vi']);
  fnIndefinido = !!n.indefinido;
  renderFnDias();
  document.getElementById('fn-indefinido-toggle').style.background = fnIndefinido ? 'var(--accent)' : 'var(--line)';
  document.getElementById('fn-indefinido-knob').style.transform = fnIndefinido ? 'translateX(17px)' : 'translateX(0)';
  document.getElementById('fn-fechas-wrap').style.opacity = fnIndefinido ? '0.4' : '1';
  document.getElementById('fn-hasta').disabled = fnIndefinido;

  openModal('modal-ficha-nino');
}

async function guardarFichaNino() {
  const nombre = document.getElementById('fn-nombre').value.trim();
  if (!nombre) { toast('Ingresá el nombre del niño','err'); return; }
  const btn = document.getElementById('fn-save');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  const datos = {
    nombre,
    edad: parseInt(document.getElementById('fn-edad').value)||null,
    fecha_nacimiento: document.getElementById('fn-nacimiento').value||null,
    telefono_contacto: document.getElementById('fn-tel').value||null,
    fecha_desde: document.getElementById('fn-desde').value||null,
    fecha_hasta: fnIndefinido ? null : (document.getElementById('fn-hasta').value||null),
    indefinido: fnIndefinido,
    dias_semana: Array.from(fnDiasSeleccionados),
    tutor1_nombre: document.getElementById('fn-t1-nombre').value||null,
    tutor1_relacion: document.getElementById('fn-t1-relacion').value||null,
    tutor1_telefono: document.getElementById('fn-t1-tel').value||null,
    tutor2_nombre: document.getElementById('fn-t2-nombre').value||null,
    tutor2_relacion: document.getElementById('fn-t2-relacion').value||null,
    tutor2_telefono: document.getElementById('fn-t2-tel').value||null,
    alergias: document.getElementById('fn-alergias').value||null,
    condiciones_medicas: document.getElementById('fn-condiciones').value||null,
    medicacion: document.getElementById('fn-medicacion').value||null,
    observaciones: document.getElementById('fn-observaciones').value||null,
  };

  if (ninoActualId) {
    // Si cambió de grupo, lo actualizamos también
    const nuevoGrupo = document.getElementById('fn-grupo').value;
    if (nuevoGrupo) datos.grupo_id = nuevoGrupo;
    await sb.from('grupo_ninos').update(datos).eq('id',ninoActualId);
    toast(`${nombre} actualizado`);
  } else {
    await sb.from('grupo_ninos').insert({...datos, grupo_id:grupoActual, activo:true});
    toast(`${nombre} agregado al grupo`);
  }

  btn.textContent = ninoActualId ? 'Guardar cambios' : 'Agregar al grupo';
  btn.disabled = false;
  cerrarModal('modal-ficha-nino');
  await cargarNinosGrupo(grupoActual);
}

function cerrarModal(id) { closeModal(id); }

document.getElementById('fn-close').addEventListener('click',()=>closeModal('modal-ficha-nino'));

async function quitarNino(id) {
  await sb.from('grupo_ninos').update({activo:false}).eq('id',id);
  await cargarNinosGrupo(grupoActual);
}

// Programacion de sesiones
let sesTipo = 'hoy';
let sesDias = new Set();

// Generar botones de días al cargar
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('ses-dias-container');
  if (!container) return;
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach((d,i) => {
    const btn = document.createElement('button');
    btn.id = 'ses-dia-'+i;
    btn.textContent = d;
    btn.onclick = () => toggleSesDia(i);
    btn.style.cssText = 'width:38px;height:38px;border-radius:50%;border:1.5px solid var(--line);background:#fff;font-family:\'DM Sans\',sans-serif;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s';
    container.appendChild(btn);
  });
});

function setSesTopo(tipo) {
  sesTipo = tipo;
  document.getElementById('ses-tipo-hoy').style.background = tipo==='hoy' ? 'var(--navy)' : '#fff';
  document.getElementById('ses-tipo-hoy').style.color = tipo==='hoy' ? '#fff' : 'var(--muted)';
  document.getElementById('ses-tipo-rango').style.background = tipo==='rango' ? 'var(--navy)' : '#fff';
  document.getElementById('ses-tipo-rango').style.color = tipo==='rango' ? '#fff' : 'var(--muted)';
  document.getElementById('ses-rango-panel').style.display = tipo==='rango' ? 'block' : 'none';
}
window.setSesTopo = setSesTopo;

function toggleSesDia(idx) {
  const btn = document.getElementById('ses-dia-'+idx);
  if (sesDias.has(idx)) {
    sesDias.delete(idx);
    btn.style.background = '#fff';
    btn.style.color = 'var(--muted)';
    btn.style.borderColor = 'var(--line)';
  } else {
    sesDias.add(idx);
    btn.style.background = 'var(--navy)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--navy)';
  }
  actualizarPreviewSesiones();
}
window.toggleSesDia = toggleSesDia;

function actualizarPreviewSesiones() {
  const desde = document.getElementById('ses-desde').value;
  const hasta = document.getElementById('ses-hasta').value;
  const preview = document.getElementById('ses-preview');
  if (!desde || !hasta || sesDias.size === 0) {
    preview.textContent = 'Seleccioná los días y las fechas';
    return;
  }
  const fechas = generarFechasSesiones(desde, hasta);
  preview.textContent = `${fechas.length} sesión${fechas.length!==1?'es':''} a programar`;
}

function generarFechasSesiones(desde, hasta) {
  const fechas = [];
  // Los días en JS: 0=Dom, 1=Lun... Los nuestros: 0=Lu(1), 1=Ma(2), 2=Mi(3), 3=Ju(4), 4=Vi(5), 5=Sá(6), 6=Do(0)
  const mapDia = [1,2,3,4,5,6,0];
  const cur = new Date(desde+'T12:00:00');
  const fin = new Date(hasta+'T12:00:00');
  while (cur <= fin) {
    const diaSemana = cur.getDay();
    for (const idx of sesDias) {
      if (mapDia[idx] === diaSemana) {
        fechas.push(cur.toISOString().split('T')[0]);
        break;
      }
    }
    cur.setDate(cur.getDate()+1);
  }
  return fechas;
}

async function programarSesion() {
  if (!grupoActual) return;
  const hora = document.getElementById('ses-hora')?.value || '09:00';
  const dur  = parseFloat(document.getElementById('ses-dur')?.value || '2');
  const {data:grupo} = await sb.from('grupos').select('instructor_id').eq('id',grupoActual).single();

  let fechas = [];
  if (sesTipo === 'hoy') {
    fechas = [fechaISO];
  } else {
    const desde = document.getElementById('ses-desde').value;
    const hasta = document.getElementById('ses-hasta').value;
    if (!desde || !hasta) { toast('Seleccioná fecha desde y hasta','err'); return; }
    if (sesDias.size === 0) { toast('Seleccioná al menos un día de la semana','err'); return; }
    fechas = generarFechasSesiones(desde, hasta);
    if (fechas.length === 0) { toast('No hay días que coincidan en ese rango','err'); return; }
    if (fechas.length > 60) { toast('Máximo 60 sesiones por programación','err'); return; }
  }

  const btn = document.querySelector('#modal-detalle-grupo .btn-primary:last-child');
  if (btn) { btn.textContent = 'Programando...'; btn.disabled = true; }

  const sesiones = fechas.map(fecha => ({
    grupo_id: grupoActual,
    instructor_id: grupo?.instructor_id,
    fecha, hora_inicio: hora,
    duracion_horas: dur,
    estado: 'programada'
  }));

  const {error} = await sb.from('sesiones_escuelita').insert(sesiones);
  if (error) { toast('Error al programar sesiones','err'); if(btn){btn.textContent='Programar';btn.disabled=false;} return; }

  closeModal('modal-detalle-grupo');
  // Reset
  sesTipo='hoy'; sesDias=new Set();
  setSesTopo('hoy');
  [0,1,2,3,4,5,6].forEach(i=>{
    const b=document.getElementById('ses-dia-'+i);
    if(b){b.style.background='#fff';b.style.color='var(--muted)';b.style.borderColor='var(--line)';}
  });

  toast(fechas.length===1 ? `Sesión programada para las ${hora} hs` : `${fechas.length} sesiones programadas`);
  loadEscGruposHoy();
}

// ── CAMBIAR INSTRUCTOR DE UN GRUPO DE ESCUELITA ─────────
// Permite reasignar quién dicta las sesiones de un grupo, ya sea de forma
// permanente (de hoy en adelante) o solo para un rango puntual (ej. una
// semana de rotación entre instructores). sesiones_escuelita.instructor_id
// es independiente del instructor_id del grupo, así que cambiar sesiones
// puntuales no afecta las demás.
async function abrirCambiarInstructorGrupo() {
  if (!grupoActual) return;
  const {data:grupo} = await sb.from('grupos').select('nombre').eq('id',grupoActual).single();
  document.getElementById('mcig-grupo-nombre').textContent = grupo?.nombre ? `Grupo: ${grupo.nombre}` : '—';

  const sel = document.getElementById('mcig-instructor');
  sel.innerHTML = '<option value="">Seleccionar instructor...</option>';
  const {data:insts} = await sb.from('instructores').select('id,nombre').eq('activo',true).eq('escuelita',true).order('nombre');
  (insts||[]).forEach(i => { sel.innerHTML += `<option value="${i.id}">${i.nombre}</option>`; });

  document.getElementById('mcig-todas').checked = true;
  document.getElementById('mcig-rango-panel').style.display = 'none';
  document.getElementById('mcig-desde').value = fechaISO;
  document.getElementById('mcig-hasta').value = '';
  actualizarPreviewCambioInstructor();
  openModal('modal-cambiar-inst-grupo');
}
window.abrirCambiarInstructorGrupo = abrirCambiarInstructorGrupo;

document.querySelectorAll('input[name="mcig-alcance"]').forEach(r => r.addEventListener('change', () => {
  const esRango = document.getElementById('mcig-rango').checked;
  document.getElementById('mcig-rango-panel').style.display = esRango ? 'flex' : 'none';
  actualizarPreviewCambioInstructor();
}));
document.getElementById('mcig-desde')?.addEventListener('change', actualizarPreviewCambioInstructor);
document.getElementById('mcig-hasta')?.addEventListener('change', actualizarPreviewCambioInstructor);

async function actualizarPreviewCambioInstructor() {
  const prev = document.getElementById('mcig-preview');
  if (!grupoActual) return;
  const esRango = document.getElementById('mcig-rango').checked;
  let q = sb.from('sesiones_escuelita').select('id',{count:'exact',head:true}).eq('grupo_id',grupoActual).neq('estado','cancelada');
  if (esRango) {
    const desde = document.getElementById('mcig-desde').value;
    const hasta = document.getElementById('mcig-hasta').value;
    if (!desde || !hasta) { prev.textContent = 'Elegí el rango de fechas'; return; }
    q = q.gte('fecha',desde).lte('fecha',hasta);
  } else {
    q = q.gte('fecha',fechaISO);
  }
  const {count} = await q;
  prev.textContent = `${count||0} sesión${count===1?'':'es'} se va${count===1?'':'n'} a reasignar`;
}

document.getElementById('mcig-close').addEventListener('click', () => closeModal('modal-cambiar-inst-grupo'));

document.getElementById('mcig-confirmar').addEventListener('click', async () => {
  if (!grupoActual) return;
  const nuevoInstId = document.getElementById('mcig-instructor').value;
  if (!nuevoInstId) { toast('Seleccioná un instructor','err'); return; }
  const esRango = document.getElementById('mcig-rango').checked;

  const btn = document.getElementById('mcig-confirmar');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  let q = sb.from('sesiones_escuelita').update({instructor_id:nuevoInstId}).eq('grupo_id',grupoActual).neq('estado','cancelada');
  let desde, hasta;
  if (esRango) {
    desde = document.getElementById('mcig-desde').value;
    hasta = document.getElementById('mcig-hasta').value;
    if (!desde || !hasta) { toast('Elegí el rango de fechas','err'); btn.textContent='Confirmar cambio'; btn.disabled=false; return; }
    q = q.gte('fecha',desde).lte('fecha',hasta);
  } else {
    q = q.gte('fecha',fechaISO);
    // "De hoy en adelante" también actualiza el instructor por defecto del
    // grupo, para que las próximas sesiones que se programen ya salgan
    // asignadas a él sin tener que repetir el cambio cada vez.
    await sb.from('grupos').update({instructor_id:nuevoInstId}).eq('id',grupoActual);
  }

  const {error} = await q;
  btn.textContent = 'Confirmar cambio'; btn.disabled = false;
  if (error) { toast('Error al reasignar','err'); return; }

  audit('grupo_instructor_cambiado','grupos',grupoActual,{nuevo_instructor_id:nuevoInstId,alcance:esRango?`${desde} a ${hasta}`:'de hoy en adelante'});
  closeModal('modal-cambiar-inst-grupo');
  toast('Instructor reasignado ✓');
  const {data:grupoUpd} = await sb.from('grupos').select('nombre,instructor_id,instructores(nombre)').eq('id',grupoActual).single();
  document.getElementById('mdg-instructor').textContent = grupoUpd?.instructores?.nombre || '—';
  loadEscGruposHoy();
});

async function finalizarSesion(id) {
  if (!confirm('¿Finalizar esta sesión?')) return;
  await sb.from('sesiones_escuelita').update({estado:'completada'}).eq('id',id);
  toast('Sesión finalizada');
  loadEscSesiones();
}

async function cancelarSesion(id) {
  if (!confirm('¿Cancelar esta sesión?')) return;
  await sb.from('sesiones_escuelita').update({estado:'cancelada'}).eq('id',id);
  toast('Sesión cancelada');
  loadEscSesiones();
}

async function toggleGrupo(id, activo) {
  await sb.from('grupos').update({activo:!activo}).eq('id',id);
  toast(activo?'Grupo dado de baja':'Grupo reactivado');
  loadEscAdminGrupos();
}

async function eliminarGrupo(id, nombre) {
  if (!confirm(`¿Eliminar el grupo "${nombre}"? Se eliminarán también sus sesiones. Esta acción no se puede deshacer.`)) return;
  await sb.from('sesiones_escuelita').delete().eq('grupo_id',id);
  await sb.from('grupo_ninos').delete().eq('grupo_id',id);
  await sb.from('grupos').delete().eq('id',id);
  toast(`Grupo "${nombre}" eliminado`);
  loadEscAdminGrupos();
}
window.eliminarGrupo = eliminarGrupo;

// Modal nuevo grupo
document.getElementById('mng-close').addEventListener('click',()=>closeModal('modal-nuevo-grupo'));
document.getElementById('mng-cancel').addEventListener('click',()=>closeModal('modal-nuevo-grupo'));
document.getElementById('mdg-close').addEventListener('click',()=>closeModal('modal-detalle-grupo'));

async function abrirModalNuevoGrupo() {
  // Cargar instructores en el select
  const {data} = await sb.from('instructores').select('id,nombre').eq('activo',true).eq('escuelita',true).order('nombre');
  const sel = document.getElementById('ng-instructor');
  sel.innerHTML='<option value="">Seleccionar instructor...</option>';
  data?.forEach(i => { sel.innerHTML+=`<option value="${i.id}">${i.nombre}</option>`; });
  openModal('modal-nuevo-grupo');
}

document.getElementById('mng-save').addEventListener('click', async()=>{
  const nombre   = document.getElementById('ng-nombre').value.trim();
  const edadMin  = parseInt(document.getElementById('ng-edad-min').value);
  const edadMax  = parseInt(document.getElementById('ng-edad-max').value);
  const instId   = document.getElementById('ng-instructor').value;
  if (!nombre) { toast('Ingresá el nombre del grupo','err'); return; }
  if (!edadMin||!edadMax) { toast('Ingresá el rango de edades','err'); return; }

  const {data:temp} = await sb.from('temporadas').select('id').eq('activa',true).single();
  const {error} = await sb.from('grupos').insert({
    nombre, edad_min:edadMin, edad_max:edadMax,
    nivel: document.getElementById('ng-nivel').value,
    instructor_id:instId||null, activo:true,
    temporada_id:temp?.id||null
  });
  if (error) { toast('Error al crear el grupo','err'); return; }
  closeModal('modal-nuevo-grupo');
  toast(`Grupo "${nombre}" creado`);
  loadEscAdminGrupos();
});

// Exponer funciones globales de escuelita
window.setModo = setModo;
window.abrirDetalleGrupo = abrirDetalleGrupo;
window.abrirModalAgregarNino = abrirModalAgregarNino;
window.abrirFichaNino = abrirFichaNino;
window.guardarFichaNino = guardarFichaNino;
window.cerrarModal = cerrarModal;
window.quitarNino = quitarNino;
window.programarSesion = programarSesion;

// Listeners para preview de sesiones
document.addEventListener('change', e => {
  if (e.target.id === 'ses-desde' || e.target.id === 'ses-hasta') actualizarPreviewSesiones();
});
window.finalizarSesion = finalizarSesion;
window.cancelarSesion = cancelarSesion;
window.toggleGrupo = toggleGrupo;
window.abrirModalNuevoGrupo = abrirModalNuevoGrupo;
sb.from('temporadas').select('nombre,reinicio_total').eq('activa',true).single().then(({data}) => {
  if (!data) return;
  const statVals = document.querySelectorAll('.stat-val');
  statVals.forEach(el => {
    if (el.style.fontSize === '18px' || el.textContent === 'Calibración') {
      el.textContent = data.nombre;
      const sub = el.nextElementSibling;
      if (sub) sub.textContent = data.reinicio_total === false ? 'Puntajes continuados' : 'Ranking en formación';
    }
  });
});

document.getElementById('user-avatar').addEventListener('click', e => {
  e.stopPropagation();
  const menu = document.getElementById('profile-menu');
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open');
  if (window.innerWidth < 768) {
    if (opening) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.dataset.pmScrollY = scrollY;
    } else {
      const scrollY = document.body.dataset.pmScrollY || '0';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, parseInt(scrollY));
    }
  }
});
function closeProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (!menu.classList.contains('open')) return;
  menu.classList.remove('open');
  if (window.innerWidth < 768) {
    const scrollY = document.body.dataset.pmScrollY || '0';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, parseInt(scrollY));
  }
}
document.addEventListener('click', closeProfileMenu);
document.getElementById('profile-menu').addEventListener('click', e => e.stopPropagation());
document.getElementById('pm-logout').addEventListener('click', async() => {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    }
  } catch(e) {}
  await sb.auth.signOut(); localStorage.clear(); window.location.href='vertex_login.html';
});
document.getElementById('pm-perfil').addEventListener('click', () => {
  document.getElementById('profile-menu').classList.remove('open');
  const email = localStorage.getItem('vertex_email')||'';
  document.getElementById('mp2-email').value = email;
  document.getElementById('mp2-pass1').value = '';
  document.getElementById('mp2-pass2').value = '';
  openModal('modal-perfil');
});

document.getElementById('mp2-close').addEventListener('click', ()=>closeModal('modal-perfil'));
document.getElementById('mp2-cancel').addEventListener('click', ()=>closeModal('modal-perfil'));
document.getElementById('mp2-save').addEventListener('click', async() => {
  const pass1 = document.getElementById('mp2-pass1').value;
  const pass2 = document.getElementById('mp2-pass2').value;

  if (pass1 || pass2) {
    if (pass1.length < 6) { toast('La contraseña debe tener al menos 6 caracteres','err'); return; }
    if (pass1 !== pass2) { toast('Las contraseñas no coinciden','err'); return; }
    const {error} = await sb.auth.updateUser({ password: pass1 });
    if (error) { toast('Error al cambiar la contraseña','err'); return; }
  }

  closeModal('modal-perfil');
  toast('Perfil actualizado correctamente');
});

// Init
document.getElementById('fecha-hoy').textContent = hoy.toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
document.getElementById('cli-fecha').value = fechaISO;
document.getElementById('ma-fecha').valueAsDate = hoy;
document.getElementById('f-fecha-cl').value = fechaISO;
document.getElementById('ni-fecha').valueAsDate = hoy;
document.getElementById('f-mes').value = String(hoy.getMonth()+1);

let nivelCliente=null, instrSel=null, clasesHoy=[], fabOpen=false, corrBtn=null, nivelCert=null;

// Helpers
const pill = v => { const n=parseFloat(v); const c=isNaN(n)?'pill-mid':n>=7?'pill-ok':n>=5?'pill-mid':'pill-low'; return `<span class="pill ${c}">${v}</span>`; };
const badge = (t,c,b) => `<span style="font-size:11px;font-weight:500;color:${c};background:${b};padding:2px 9px;border-radius:20px">${t}</span>`;
const t2m = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const m2t = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
/* audit() → js/vertex_audit.js */

function calcEdad(fechaNac) {
  if (!fechaNac) return null;
  const hoy = new Date();
  const nac = new Date(fechaNac + 'T12:00:00');
  let edad = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}
function toast(msg,type='ok') {
  const t=document.createElement('div');
  t.style.cssText=`position:fixed;bottom:24px;right:24px;background:${type==='ok'?'#0F6E56':'#B91C1C'};color:white;padding:12px 18px;border-radius:8px;font-size:13px;z-index:999;font-family:'DM Sans',sans-serif`;
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2800);
}
let _panelScrollY = 0;
function openModal(id) {
  document.getElementById(id).classList.add('open');
  _panelScrollY = window.scrollY;
  document.body.style.top = `-${_panelScrollY}px`;
  document.documentElement.classList.add('modal-lock');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.documentElement.classList.remove('modal-lock');
  document.body.style.top = '';
  window.scrollTo(0, _panelScrollY);
}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);}));

// Sidebar navigation
const PAGES = ['asignacion','nueva-asignacion','ranking','clases','instructores','clientes','asistencia','resenas','reporte','esc-grupos','esc-sesiones','esc-admin-grupos','usuarios'];
const TITLES = {asignacion:'Inicio','nueva-asignacion':'Nueva asignación',ranking:'Ranking',clases:'Clases del día',instructores:'Instructores',clientes:'Clientes',asistencia:'Asistencia',resenas:'Reseñas',reporte:'Reporte mensual','esc-grupos':'Grupos de hoy','esc-sesiones':'Sesiones','esc-admin-grupos':'Grupos',usuarios:'Usuarios'};
const LOADERS = {asignacion:loadDashboardExtras,ranking:loadRanking,clases:loadClases,instructores:loadInstructores,clientes:loadClientes,asistencia:loadAsistencia,resenas:loadResenas,reporte:loadReporte,usuarios:loadUsuarios,'esc-familias':loadFamilias,'esc-asistencia':loadAsistEscNinos,'esc-inicio':loadEscInicio};

// Ocultar overlay inicial cuando el dashboard carga
// Tiempo mínimo de display para el overlay
const _overlayStart = Date.now();
function ocultarLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const elapsed = Date.now() - _overlayStart;
  const delay = Math.max(0, 800 - elapsed); // mínimo 800ms
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  }, delay);
}

function setPage(page, fromSidebarNav) {
  localStorage.setItem('vertex_page', page);
  const allPages = [...PAGES, ...PAGES_ESCUELITA];
  allPages.forEach(p => { const el=document.getElementById('pg-'+p); if(el) el.style.display=p===page?'block':'none'; });
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===page));
  document.getElementById('page-title').textContent = TITLES[page]||TITLES_ESC[page]||page;

  // Mostrar skeleton en el contenido de la sección
  const pgEl = document.getElementById('pg-'+page);
  if (pgEl && LOADERS[page]) {
    const tabla = pgEl.querySelector('#'+page.replace('-','_')+'-tabla, .page-table > div:last-child, #rep-contenido, #cli-tabla, #inst-tabla, #asist-tabla, #res-tabla, #ranking-tabla');
    if (tabla && !tabla.innerHTML.includes('Cargando')) {
      tabla.innerHTML = `<div style="padding:20px">
        ${[1,2,3,4].map(()=>`<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <div class="sk-block" style="height:14px;width:40%;border-radius:4px"></div>
          <div class="sk-block" style="height:14px;width:25%;border-radius:4px"></div>
          <div class="sk-block" style="height:14px;width:20%;border-radius:4px"></div>
        </div>`).join('')}
      </div>`;
    }
  }

  if (LOADERS[page]) LOADERS[page]();
  if (page==='esc-grupos')       loadEscGruposHoy();
  if (page==='esc-sesiones')     loadEscSesiones();
  if (page==='esc-admin-grupos') loadEscAdminGrupos();
  if (fromSidebarNav && window.innerWidth<768) toggleSidebar();
}
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>btn.addEventListener('click',()=>setPage(btn.dataset.page, true)));

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
  if (opening) {
    _panelScrollY = window.scrollY;
    document.body.style.top = `-${_panelScrollY}px`;
    document.documentElement.classList.add('modal-lock');
  } else {
    document.documentElement.classList.remove('modal-lock');
    document.body.style.top = '';
    window.scrollTo(0, _panelScrollY);
  }
}
document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
document.getElementById('overlay').addEventListener('click', toggleSidebar);

// Editar instructor
document.getElementById('mei-close').addEventListener('click',()=>closeModal('modal-edit-inst'));
document.getElementById('mei-cancel').addEventListener('click',()=>closeModal('modal-edit-inst'));
document.getElementById('mei-save').addEventListener('click', async()=>{
  const id=document.getElementById('mei-id').value;
  const nom=document.getElementById('mei-nom').value.trim();
  if (!nom) { toast('El nombre es obligatorio','err'); return; }
  const {error}=await sb.from('instructores').update({
    nombre: nom,
    telefono: document.getElementById('mei-tel').value,
    email: document.getElementById('mei-email').value,
    nivel_certificado: parseInt(document.getElementById('mei-nivel').value),
    idiomas: [...document.querySelectorAll('#mei-idiomas .tag-btn.active')].map(b=>b.dataset.val),
    escuelita: meiEscuelita,
    activo_cerro: meiCerro
  }).eq('id',id);
  if (error) { toast('Error al guardar','err'); return; }
  closeModal('modal-edit-inst');
  toast('Instructor actualizado');
  loadInstructores();
});

async function editarInstructor(id, nombre, nivel, telefono, email) {
  document.getElementById('mei-id').value = id;
  document.getElementById('mei-nom').value = nombre;
  document.getElementById('mei-tel').value = telefono;
  document.getElementById('mei-email').value = email;
  document.getElementById('mei-nivel').value = nivel;
  // Cargar escuelita e idiomas desde DB
  const {data} = await sb.from('instructores').select('escuelita, idiomas, activo_cerro').eq('id',id).single();
  meiEscuelita = !!data?.escuelita;
  meiCerro = data?.activo_cerro !== false;
  document.getElementById('mei-escuelita-toggle').style.background = meiEscuelita ? 'var(--accent)' : 'var(--line)';
  document.getElementById('mei-escuelita-knob').style.transform = meiEscuelita ? 'translateX(18px)' : 'translateX(0)';
  document.getElementById('mei-cerro-toggle').style.background = meiCerro ? 'var(--accent)' : 'var(--line)';
  document.getElementById('mei-cerro-knob').style.left = meiCerro ? '20px' : '2px';
  const idiomasActuales = data?.idiomas || [];
  document.querySelectorAll('#mei-idiomas .tag-btn').forEach(b => {
    b.classList.toggle('active', idiomasActuales.includes(b.dataset.val));
  });
  openModal('modal-edit-inst');
}

// ── BAJAS TEMPORALES ────────────────────────────────────────
let instBajaTempId = null;

async function abrirBajaTemporal(instId, instNombre) {
  instBajaTempId = instId;
  document.getElementById('bt-nombre').textContent = instNombre;
  document.getElementById('bt-inicio').value = new Date().toISOString().split('T')[0];
  document.getElementById('bt-fin').value = '';

  // Mostrar bajas activas de este instructor
  const {data:bajas} = await sb.from('bajas_temporales')
    .select('*').eq('instructor_id', instId).order('fecha_inicio', {ascending:false}).limit(5);

  const cont = document.getElementById('bt-bajas-activas');
  if (bajas?.length) {
    cont.innerHTML = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--silver);margin-bottom:6px">Bajas registradas</div>
      ${bajas.map(b=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--ice);border-radius:6px;margin-bottom:4px;font-size:12px">
          <div>
            <span style="font-weight:500">${b.motivo||'—'}</span>
            <span style="color:var(--muted);margin-left:8px">${b.fecha_inicio} → ${b.fecha_fin||'en curso'}</span>
          </div>
          ${!b.fecha_fin ? `<button onclick="cerrarBajaTemporal('${b.id}')" style="font-size:11px;padding:2px 8px;border:1px solid var(--accent);background:none;color:var(--accent);border-radius:4px;cursor:pointer">Dar de alta</button>` : ''}
        </div>`).join('')}`;
  } else {
    cont.innerHTML = '';
  }

  openModal('modal-baja-temporal');
}
window.abrirBajaTemporal = abrirBajaTemporal;

async function guardarBajaTemporal() {
  const inicio = document.getElementById('bt-inicio').value;
  const fin    = document.getElementById('bt-fin').value;
  const motivo = document.getElementById('bt-motivo').value;
  if (!inicio) { toast('Ingresá la fecha de inicio','err'); return; }

  const {error} = await sb.from('bajas_temporales').insert({
    instructor_id: instBajaTempId, fecha_inicio: inicio,
    fecha_fin: fin || null, motivo
  });
  if (error) { toast('Error al registrar','err'); return; }
  audit('baja_temporal_registrada','bajas_temporales', instBajaTempId, {inicio, fin, motivo});
  toast('Baja temporal registrada ✓');
  closeModal('modal-baja-temporal');
}
window.guardarBajaTemporal = guardarBajaTemporal;

async function cerrarBajaTemporal(bajaId) {
  const hoy = new Date().toISOString().split('T')[0];
  const {error} = await sb.from('bajas_temporales').update({fecha_fin: hoy}).eq('id', bajaId);
  if (error) { toast('Error al actualizar','err'); return; }
  toast('Alta registrada ✓');
  abrirBajaTemporal(instBajaTempId, document.getElementById('bt-nombre').textContent);
}
window.cerrarBajaTemporal = cerrarBajaTemporal;

// Función helper para calcular días de baja en un rango
async function calcDiasBaja(instId, desde, hasta) {
  const {data:bajas} = await sb.from('bajas_temporales')
    .select('fecha_inicio, fecha_fin')
    .eq('instructor_id', instId)
    .lte('fecha_inicio', hasta)
    .or(`fecha_fin.gte.${desde},fecha_fin.is.null`);

  let diasBaja = 0;
  const desdeD = new Date(desde);
  const hastaD = new Date(hasta);

  (bajas||[]).forEach(b => {
    const bInicio = new Date(Math.max(new Date(b.fecha_inicio), desdeD));
    const bFin    = new Date(Math.min(b.fecha_fin ? new Date(b.fecha_fin) : hastaD, hastaD));
    if (bFin >= bInicio) diasBaja += Math.round((bFin - bInicio) / 86400000) + 1;
  });

  return diasBaja;
}
window.calcDiasBaja = calcDiasBaja;

async function enviarPushInstructor(instructorId, title, body) {
  try {
    await sb.functions.invoke('send-push', {
      body: { instructor_id: instructorId, title, body }
    });
  } catch(e) {
    console.warn('Push notification error:', e);
  }
}

// ── CARGA MASIVA ────────────────────────────────────────────
let cmDatos = [];

window.abrirCargaMasiva = function() {
  cmDatos = [];
  document.getElementById('cm-filename').textContent = 'Hacé click o arrastrá el archivo aquí';
  document.getElementById('cm-preview').style.display = 'none';
  document.getElementById('cm-resultado').style.display = 'none';
  document.getElementById('cm-btn-importar').style.display = 'none';
  document.getElementById('cm-archivo').value = '';
  openModal('modal-carga-masiva');
};

window.descargarModeloExcel = function() {
  window.location.href = '/VERTEX_Instructores_Modelo.xlsx';
};

window.onArchivoSeleccionado = function(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('cm-filename').textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const XLSX = window.XLSX;
    const wb = XLSX.read(e.target.result, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

    // Saltar: título(0), subtítulo(1), vacía(2), encabezados(3), hints(4) — datos desde fila 6 (índice 5)
    const filas = data.slice(5).filter(row => row[0] && String(row[0]).trim() && !String(row[0]).startsWith('→'));
    
    if (!filas.length) {
      toast('No se encontraron datos en el archivo','err');
      return;
    }

    cmDatos = filas.map(row => ({
      nombre:              String(row[0]||'').trim(),
      dni:                 String(row[1]||'').replace(/\D/g,'').trim()||null,
      telefono:            String(row[2]||'').trim(),
      nivel:               parseInt(row[3])||1,
      temporadas_en_cerro: parseInt(row[4])||0,
      disciplinas:         String(row[5]||'').split(',').map(d=>d.trim()).filter(Boolean),
      idiomas:             String(row[6]||'').split(',').map(d=>d.trim()).filter(Boolean),
      escuelita:           String(row[7]||'').toUpperCase() === 'SI',
      fecha_nacimiento:    String(row[8]||'').trim()||null,
    })).filter(r => r.nombre && r.disciplinas.length);

    // Preview
    const tabla = document.getElementById('cm-preview-tabla');
    tabla.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:var(--navy);color:#fff">
          <th style="padding:8px 10px;text-align:left">Nombre</th>
          <th style="padding:8px 10px;text-align:center">DNI</th>
          <th style="padding:8px 10px;text-align:center">Niv.</th>
          <th style="padding:8px 10px;text-align:left">Disciplinas</th>
          <th style="padding:8px 10px;text-align:center">Escuelita</th>
        </tr>
        ${cmDatos.map((r,i)=>`
          <tr style="background:${i%2===0?'#fff':'var(--ice)'}">
            <td style="padding:7px 10px;font-weight:500">${r.nombre}</td>
            <td style="padding:7px 10px;text-align:center;font-size:11px;color:var(--muted)">${r.dni||'—'}</td>
            <td style="padding:7px 10px;text-align:center">${r.nivel}</td>
            <td style="padding:7px 10px;font-size:11px;color:var(--muted)">${r.disciplinas.join(', ')}</td>
            <td style="padding:7px 10px;text-align:center">${r.escuelita?'✓':''}</td>
          </tr>`).join('')}
      </table>`;
    
    document.getElementById('cm-preview-msg').textContent = `${cmDatos.length} instructor${cmDatos.length>1?'es':''} encontrado${cmDatos.length>1?'s':''}.`;
    document.getElementById('cm-preview').style.display = '';
    document.getElementById('cm-btn-importar').style.display = '';
    document.getElementById('cm-resultado').style.display = 'none';
  };
  reader.readAsArrayBuffer(file);
};

window.importarInstructores = async function() {
  const btn = document.getElementById('cm-btn-importar');
  btn.textContent = 'Importando...'; btn.disabled = true;

  const resultado = document.getElementById('cm-resultado');
  const importados = [];
  const errores = [];

  for (const inst of cmDatos) {
    try {
      // Parsear fecha si viene en DD/MM/AAAA
      const parseDate = (s) => {
        if (!s) return null;
        const parts = s.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        return null;
      };

      // Crear instructor
      // Verificar duplicado por DNI
      if (inst.dni) {
        const {data:existe} = await sb.from('instructores').select('id,nombre').eq('dni',inst.dni).maybeSingle();
        if (existe) { errores.push(`${inst.nombre}: DNI ${inst.dni} ya existe (${existe.nombre})`); continue; }
      }

      const {data:instData, error} = await sb.from('instructores').insert({
        nombre: inst.nombre,
        dni: inst.dni||null,
        telefono: inst.telefono||null,
        nivel_certificado: inst.nivel,
        temporadas_en_cerro: inst.temporadas_en_cerro||0,
        activo: true,
        escuelita: inst.escuelita,
        idiomas: inst.idiomas,
        fecha_ingreso: new Date().toISOString().split('T')[0],
        fecha_nacimiento: parseDate(inst.fecha_nacimiento),
      }).select('id').single();

      if (error) { errores.push(`${inst.nombre}: ${error.message}`); continue; }

      // Crear preferencias
      const prefs = [];
      inst.disciplinas.forEach(d => {
        ['adultos','ninos','adolescentes'].forEach(r => {
          prefs.push({instructor_id:instData.id, disciplina:d, nivel_min:1, nivel_max:inst.nivel, rango_etario:r});
        });
      });
      if (prefs.length) await sb.from('instructor_preferencias').insert(prefs);

      // Generar código de invitación
      const codigo = 'VTX-' + Math.random().toString(36).substring(2,6).toUpperCase() + '-' + Math.random().toString(36).substring(2,6).toUpperCase();
      await sb.from('invitaciones').insert({instructor_id: instData.id, codigo});

      // Puntaje base — mismo criterio que el alta manual, para que no arranque en "0"
      await asignarPuntajeBase(instData.id);

      importados.push({nombre: inst.nombre, codigo, id: instData.id});
      audit('instructor_creado','instructores',instData.id,{nombre:inst.nombre,via:'carga_masiva'});

    } catch(e) { errores.push(`${inst.nombre}: error inesperado`); }
  }

  // Mostrar resultado
  resultado.style.display = '';
  if (importados.length) {
    resultado.style.background = '#ECFDF5';
    resultado.style.border = '1px solid #6EE7B7';
    resultado.innerHTML = `<div style="font-weight:600;color:#065F46;margin-bottom:4px">✓ ${importados.length} instructor${importados.length>1?'es':''} importado${importados.length>1?'s':''} correctamente</div>
      ${errores.length?`<div style="color:var(--danger);font-size:12px;margin-top:4px">⚠ ${errores.length} con error: ${errores.join(', ')}</div>`:''}
      <button onclick="generarPDFInvitaciones(window._importados)" style="margin-top:10px;padding:8px 16px;background:#0F6E56;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">
        📄 Descargar PDF de invitaciones
      </button>`;
    window._importados = importados;
    loadInstructores();
  } else {
    resultado.style.background = '#FEF2F2';
    resultado.style.border = '1px solid #FECACA';
    resultado.innerHTML = `<div style="color:var(--danger)">No se pudo importar ningún instructor. ${errores.join(', ')}</div>`;
  }

  btn.textContent = 'Importar y generar invitaciones'; btn.disabled = false;
};

window.generarPDFInvitaciones = async function(importados) {
  const APP_URL = window.location.origin;
  const urls = importados.map(i => `${APP_URL}/vertex_activar.html?codigo=${i.codigo}`);
  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>VERTEX — Invitaciones</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:20px;background:#fff}
  .header{text-align:center;margin-bottom:24px;padding-bottom:14px;border-bottom:2px solid #1A1F2E}
  .header h1{font-size:28px;font-weight:700;color:#1A1F2E;letter-spacing:2px}
  .header p{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .card{border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;page-break-inside:avoid;display:flex;gap:12px;align-items:center}
  .card-left{flex:1}
  .card-name{font-size:15px;font-weight:700;color:#1A1F2E}
  .card-role{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;margin-bottom:10px}
  .code-box{background:#F0F4F8;border-radius:6px;padding:8px 10px;margin-bottom:8px}
  .code-label{font-size:9px;color:#6B7280;margin-bottom:3px}
  .code{font-size:17px;font-weight:700;color:#1D9E75;letter-spacing:2px}
  .url{font-size:8px;color:#1D9E75;word-break:break-all}
  .note{font-size:8px;color:#9CA3AF;margin-top:6px}
  .qr-wrap{flex-shrink:0}
  @media print{@page{margin:10mm}}
</style>
</head><body>
<div class="header"><h1>VERTEX</h1>
  <p>Cerro Bayo — Villa La Angostura · Códigos de activación · Temporada 2026</p>
</div>
<div class="grid">
${importados.map((inst,idx)=>`
  <div class="card">
    <div class="card-left">
      <div class="card-name">${inst.nombre}</div>
      <div class="card-role">Instructor · Temporada 2026</div>
      <div class="code-box">
        <div class="code-label">CÓDIGO DE ACTIVACIÓN</div>
        <div class="code">${inst.codigo}</div>
      </div>
      <div class="url">${APP_URL}/vertex_activar.html?codigo=${inst.codigo}</div>
      <div class="note">Escaneá el QR o tocá el link para activar tu cuenta</div>
    </div>
    <div class="qr-wrap" id="qr-${idx}"></div>
  </div>`).join('')}
</div>
<scr` + `ipt>
const _urls = ${JSON.stringify(urls)};
window.onload = function() {
  _urls.forEach(function(url, i) {
    new QRCode(document.getElementById('qr-' + i), {
      text: url, width:90, height:90,
      colorDark:'#1A1F2E', colorLight:'#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  });
  setTimeout(function(){ window.print(); }, 1000);
};
<\/script>
</body></html>`;
  const win = window.open('', '_blank');
  win.document.write(htmlContent);
  win.document.close();
  toast('Invitaciones listas para imprimir ✓');
}
window.generarPDFInvitaciones = generarPDFInvitaciones;

window.reenviarInvitacion = function(instId, nombre, codigo) {
  const APP_URL = window.location.origin;
  const activarURL = `${APP_URL}/vertex_activar.html?codigo=${codigo}`;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invitación — ${nombre}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F0F4F8}
.card{background:#fff;border-radius:16px;padding:32px;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}
h1{font-size:28px;font-weight:700;color:#1A1F2E;letter-spacing:2px;margin-bottom:4px}
p{font-size:12px;color:#6B7280;margin-bottom:20px}
.name{font-size:18px;font-weight:600;color:#1A1F2E;margin-bottom:16px}
.code-box{background:#F0F4F8;border-radius:10px;padding:14px;margin-bottom:14px}
.code-label{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.code{font-size:26px;font-weight:700;color:#1D9E75;letter-spacing:4px}
#qr{display:flex;justify-content:center;margin:12px 0}
#qr img{border-radius:8px}
.link{font-size:11px;color:#1A1F2E;font-weight:600;word-break:break-all;margin-bottom:4px}
.note{font-size:10px;color:#9CA3AF}
@media print{@page{margin:10mm}}</style></head>
<body><div class="card">
<h1>VERTEX</h1><p>Cerro Bayo · Temporada 2026</p>
<div class="name">${nombre}</div>
<div class="code-box">
  <div class="code-label">Código de activación</div>
  <div class="code">${codigo}</div>
</div>
<div id="qr"></div>
<div class="link"><a href="${activarURL}" style="color:#1D9E75">${activarURL}</a></div>
<div class="note">Escaneá el QR o hacé click en el link para activar tu cuenta</div>
</div>
<scr` + `ipt>
new QRCode(document.getElementById('qr'), {
  text: '${activarURL}',
  width: 140, height: 140,
  colorDark:'#1A1F2E', colorLight:'#ffffff',
  correctLevel: QRCode.CorrectLevel.M
});
window.onload = () => setTimeout(() => {}, 800);
<\/script></body></html>`);
  win.document.close();
};

async function toggleActivoInstructor(id, activo) {
  const nuevoEstado = !activo;
  const msg = nuevoEstado ? '¿Reactivar este instructor?' : '¿Dar de baja este instructor? No se perderá su historial.';
  if (!confirm(msg)) return;
  const {error}=await sb.from('instructores').update({activo: nuevoEstado}).eq('id',id);
  if (error) { toast('Error al actualizar','err'); return; }
  audit(nuevoEstado?'instructor_reactivado':'instructor_baja','instructores',id,{activo:nuevoEstado});
  toast(nuevoEstado ? 'Instructor reactivado' : 'Instructor dado de baja');
  loadInstructores();
}

// Nivel cliente
document.querySelectorAll('.nivel-btn[data-nivel]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.nivel-btn[data-nivel]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); nivelCliente=btn.dataset.nivel;
}));

// Hora fin auto
function updateHoraFin() {
  const hora=document.getElementById('cli-hora').value;
  const dur=parseFloat(document.getElementById('cli-dur').value)||1;
  if (!hora) { document.getElementById('cli-horafin').value=''; return; }
  const fin=m2t(t2m(hora)+dur*60);
  document.getElementById('cli-horafin').value=fin;
  const av=document.getElementById('aviso-franja');
  av.style.display='block'; av.textContent=`Franja: ${hora} — ${fin}`;
  updateDisp(hora,fin);
}
document.getElementById('cli-hora').addEventListener('change',updateHoraFin);
document.getElementById('cli-dur').addEventListener('change',updateHoraFin);

function updateDisp(ini,fin) {
  if (!ini||!fin) return;
  const im=t2m(ini), fm=t2m(fin);
  document.querySelectorAll('.rk-row').forEach(row=>{
    const cls=clasesHoy.filter(c=>c.instructor_id===row.dataset.instid);
    let st='ok';
    for (const c of cls) {
      const ci=t2m(c.hora_inicio?.slice(0,5)||'00:00'), cf=t2m(c.hora_fin?.slice(0,5)||'00:00');
      if (im<cf&&fm>ci) { st='busy'; break; }
      if (cf>im-30&&cf<=im) st='soon';
    }
    const el=row.querySelector('.disp-st');
    if (el) {
      if (st==='busy') { el.textContent='Ocupado'; el.className='disp-st disp-busy'; row.classList.add('ocupado'); }
      else if (st==='soon') { el.textContent='Por terminar'; el.className='disp-st disp-soon'; row.classList.remove('ocupado'); }
      else { el.textContent='Disponible'; el.className='disp-st disp-ok'; row.classList.remove('ocupado'); }
    }
  });
}

// Buscar instructores
document.getElementById('btn-buscar').addEventListener('click', async()=>{
  const disc=document.getElementById('cli-disc').value;
  const idiomaCliente=document.getElementById('cli-idioma')?.value||'';
  const lista=document.getElementById('rk-lista');
  lista.innerHTML='<div style="padding:16px 0;text-align:center;color:var(--silver);font-size:13px">Buscando...</div>';
  await cargarRankingCfg();
  const {data:insts}=await sb.from('instructores').select('*, ranking_snapshot(*), instructor_preferencias(*)').eq('activo',true);
  if (!insts?.length) { lista.innerHTML='<div style="padding:16px 0;text-align:center;color:var(--silver);font-size:13px">No hay instructores</div>'; return; }
  // Convertir nivel texto a número para comparar con nivel_max
  const nivelNum = {principiante:1, intermedio:2, avanzado:3};
  const nivelReq = nivelNum[nivelCliente] || 0;
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let filtrados=insts.filter(i=>{
    if (emergenciaActiva) return true;
    const prefs = i.instructor_preferencias||[];
    if (!prefs.length) return false;
    return prefs.some(p => {
      const discOk = !disc || norm(p.disciplina) === norm(disc);
      const nivelOk = !nivelReq || (p.nivel_max||5) >= nivelReq;
      return discOk && nivelOk;
    });
  });
  filtrados.sort((a,b)=>{
    if (idiomaCliente) {
      const aHabla = (a.idiomas||[]).includes(idiomaCliente);
      const bHabla = (b.idiomas||[]).includes(idiomaCliente);
      if (aHabla && !bHabla) return -1;
      if (!aHabla && bHabla) return 1;
    }
    // Instructores sin puntaje calculado (recién ingresados) nunca se sugieren
    // como "mejor opción" por encima de uno con historial real.
    const scoreA = calcularPuntajeEfectivo(a.ranking_snapshot?.[a.ranking_snapshot.length-1]);
    const scoreB = calcularPuntajeEfectivo(b.ranking_snapshot?.[b.ranking_snapshot.length-1]);
    const tieneA = scoreA != null, tieneB = scoreB != null;
    if (tieneA !== tieneB) return tieneA ? -1 : 1;
    if (!tieneA && !tieneB) return a.nombre.localeCompare(b.nombre, 'es');
    return scoreB - scoreA;
  });
  lista.innerHTML=filtrados.map((inst,i)=>{
    const s=inst.ranking_snapshot?.[inst.ranking_snapshot.length-1];
    const totalEf=calcularPuntajeEfectivo(s);
    const total=totalEf!=null?totalEf.toFixed(1):'—';
    const asist=s?.puntaje_asistencia?.toFixed(1)||'—';
    const discs=[...new Set((inst.instructor_preferencias||[]).map(p=>p.disciplina))].join(', ')||'—';
    const idiomasInst = (inst.idiomas||[]).filter(l=>l).join(', ');
    const hablaIdioma = idiomaCliente && (inst.idiomas||[]).includes(idiomaCliente);
    const fueraDePerfil = emergenciaActiva && (inst.instructor_preferencias||[]).length > 0 && !(inst.instructor_preferencias||[]).some(p => {
      const discOk = !disc || norm(p.disciplina) === norm(disc);
      const nivelOk = !nivelReq || (p.nivel_max||5) >= nivelReq;
      return discOk && nivelOk;
    });
    return `<div class="rk-row" data-instid="${inst.id}" data-nom="${inst.nombre}" data-sc="${total}" data-meta="Niv.${inst.nivel_certificado} · ${discs}">
      <div class="rk-num ${i<3?'top':''}">${i+1}</div>
      <div>
        <div class="inst-name">${inst.nombre}
          ${hablaIdioma?`<span style="font-size:10px;background:#E1F5EE;color:#0F6E56;padding:1px 6px;border-radius:10px;font-weight:500;margin-left:4px">🗣 ${idiomaCliente}</span>`:''}
          ${fueraDePerfil?`<span style="font-size:10px;color:var(--warn);font-weight:500"> ⚠ fuera de perfil</span>`:''}</div>
        <div class="inst-meta">Niv.${inst.nivel_certificado} · ${discs}${idiomasInst?` · ${idiomasInst}`:''}</div>
      </div>
      <div style="text-align:center">${pill(total)}</div>
      <div style="text-align:center">${pill(asist)}</div>
      <div style="text-align:center"><span class="disp-st disp-ok">Disponible</span></div>
    </div>`;
  }).join('');
  document.querySelectorAll('.rk-row').forEach(row=>row.addEventListener('click',()=>{
    if (row.classList.contains('ocupado')) return;
    instrSel={id:row.dataset.instid,nombre:row.dataset.nom,score:row.dataset.sc,meta:row.dataset.meta};
    openModalAsignar(instrSel);
  }));
  const hora=document.getElementById('cli-hora').value, fin=document.getElementById('cli-horafin').value;
  if (hora&&fin) updateDisp(hora,fin);
});

document.getElementById('mc-close').addEventListener('click',()=>closeModal('modal-cliente'));
document.getElementById('mc-no').addEventListener('click',()=>closeModal('modal-cliente'));
document.getElementById('mc-si').addEventListener('click',()=>closeModal('modal-cliente'));

// Modal asignar
function openModalAsignar(inst) {
  const ini=inst.nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('ma-av').textContent=ini;
  document.getElementById('ma-nom').textContent=inst.nombre;
  document.getElementById('ma-meta').textContent=inst.meta||'';
  document.getElementById('ma-sc').textContent=inst.score||'—';
  const hora=document.getElementById('cli-hora').value, fin=document.getElementById('cli-horafin').value;
  document.getElementById('ma-horario').textContent=hora&&fin?`${hora} — ${fin}`:'—';
  openModal('modal-asignar');
}
function toggleRequerida(force) {
  const cb = document.getElementById('ma-requerida');
  cb.checked = force !== undefined ? force : !cb.checked;
}
window.toggleRequerida = toggleRequerida;

document.getElementById('ma-close').addEventListener('click',()=>{ closeModal('modal-asignar'); toggleRequerida(false); document.getElementById('ma-punto').value=''; });
document.getElementById('ma-cancel').addEventListener('click',()=>{ closeModal('modal-asignar'); toggleRequerida(false); document.getElementById('ma-punto').value=''; });
document.getElementById('ma-confirm').addEventListener('click', async()=>{
  if (!instrSel) return;
  const nom=document.getElementById('cli-nombre').value.trim();
  const disc=document.getElementById('cli-disc').value;
  const hora=document.getElementById('cli-hora').value;
  const dur=parseFloat(document.getElementById('cli-dur').value)||1;
  const fechaRaw = document.getElementById('ma-fecha').value || fechaISO;

  // Validar campos obligatorios
  if (!nom) { closeModal('modal-asignar'); toast('Ingresá el nombre del cliente','err'); return; }
  if (!disc) { closeModal('modal-asignar'); toast('Seleccioná una disciplina','err'); return; }
  if (!nivelCliente) { closeModal('modal-asignar'); toast('Seleccioná el nivel del cliente','err'); return; }
  if (!hora) { closeModal('modal-asignar'); toast('Seleccioná la hora de inicio','err'); return; }

  // Asegurar formato YYYY-MM-DD
  let fecha = fechaRaw;
  if (fechaRaw.includes('/')) {
    const [d,m,y] = fechaRaw.split('/');
    fecha = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  const btn = document.getElementById('ma-confirm');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  let cliId=null;
  const {data:ce}=await sb.from('clientes').select('id').ilike('nombre',nom).limit(1);
  if (ce?.length) { cliId=ce[0].id; }
  else {
    const {data:nc,error:eCli}=await sb.from('clientes').insert({nombre:nom,disciplina:disc,nivel_validado:nivelCliente}).select('id').single();
    if (eCli) { toast('Error al guardar el cliente','err'); btn.textContent='Confirmar asignación'; btn.disabled=false; return; }
    cliId=nc?.id;
  }

  const {data:claseNueva, error:eCl}=await sb.from('clases').insert({instructor_id:instrSel.id,cliente_id:cliId,fecha,disciplina:disc,nivel:nivelCliente,hora_inicio:hora,duracion_horas:dur,estado:'asignada',tipo_clase:document.getElementById('ma-requerida')?.checked?'requerida':'asignada',punto_encuentro:document.getElementById('ma-punto').value.trim()||null}).select('id').single();
  if (eCl) { toast('Error al guardar la clase: '+eCl.message,'err'); btn.textContent='Confirmar asignación'; btn.disabled=false; return; }
  audit('clase_asignada','clases',claseNueva?.id,{instructor:instrSel.nombre,cliente:nom,fecha,hora,disciplina:disc,nivel:nivelCliente});
  // Enviar push al instructor
  const hoyISO = new Date().toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});
  const mananaISO = new Date(new Date().setDate(new Date().getDate()+1)).toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});
  const cuandoStr = fecha === hoyISO ? 'hoy' : fecha === mananaISO ? 'mañana' : new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  const punto = document.getElementById('ma-punto').value.trim();
  const bodyMsg = `${disc} · ${nivelCliente} · ${hora} hs (${cuandoStr})${punto?' · 📍 '+punto:''}`;
  enviarPushInstructor(instrSel.id, '📅 Nueva clase asignada', bodyMsg);

  closeModal('modal-asignar');
  btn.textContent='Confirmar asignación'; btn.disabled=false;
  toast('Clase asignada correctamente');
  initClasesHoy(); initInstStats();
});

// Emergencia
document.getElementById('btn-emerg').addEventListener('click',()=>{ document.getElementById('emerg-banner').style.display='flex'; emergenciaActiva=true; });
document.getElementById('btn-desact-emerg').addEventListener('click',()=>{ document.getElementById('emerg-banner').style.display='none'; emergenciaActiva=false; });
let emergenciaActiva = false;

// FAB
document.getElementById('fab-btn').addEventListener('click',()=>{
  fabOpen=!fabOpen;
  document.getElementById('fab-menu').classList.toggle('open',fabOpen);
  document.getElementById('fab-btn').classList.toggle('open',fabOpen);
  document.getElementById('fab-plus').style.display=fabOpen?'none':'block';
  document.getElementById('fab-x').style.display=fabOpen?'block':'none';
});
const closeFab=()=>{ fabOpen=false; document.getElementById('fab-menu').classList.remove('open'); document.getElementById('fab-btn').classList.remove('open'); document.getElementById('fab-plus').style.display='block'; document.getElementById('fab-x').style.display='none'; };
window.closeFab = closeFab;
document.getElementById('fab-nuevo').addEventListener('click',()=>{ closeFab(); openModal('modal-inst'); });
document.getElementById('fab-clase').addEventListener('click',()=>{ closeFab(); setPage('nueva-asignacion'); if(typeof resetTipoCliente==='function') resetTipoCliente(); });
document.getElementById('fab-rk').addEventListener('click',()=>{ closeFab(); setPage('ranking'); });
document.getElementById('fab-asist').addEventListener('click',()=>{ closeFab(); setPage('asistencia'); });

// Presencia modal
document.getElementById('mp-close').addEventListener('click',()=>closeModal('modal-presencia'));
document.getElementById('mp-presente').addEventListener('click',()=>{ applyCorr('presente'); });
document.getElementById('mp-ausente').addEventListener('click',()=>{ applyCorr('ausente'); });
document.getElementById('mp-franco').addEventListener('click',()=>{ applyCorr('franco'); });
let corrInstId = null;
function openCorr(instId, nom, btn, estadoActual) {
  corrBtn=btn; corrInstId=instId;
  document.getElementById('mp-nom').textContent=nom;
  document.getElementById('mp-opt-presente').style.display = estadoActual==='presente' ? 'none' : 'block';
  document.getElementById('mp-opt-ausente').style.display = estadoActual==='ausente' ? 'none' : 'block';
  document.getElementById('mp-opt-franco').style.display = estadoActual==='franco' ? 'none' : 'block';
  openModal('modal-presencia');
}
async function applyCorr(st) {
  closeModal('modal-presencia');
  if (!corrInstId) return;
  const hoyAR = new Date().toLocaleString('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).split(' ')[0];
  await sb.from('asistencia').delete().eq('instructor_id',corrInstId).gte('registrado_en',hoyAR+'T00:00:00').lte('registrado_en',hoyAR+'T23:59:59');
  await sb.from('asistencia').insert({
    instructor_id: corrInstId,
    clase_id: null,
    tipo: st,
    registrado_en: new Date().toLocaleString('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).replace(' ','T')
  });
  audit('presencia_marcada','asistencia',corrInstId,{tipo:st,fecha:hoyAR});
  const msgs = {presente:'Presente marcado ✓', ausente:'Ausente marcado', franco:'Franco registrado ☀'};
  toast(msgs[st]||'Presencia actualizada');
  corrBtn=null; corrInstId=null;
  initPresencia();
}

// Nuevo instructor
function abrirNuevoInstructorDesdeEscuelita() {
  setPage('instructores');
  setTimeout(() => {
    document.getElementById('fab-nuevo').click();
    // Activar Escuelita y desactivar Cerro por defecto
    setTimeout(() => {
      if (!niEscuelita) toggleEscuelita();
      if (niCerro) toggleCerro();
      // Preguntar si también habilita para cerro — toast informativo
      toast('Escuelita activada. Habilitá Escuela si también da clases individuales.');
    }, 300);
  }, 100);
}
window.abrirNuevoInstructorDesdeEscuelita = abrirNuevoInstructorDesdeEscuelita;
document.getElementById('mi-close').addEventListener('click',()=>closeModal('modal-inst'));
function irPaso(n) {
  [1,2,3,4].forEach(i=>{
    document.getElementById(`inst-p${i}`).style.display=i===n?'block':'none';
    document.querySelector(`.paso-tab[data-paso="${i}"]`)?.classList.toggle('active',i===n);
  });
}
document.getElementById('p1-next').addEventListener('click', async ()=>{
  const nom=document.getElementById('ni-nom').value.trim();
  const email=document.getElementById('ni-email').value.trim();
  const pass=document.getElementById('ni-pass').value;
  const dni=document.getElementById('ni-dni').value.replace(/\D/g,'');
  if (!nom) { toast('Ingresá el nombre','err'); return; }
  if (!email) { toast('Ingresá el email','err'); return; }
  if (!pass || pass.length<6) { toast('La contraseña debe tener al menos 6 caracteres','err'); return; }
  if (dni) {
    const {data:existe} = await sb.from('instructores').select('nombre').eq('dni',dni).maybeSingle();
    if (existe) { toast(`El DNI ya está registrado (${existe.nombre})`,'err'); return; }
  }
  irPaso(2);
});
document.getElementById('p2-back').addEventListener('click',()=>irPaso(1));
document.getElementById('p3-back').addEventListener('click',()=>irPaso(2));
document.getElementById('p2-next').addEventListener('click',()=>irPaso(3));
document.getElementById('p3-next').addEventListener('click',()=>{ mostrarConfirmacion(); irPaso(4); });
document.getElementById('p4-back').addEventListener('click',()=>irPaso(3));
// Toggle escuelita — nuevo instructor
let niEscuelita = false;
let niCerro = true;

function toggleCerro() {
  niCerro = !niCerro;
  document.getElementById('ni-cerro-toggle').style.background = niCerro ? 'var(--accent)' : 'var(--line)';
  document.getElementById('ni-cerro-knob').style.left = niCerro ? '20px' : '2px';
}
window.toggleCerro = toggleCerro;

function toggleEscuelita() {
  niEscuelita = !niEscuelita;
  document.getElementById('ni-escuelita-toggle').style.background = niEscuelita ? 'var(--accent)' : 'var(--line)';
  document.getElementById('ni-escuelita-knob').style.transform = niEscuelita ? 'translateX(18px)' : 'translateX(0)';
}
window.toggleEscuelita = toggleEscuelita;

// Toggle escuelita — editar instructor
let meiEscuelita = false;
let meiCerro = true;

function toggleCerroEdit() {
  meiCerro = !meiCerro;
  document.getElementById('mei-cerro-toggle').style.background = meiCerro ? 'var(--accent)' : 'var(--line)';
  document.getElementById('mei-cerro-knob').style.left = meiCerro ? '20px' : '2px';
}
window.toggleCerroEdit = toggleCerroEdit;

function toggleEscuelitaEdit() {
  meiEscuelita = !meiEscuelita;
  document.getElementById('mei-escuelita-toggle').style.background = meiEscuelita ? 'var(--accent)' : 'var(--line)';
  document.getElementById('mei-escuelita-knob').style.transform = meiEscuelita ? 'translateX(18px)' : 'translateX(0)';
}
window.toggleEscuelitaEdit = toggleEscuelitaEdit;
window.editarInstructor = editarInstructor;

document.querySelectorAll('#ni-nc .nivel-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('#ni-nc .nivel-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); nivelCert=btn.dataset.niv;
}));
['ni-disc','ni-niv','ni-rang','ni-idiomas'].forEach(id=>document.querySelectorAll(`#${id} .tag-btn`).forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('active'))));
document.querySelectorAll('#mei-idiomas .tag-btn').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('active')));
function mostrarConfirmacion() {
  const nom   = document.getElementById('ni-nom').value.trim();
  const email = document.getElementById('ni-email').value.trim();
  const tel   = document.getElementById('ni-tel').value.trim();
  const discs = [...document.querySelectorAll('#ni-disc .tag-btn.active')].map(b=>b.dataset.val).join(', ')||'—';
  const nivs  = [...document.querySelectorAll('#ni-niv .tag-btn.active')].map(b=>b.dataset.val).join(', ')||'—';
  const rangs = [...document.querySelectorAll('#ni-rang .tag-btn.active')].map(b=>b.dataset.val).join(', ')||'—';
  const ini   = nom.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  document.getElementById('ni-conf-avatar').textContent  = ini;
  document.getElementById('ni-conf-nombre').textContent  = nom;
  document.getElementById('ni-conf-email').textContent   = email;
  document.getElementById('ni-conf-nivel').textContent   = nivelCert||'—';
  document.getElementById('ni-conf-disc').textContent    = discs;
  document.getElementById('ni-conf-niveles').textContent = nivs;
  document.getElementById('ni-conf-rangos').textContent  = rangs;
  document.getElementById('ni-conf-tel').textContent     = tel||'—';
  document.getElementById('ni-conf-acceso').textContent  = email;
}

// Puntaje base para un instructor recién creado: promedio de los demás activos,
// o 5 si es el primero de la temporada. Se usa tanto en el alta manual como en
// la carga masiva por Excel, para que nadie arranque sin snapshot (eso hacía que
// el ranking los tratara como "0" y siempre quedaran primeros).
async function asignarPuntajeBase(instructorId) {
  await cargarRankingCfg();
  const {data:snaps} = await sb.from('ranking_snapshot').select('*');
  const efectivos = (snaps||[]).map(s => calcularPuntajeEfectivo(s)).filter(v => v != null);
  const prom = efectivos.length ? efectivos.reduce((s,v)=>s+v,0)/efectivos.length : 5;
  await sb.from('ranking_snapshot').insert({instructor_id:instructorId,puntaje_opinion:prom,puntaje_asistencia:prom,puntaje_fidelizacion:prom,puntaje_historico:prom,puntaje_perfil:prom,puntaje_total:prom});
}

document.getElementById('ni-save').addEventListener('click', async()=>{
  const nom   = document.getElementById('ni-nom').value.trim();
  const email = document.getElementById('ni-email').value.trim();
  const pass  = document.getElementById('ni-pass').value;
  if (!nom||!nivelCert) { toast('Faltan datos obligatorios','err'); return; }

  const btn = document.getElementById('ni-save');
  btn.disabled=true; btn.querySelector('span')||btn;
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Verificando plan...';

  // 0. Verificar límite del plan contratado
  const {count: totalInstructores} = await sb.from('instructores').select('*', {count:'exact', head:true}).eq('activo', true);
  const {data: config} = await sb.from('configuracion').select('max_instructores, plan').limit(1).single();
  const maxInst = config?.max_instructores ?? 12;

  if ((totalInstructores ?? 0) >= maxInst) {
    toast(`Límite de tu plan alcanzado (${maxInst} instructores). Contactá a Vertex para ampliar tu plan.`, 'err');
    btn.disabled=false; btn.innerHTML=originalText;
    return;
  }

  btn.innerHTML = 'Guardando...';

  // 1. Crear cuenta en Supabase Auth — usando el cliente AISLADO (sbAuthAux)
  //    para que la sesión del supervisor logueado en "sb" no se vea afectada.
  const {data:signUpData, error:signUpError} = await sbAuthAux.auth.signUp({
    email, password:pass,
    options: { data: { rol: 'instructor' } }
  });
  if (signUpError) {
    toast('Error al crear la cuenta: '+signUpError.message,'err');
    btn.disabled=false; btn.innerHTML=originalText; return;
  }
  const userId = signUpData?.user?.id;
  if (!userId) {
    toast('No se pudo crear la cuenta del instructor','err');
    btn.disabled=false; btn.innerHTML=originalText; return;
  }
  // Cerramos cualquier sesión que el cliente auxiliar haya podido abrir,
  // para que no quede una sesión fantasma en el navegador.
  await sbAuthAux.auth.signOut();

  // 2. Crear perfil en instructores — con el cliente principal "sb",
  //    que mantiene la sesión del supervisor (necesaria para pasar la policy RLS).
  const {data:inst, error:instError} = await sb.from('instructores').insert({
    nombre:nom, email, telefono:document.getElementById('ni-tel').value,
    dni: document.getElementById('ni-dni').value.replace(/\D/g,'')||null,
    temporadas_en_cerro: parseInt(document.getElementById('ni-temporadas').value)||0,
    nivel_certificado:parseInt(nivelCert),
    fecha_ingreso:document.getElementById('ni-fecha').value,
    fecha_nacimiento:document.getElementById('ni-nacimiento').value||null,
    activo:true,
    escuelita:niEscuelita,
    activo_cerro:niCerro,
    idiomas:[...document.querySelectorAll('#ni-idiomas .tag-btn.active')].map(b=>b.dataset.val)
  }).select('id').single();

  if (instError) {
    toast('Error al guardar el perfil','err');
    btn.disabled=false; btn.innerHTML=originalText; return;
  }
  audit('instructor_creado','instructores',inst?.id,{nombre:nom,email,nivel:nivelCert});

  // 3. Crear preferencias
  const discs=[...document.querySelectorAll('#ni-disc .tag-btn.active')].map(b=>b.dataset.val);
  const nivs=[...document.querySelectorAll('#ni-niv .tag-btn.active')].map(b=>b.dataset.val);
  const rangs=[...document.querySelectorAll('#ni-rang .tag-btn.active')].map(b=>b.dataset.val);
  const prefs=[];
  discs.forEach(d=>rangs.forEach(r=>prefs.push({instructor_id:inst.id,disciplina:d,nivel_min:1,nivel_max:parseInt(nivelCert),rango_etario:r})));
  if (prefs.length) await sb.from('instructor_preferencias').insert(prefs);

  // 4. Vincular usuario con instructor en tabla usuarios
  if (userId) {
    await sb.from('usuarios').insert({id:userId, email, rol:'instructor', instructor_id:inst.id});
  }

  // 5. Puntaje base
  await asignarPuntajeBase(inst.id);

  closeModal('modal-inst');
  irPaso(1);
  // Reset tags
  document.querySelectorAll('#ni-disc .tag-btn, #ni-niv .tag-btn, #ni-rang .tag-btn, #ni-nc .nivel-btn').forEach(b=>b.classList.remove('active'));
  nivelCert=null;
  niEscuelita=false; niCerro=true;
  document.getElementById('ni-cerro-toggle').style.background='var(--accent)';
  document.getElementById('ni-cerro-knob').style.left='20px';
  document.getElementById('ni-escuelita-toggle').style.background='var(--line)';
  document.getElementById('ni-escuelita-knob').style.transform='translateX(0)';
  btn.disabled=false; btn.innerHTML=originalText;
  toast(`${nom} agregado al sistema`);
  initInstStats();
});

// ── CARGA INICIAL ──────────────────────────────────────
// ── DASHBOARD: TOP RANKING, CUMPLEAÑOS, ALERGIAS ──────
async function loadDashboardExtras() {
  ocultarLoadingOverlay();
  cargarTopRanking();
  cargarCumpleanos();
}

async function cargarTopRanking() {
  const cont = document.getElementById('top-ranking-lista');
  if (!cont) return;
  await cargarRankingCfg();
  const {data:insts} = await sb.from('instructores').select('id,nombre,ranking_snapshot(*)').eq('activo',true);
  if (!insts?.length) { cont.innerHTML = '<div class="empty">Sin datos</div>'; return; }
  const ordenados = insts
    .map(i => ({nombre:i.nombre, puntaje: calcularPuntajeEfectivo(i.ranking_snapshot?.[i.ranking_snapshot.length-1])}))
    .filter(i => i.puntaje != null)
    .sort((a,b) => b.puntaje - a.puntaje)
    .slice(0,3);
  if (!ordenados.length) { cont.innerHTML = '<div class="empty">Ranking aún en formación</div>'; return; }
  const medallas = ['🥇','🥈','🥉'];
  cont.innerHTML = ordenados.map((i,idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--ice)">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">${medallas[idx]}</span>
        <span style="font-size:13px;font-weight:500">${i.nombre}</span>
      </div>
      <span style="font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--navy)">${i.puntaje.toFixed(1)}</span>
    </div>`).join('');
}

async function cargarCumpleanos() {
  const cont = document.getElementById('cumple-lista');
  if (!cont) return;
  const {data:insts} = await sb.from('instructores').select('nombre,fecha_nacimiento').eq('activo',true).not('fecha_nacimiento','is',null);
  if (!insts?.length) { cont.innerHTML = '<div class="empty">Sin fechas de nacimiento cargadas</div>'; return; }

  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const proximos = insts.map(n => {
    const nac = new Date(n.fecha_nacimiento+'T12:00:00');
    let prox = new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate());
    if (prox < hoy) prox = new Date(hoy.getFullYear()+1, nac.getMonth(), nac.getDate());
    const dias = Math.round((prox - hoy) / 86400000);
    const edadCumple = hoy.getFullYear() - nac.getFullYear() + (prox.getFullYear() > hoy.getFullYear() ? 1 : 0);
    return {nombre:n.nombre, dias, fecha:prox, edad:edadCumple};
  }).filter(n => n.dias <= 7).sort((a,b) => a.dias - b.dias);

  if (!proximos.length) { cont.innerHTML = '<div class="empty">Sin cumpleaños en los próximos 7 días</div>'; return; }

  cont.innerHTML = proximos.map(n => {
    const txt = n.dias === 0 ? '🎉 Hoy' : n.dias === 1 ? 'Mañana' : `En ${n.dias} días`;
    const fechaStr = n.fecha.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--ice)">
      <div>
        <div style="font-size:13px;font-weight:500">🎂 ${n.nombre}</div>
        <div style="font-size:11px;color:var(--silver)">${fechaStr} · Cumple ${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años</div>
      </div>
      <span style="font-size:11px;font-weight:500;color:${n.dias===0?'var(--accent2)':'var(--muted)'}">${txt}</span>
    </div>`;
  }).join('');
}


async function initClasesHoy() {
  const {data:cd}=await sb.from('clases').select('instructor_id, hora_inicio, hora_fin').eq('fecha',fechaISO).neq('estado','cancelada');
  clasesHoy=cd||[];
  document.getElementById('stat-clases').textContent=clasesHoy.length;
  const {data:cf}=await sb.from('clases').select('*, instructores(nombre), clientes(nombre)').eq('fecha',fechaISO).order('hora_inicio');
  document.getElementById('clases-hoy-ct').textContent=`${cf?.length||0} total`;
  const lista=document.getElementById('clases-hoy-lista');
  if (!cf?.length) { lista.innerHTML='<div style="font-size:12px;color:var(--silver);text-align:center;padding:12px 0">Sin clases hoy</div>'; return; }
  lista.innerHTML=cf.map(c=>`<div class="clase-item">
    <div><div class="clase-hora">${c.hora_inicio?.slice(0,5)||'—'}</div><div class="clase-dur">${c.duracion_horas}h</div></div>
    <div class="clase-info"><div class="clase-cliente">${c.clientes?.nombre||'Sin asignar'}</div><div class="clase-detalle">${c.instructores?.nombre||'—'} · ${c.disciplina} Niv. ${c.nivel}</div></div>
    <div class="dot ${c.estado==='completada'?'dot-ok':c.estado==='asignada'?'dot-pend':'dot-none'}"></div>
  </div>`).join('');
}

async function initInstStats() {
  const {data}=await sb.from('instructores').select('id').eq('activo',true);
  document.getElementById('stat-inst').textContent=data?.length||0;
}

async function initPresencia() {
  const {data:insts}=await sb.from('instructores').select('id, nombre').eq('activo',true).order('nombre');
  const hoyAR = new Date().toLocaleString('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).split(' ')[0];
  const {data:pres}=await sb.from('asistencia').select('id, instructor_id, tipo').gte('registrado_en',hoyAR+'T00:00:00').lte('registrado_en',hoyAR+'T23:59:59');
  // Último registro por instructor
  const presMap={};
  (pres||[]).forEach(p=>{ if(p.instructor_id) presMap[p.instructor_id]=p; });
  const lista=document.getElementById('pres-lista');
  if (!insts?.length) { lista.innerHTML='<div class="empty">Sin instructores</div>'; return; }
  let conf=0;
  lista.innerHTML=insts.map(inst=>{
    const reg=presMap[inst.id];
    const presente=reg?.tipo==='presente';
    const ausente=reg?.tipo==='ausente'||reg?.tipo==='ausente_sin_aviso';
    const franco=reg?.tipo==='franco';
    if(presente) conf++;
    let badge;
    if(presente) badge=`<button class="pres-badge pres-ok" onclick="openCorr('${inst.id}','${inst.nombre}',this,'presente')" title="Click para corregir">Presente ✓</button>`;
    else if(franco) badge=`<button class="pres-badge" style="background:#E8ECFF;color:#4A5FAD;border-color:#C5CCEE" onclick="openCorr('${inst.id}','${inst.nombre}',this,'franco')" title="Click para corregir">Franco ☀</button>`;
    else if(ausente) badge=`<button class="pres-badge pres-aus" onclick="openCorr('${inst.id}','${inst.nombre}',this,'ausente')" title="Click para corregir">Ausente</button>`;
    else badge=`<button class="pres-badge ${new Date().getHours()>=17?'pres-aus':'pres-pend'}" onclick="openCorr('${inst.id}','${inst.nombre}',this,'pendiente')">${new Date().getHours()>=17?'Ausente':'Pendiente'}</button>`;
    const sub=presente?'Confirmó presencia':franco?'Franco — no computable':ausente?'Marcado ausente':'Sin confirmar';
    return `<div class="pres-item">
      <div><div class="pres-name">${inst.nombre}</div><div class="pres-sub">${sub}</div></div>
      ${badge}
    </div>`;
  }).join('');
  document.getElementById('pres-resumen').textContent=`${conf} / ${insts.length} confirmados`;
}

async function initResStat() {
  const inicio=new Date(hoy.getFullYear(),hoy.getMonth(),1).toISOString().split('T')[0];
  const {data}=await sb.from('resenas').select('id').gte('creado_en',inicio);
  document.getElementById('stat-res').textContent=data?.length||0;
}

// ── CONFIGURACIÓN DE RANKING — qué componentes cuentan ──
const RANKING_COMPONENTES = [
  {key:'puntaje_opinion',      cfgKey:'ranking_incluye_opinion',      label:'Opinión de clientes'},
  {key:'puntaje_asistencia',   cfgKey:'ranking_incluye_asistencia',   label:'Asistencia'},
  {key:'puntaje_fidelizacion', cfgKey:'ranking_incluye_fidelizacion', label:'Fidelización'},
  {key:'puntaje_historico',    cfgKey:'ranking_incluye_historico',    label:'Historial'},
  {key:'puntaje_perfil',       cfgKey:'ranking_incluye_perfil',       label:'Perfil'},
];
let RANKING_CFG = {ranking_incluye_opinion:true, ranking_incluye_asistencia:true, ranking_incluye_fidelizacion:true, ranking_incluye_historico:true, ranking_incluye_perfil:true};

async function cargarRankingCfg() {
  const {data} = await sb.from('configuracion').select(RANKING_COMPONENTES.map(c=>c.cfgKey).join(',')).single();
  if (data) RANKING_CFG = data;
}

// Puntaje total "efectivo": promedio de solo los componentes habilitados en RANKING_CFG.
// Reemplaza a snapshot.puntaje_total en toda vista de ranking/posición/sugerencia.
function calcularPuntajeEfectivo(snapshot) {
  if (!snapshot) return null;
  const activos = RANKING_COMPONENTES.filter(c => RANKING_CFG[c.cfgKey] !== false);
  const valores = activos.map(c => snapshot[c.key]).filter(v => v != null);
  if (!valores.length) return null;
  return valores.reduce((a,b)=>a+b, 0) / valores.length;
}

document.getElementById('pm-ranking-cfg').addEventListener('click', async () => {
  document.getElementById('profile-menu').classList.remove('open');
  await cargarRankingCfg();
  document.getElementById('mrc-lista').innerHTML = RANKING_COMPONENTES.map(c => `
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer" class="mrc-row">
      <span style="font-size:13px">${c.label}</span>
      <span class="vtx-switch">
        <input type="checkbox" data-cfg="${c.cfgKey}" ${RANKING_CFG[c.cfgKey]!==false?'checked':''}>
        <span class="vtx-switch-track"><span class="vtx-switch-dot"></span></span>
      </span>
    </label>`).join('');
  document.querySelectorAll('#mrc-lista .mrc-row:last-child').forEach(el => el.style.borderBottom='none');
  openModal('modal-ranking-cfg');
});
document.getElementById('mrc-close').addEventListener('click', () => closeModal('modal-ranking-cfg'));
document.getElementById('mrc-guardar').addEventListener('click', async () => {
  const update = {};
  document.querySelectorAll('#mrc-lista input[type=checkbox]').forEach(inp => { update[inp.dataset.cfg] = inp.checked; });
  const {error} = await sb.from('configuracion').update(update).not('id','is',null);
  if (error) { toast('Error al guardar','err'); return; }
  RANKING_CFG = {...RANKING_CFG, ...update};
  closeModal('modal-ranking-cfg');
  toast('Ranking actualizado ✓');
  audit('ranking_config_actualizado', 'configuracion', null, update);
  // Se aplica al instante: re-renderizar lo que esté visible ahora mismo
  if (document.getElementById('pg-ranking')?.style.display !== 'none') renderRanking();
  cargarTopRanking();
});

// ── PÁGINAS ────────────────────────────────────────────
let rkSortCol = 'puntaje_total';
let rkSortDir = -1; // -1 desc, 1 asc
let rkData = [];

function sortRanking(col) {
  if (rkSortCol === col) rkSortDir *= -1;
  else { rkSortCol = col; rkSortDir = col === 'nombre' ? 1 : -1; }
  renderRanking();
}
window.sortRanking = sortRanking;

function renderRanking() {
  // Actualizar indicadores de ordenamiento
  ['nombre','puntaje_opinion','puntaje_asistencia','puntaje_fidelizacion','puntaje_historico','puntaje_perfil','puntaje_total'].forEach(col => {
    const el = document.getElementById('sort-'+col);
    if (el) el.textContent = col === rkSortCol ? (rkSortDir === -1 ? ' ↓' : ' ↑') : '';
  });

  // Atenuar columnas de componentes que no cuentan para el total actualmente
  RANKING_COMPONENTES.forEach(c => {
    const el = document.getElementById('rk-col-'+c.key);
    if (!el) return;
    const activo = RANKING_CFG[c.cfgKey] !== false;
    el.style.opacity = activo ? '1' : '.4';
    el.title = activo ? '' : 'No cuenta para el puntaje total';
  });

  const sorted = [...rkData].sort((a, b) => {
    const sa = a.ranking_snapshot?.[a.ranking_snapshot.length-1];
    const sb2 = b.ranking_snapshot?.[b.ranking_snapshot.length-1];
    if (rkSortCol === 'nombre') {
      return rkSortDir * a.nombre.localeCompare(b.nombre, 'es');
    }
    // El total usa el puntaje efectivo (solo componentes habilitados); las columnas
    // individuales siempre muestran/ordenan su valor real, sin importar el toggle.
    const va = rkSortCol === 'puntaje_total' ? calcularPuntajeEfectivo(sa) : sa?.[rkSortCol];
    const vb = rkSortCol === 'puntaje_total' ? calcularPuntajeEfectivo(sb2) : sb2?.[rkSortCol];
    // Instructores sin puntaje calculado (recién ingresados) van siempre al final,
    // sin importar el orden — no compiten por el primer puesto con un "0" artificial.
    const tieneA = va != null;
    const tieneB = vb != null;
    if (tieneA !== tieneB) return tieneA ? -1 : 1;
    if (!tieneA && !tieneB) return a.nombre.localeCompare(b.nombre, 'es');
    return rkSortDir * (va - vb);
  });

  const isMobile = window.innerWidth < 768;
  const tabla = document.getElementById('rk-tabla');
  tabla.innerHTML = sorted.map((inst, i) => {
    const s = inst.ranking_snapshot?.[inst.ranking_snapshot.length-1];
    const fn = x => {
      const v = s?.[x];
      return v != null ? v.toFixed(1) : '—';
    };
    const total = calcularPuntajeEfectivo(s);
    const totalTxt = total != null ? total.toFixed(1) : '—';
    if (isMobile) {
      return `<div onclick="abrirDetalleInstructor('${inst.id}','${inst.nombre}')" style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--ice);cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:${i<3?'var(--navy)':'var(--silver)'};flex-shrink:0;width:20px;text-align:center">${i+1}</span>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:500">${inst.nombre}</div>
            <div style="font-size:11px;color:var(--silver)">Niv. ${inst.nivel_certificado}</div>
          </div>
        </div>
        <div style="flex-shrink:0">${pill(totalTxt)}</div>
      </div>`;
    }
    // Resaltar columna activa
    const colStyle = col => col === rkSortCol ? 'background:rgba(29,158,117,.06)' : '';
    const dim = c => RANKING_CFG[c] === false ? 'opacity:.4' : '';
    return `<div class="t-row" style="cursor:pointer" onclick="abrirDetalleInstructor('${inst.id}','${inst.nombre}')" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="width:40px;flex-shrink:0;font-family:'Cormorant Garamond',serif;font-size:15px;color:${i<3?'var(--navy)':'var(--silver)'};font-weight:600;text-align:center">${i+1}</div>
      <div style="flex:1;${colStyle('nombre')}"><div style="font-weight:500">${inst.nombre}</div><div style="font-size:11px;color:var(--silver)">Niv. ${inst.nivel_certificado}</div></div>
      <div style="width:80px;text-align:center;flex-shrink:0;${colStyle('puntaje_opinion')};${dim('ranking_incluye_opinion')}">${pill(fn('puntaje_opinion'))}</div>
      <div style="width:80px;text-align:center;flex-shrink:0;${colStyle('puntaje_asistencia')};${dim('ranking_incluye_asistencia')}">${pill(fn('puntaje_asistencia'))}</div>
      <div style="width:80px;text-align:center;flex-shrink:0;${colStyle('puntaje_fidelizacion')};${dim('ranking_incluye_fidelizacion')}">${pill(fn('puntaje_fidelizacion'))}</div>
      <div style="width:80px;text-align:center;flex-shrink:0;${colStyle('puntaje_historico')};${dim('ranking_incluye_historico')}">${pill(fn('puntaje_historico'))}</div>
      <div style="width:80px;text-align:center;flex-shrink:0;${colStyle('puntaje_perfil')};${dim('ranking_incluye_perfil')}">${pill(fn('puntaje_perfil'))}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;${colStyle('puntaje_total')}">${pill(totalTxt)}</div>
    </div>`;
  }).join('');
  document.getElementById('rk-ct').textContent = `${sorted.length} instructores`;
}

async function loadRanking() {
  const disc = document.getElementById('f-disc').value;
  const niv  = document.getElementById('f-nivel').value;
  const tabla = document.getElementById('rk-tabla');
  tabla.innerHTML = '<div class="empty">Cargando...</div>';
  await cargarRankingCfg();
  const {data:insts} = await sb.from('instructores').select('*, ranking_snapshot(*), instructor_preferencias(*)').eq('activo',true);
  if (!insts?.length) { tabla.innerHTML='<div class="empty">No hay instructores</div>'; return; }
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  rkData = insts.filter(i => {
    const p = i.instructor_preferencias||[];
    if (!disc && !niv) return true;
    return p.some(x => (!disc||norm(x.disciplina)===norm(disc)) && (!niv||norm(x.nivel_max)===norm(niv)));
  });
  renderRanking();
}

async function abrirDetalleInstructor(instId, nombre) {
  await cargarRankingCfg();
  // Cargar datos del instructor para modal de detalle
  const [{data:snap},{data:resenas},{data:clases}] = await Promise.all([
    sb.from('ranking_snapshot').select('*').eq('instructor_id',instId).order('calculado_en',{ascending:false}).limit(1),
    sb.from('resenas').select('puntaje_clase,puntaje_trato,comentario,creado_en').in('clase_id',
      (await sb.from('clases').select('id').eq('instructor_id',instId)).data?.map(c=>c.id)||[]
    ).order('creado_en',{ascending:false}).limit(5),
    sb.from('clases').select('estado,instructor_confirmo,fecha').eq('instructor_id',instId).order('fecha',{ascending:false}).limit(20)
  ]);

  const s = snap?.[0];
  const totalEfectivo = calcularPuntajeEfectivo(s);
  const totalClases = clases?.length||0;
  const completadas = clases?.filter(c=>c.estado==='completada').length||0;
  const confirmadas = clases?.filter(c=>c.instructor_confirmo).length||0;
  const promResena = resenas?.length
    ? (resenas.reduce((a,r)=>a+(r.puntaje_clase+r.puntaje_trato)/2,0)/resenas.length).toFixed(1)
    : '—';
  const noCuenta = cfgKey => RANKING_CFG[cfgKey] === false ? ' (no cuenta)' : '';

  const contenido = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      ${[
        ['Opinión'+noCuenta('ranking_incluye_opinion'),s?.puntaje_opinion?.toFixed(1)||'—', RANKING_CFG.ranking_incluye_opinion===false],
        ['Asistencia'+noCuenta('ranking_incluye_asistencia'),s?.puntaje_asistencia?.toFixed(1)||'—', RANKING_CFG.ranking_incluye_asistencia===false],
        ['Fidelización'+noCuenta('ranking_incluye_fidelizacion'),s?.puntaje_fidelizacion?.toFixed(1)||'—', RANKING_CFG.ranking_incluye_fidelizacion===false],
        ['Historial'+noCuenta('ranking_incluye_historico'),s?.puntaje_historico?.toFixed(1)||'—', RANKING_CFG.ranking_incluye_historico===false],
        ['Perfil'+noCuenta('ranking_incluye_perfil'),s?.puntaje_perfil?.toFixed(1)||'—', RANKING_CFG.ranking_incluye_perfil===false],
        ['TOTAL',totalEfectivo!=null?totalEfectivo.toFixed(1):'—', false],
        ['Clases (muestra)',totalClases, false],
        ['Prom. reseñas',promResena, false],
      ].map(([label,val,dim])=>`
        <div style="background:var(--ice);border-radius:8px;padding:12px;text-align:center;${dim?'opacity:.5':''}">
          <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${label}</div>
          <div style="font-size:20px;font-weight:600;font-family:'Cormorant Garamond',serif;color:var(--navy)">${val}</div>
        </div>`).join('')}
    </div>
    ${resenas?.length ? `
      <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;font-weight:500">Últimas reseñas</div>
      <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:0">
        ${resenas.map(r=>`
          <div style="padding:10px 14px;border-bottom:1px solid var(--ice)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              ${pill(((r.puntaje_clase+r.puntaje_trato)/2).toFixed(1))}
              <span style="font-size:11px;color:var(--silver)">${new Date(r.creado_en).toLocaleDateString('es-AR')}</span>
            </div>
            ${r.comentario?`<div style="font-size:12px;color:var(--muted);font-style:italic">"${r.comentario}"</div>`:''}
          </div>`).join('')}
      </div>` : '<div style="font-size:13px;color:var(--silver);text-align:center;padding:16px">Sin reseñas aún</div>'}
  `;

  // Abrir modal genérico de detalle
  document.getElementById('rk-det-titulo').textContent = nombre;
  document.getElementById('rk-det-body').innerHTML = contenido;
  openModal('modal-rk-detalle');
}
window.abrirDetalleInstructor = abrirDetalleInstructor;
document.getElementById('rk-det-close').addEventListener('click',()=>closeModal('modal-rk-detalle'));
document.getElementById('f-disc').addEventListener('change',loadRanking);
document.getElementById('f-nivel').addEventListener('change',loadRanking);

async function loadClases() {
  const rawVal = document.getElementById('f-fecha-cl').value || fechaISO;
  // Normalizar siempre a YYYY-MM-DD para Supabase
  let fecha = rawVal;
  if (rawVal.includes('/')) {
    const p = rawVal.split('/');
    // DD/MM/YYYY
    if (p[2]?.length === 4) fecha = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    // MM/DD/YYYY
    else if (p[0]?.length <= 2 && p[2]?.length === 4) fecha = `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
  }
  const estado=document.getElementById('f-estado-cl').value;
  const tabla=document.getElementById('cl-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  let q=sb.from('clases').select('*, instructores(nombre), clientes(nombre)').eq('fecha',fecha).order('hora_inicio');
  if (estado) q=q.eq('estado',estado);
  const {data}=await q;
  document.getElementById('cl-ct').textContent=`${data?.length||0} clases`;
  if (!data?.length) { tabla.innerHTML='<div class="empty">No hay clases</div>'; return; }
  tabla.innerHTML=data.map(c=>{
    const esMobile = window.innerWidth < 768;
    const accionBtns = c.estado==='asignada' ? `
      <button class="inst-action-btn" title="Finalizar" onclick="abrirFinalizarAdmin('${c.id}','${c.instructores?.nombre||'—'}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}','${c.disciplina} · ${c.nivel}')" style="width:28px;padding:0;display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" stroke-width="2.5" stroke-linecap="round"><path d="M4 12l5 5L20 7"/></svg>
      </button>
      <button class="inst-action-btn" title="Cambiar instructor" onclick="abrirCambiarInstructor('${c.id}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}','${c.disciplina}','${c.nivel}')" style="width:28px;padding:0;display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      </button>
      <button class="inst-action-btn" title="Cancelar clase" onclick="abrirCancelarClase('${c.id}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}')" style="width:28px;padding:0;display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>` : '';

    const estadoBadge = c.estado==='asignada' ? badge('Asignada','#185FA5','#E6F1FB')
      : c.estado==='completada' ? badge('Completada','#0F6E56','#E1F5EE')
      : c.estado==='cancelada' ? badge('Cancelada','var(--danger)','var(--danger-bg)')
      : badge('Pendiente','var(--warn)','var(--warn-bg)');

    if (esMobile) {
      return `<div style="padding:14px 16px;border-bottom:1px solid var(--ice);background:#fff">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:500;color:var(--navy)">${c.hora_inicio?.slice(0,5)||'—'} <span style="font-size:12px;color:var(--silver);font-weight:400">${c.duracion_horas}h</span></div>
            <div style="font-size:13px;color:var(--text);margin-top:3px">${c.clientes?.nombre||'—'}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${c.instructores?.nombre||'—'} · ${c.disciplina} · ${c.nivel}</div>
          </div>
          <div>${estadoBadge}</div>
        </div>
        ${c.estado==='asignada' ? `<div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="abrirFinalizarAdmin('${c.id}','${c.instructores?.nombre||'—'}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}','${c.disciplina} · ${c.nivel}')" style="flex:1;height:34px;border:1px solid #E1F5EE;border-radius:6px;background:#E1F5EE;color:#0F6E56;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;cursor:pointer">Finalizar</button>
          <button onclick="abrirCambiarInstructor('${c.id}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}','${c.disciplina}','${c.nivel}')" style="flex:1;height:34px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">Cambiar</button>
          <button onclick="abrirCancelarClase('${c.id}','${c.clientes?.nombre||'—'}','${c.hora_inicio?.slice(0,5)||'—'}')" style="flex:1;height:34px;border:1px solid var(--danger-bg);border-radius:6px;background:var(--danger-bg);color:var(--danger);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer">Cancelar</button>
        </div>` : ''}
      </div>`;
    }

    return `<div class="t-row">
      <div style="width:60px;flex-shrink:0;font-weight:500;color:var(--navy)">${c.hora_inicio?.slice(0,5)||'—'}</div>
      <div style="width:45px;flex-shrink:0;color:var(--muted);font-size:12px">${c.duracion_horas}h</div>
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.clientes?.nombre||'—'}</div>
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--muted)">${c.instructores?.nombre||'—'}</div>
      <div style="width:140px;flex-shrink:0;font-size:12px;color:var(--muted)">${c.disciplina} · ${c.nivel}</div>
      <div style="width:160px;flex-shrink:0;display:flex;gap:4px;align-items:center">${estadoBadge}${accionBtns}</div>
    </div>`;
  }).join('');
}
document.getElementById('f-fecha-cl').addEventListener('change',loadClases);
document.getElementById('f-estado-cl').addEventListener('change',loadClases);

async function cargarIndicadorPlan() {
  const {count} = await sb.from('instructores').select('*', {count:'exact', head:true}).eq('activo', true);
  const {data: config} = await sb.from('configuracion').select('max_instructores, plan').limit(1).maybeSingle();
  if (!config) { document.getElementById('plan-indicator').style.display = 'none'; return; }

  const total = count ?? 0;
  const max = config.max_instructores;
  const pct = Math.min(100, Math.round((total / max) * 100));
  const planNombre = {starter:'Starter', pro:'Pro', business:'Business', enterprise:'Enterprise'}[config.plan] || config.plan;

  document.getElementById('plan-indicator').style.display = 'block';
  document.getElementById('plan-label').textContent = `Plan ${planNombre}`;
  document.getElementById('plan-contador').textContent = `${total} / ${max} instructores`;

  const barra = document.getElementById('plan-barra');
  barra.style.width = pct + '%';
  barra.style.background = pct >= 100 ? 'var(--danger)' : pct >= 85 ? 'var(--warn)' : 'var(--accent)';
}

async function loadInstructores() {
  const buscar=document.getElementById('f-buscar-inst').value.toLowerCase();
  const activo=document.getElementById('f-activo-inst').value;
  const tabla=document.getElementById('inst-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  let q=sb.from('instructores').select('*, instructor_preferencias(*), invitaciones(codigo,usado)').order('nombre');
  if (activo!=='') q=q.eq('activo',activo==='true');
  const {data}=await q;
  const filtrados=buscar?data?.filter(i=>i.nombre.toLowerCase().includes(buscar)):data;
  document.getElementById('inst-ct').textContent=`${filtrados?.length||0} instructores`;
  cargarIndicadorPlan();
  if (!filtrados?.length) { tabla.innerHTML='<div class="empty">No hay instructores</div>'; return; }
  const isMobile = window.innerWidth < 768;
  tabla.innerHTML=filtrados.map(inst=>{
    const discs=[...new Set((inst.instructor_preferencias||[]).map(p=>p.disciplina))].join(', ')||'—';
    const initials = inst.nombre.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
    const badgesCE = `${inst.activo_cerro!==false?'<span style="font-size:10px;background:#EEF2FF;color:#3730A3;padding:1px 6px;border-radius:10px;font-weight:500">⛷ Escuela</span>':''}${inst.escuelita?'<span style="font-size:10px;background:#F0FDF4;color:#166534;padding:1px 6px;border-radius:10px;font-weight:500">🎿 Escuelita</span>':''}`;
    // Invitación pendiente — tiene código sin usar y sin email (nunca activó la cuenta)
    const invPendiente = (inst.invitaciones||[]).find(i => !i.usado);
    const btnInvitacion = invPendiente && !inst.email ? `<button onclick="reenviarInvitacion('${inst.id}','${inst.nombre}','${invPendiente.codigo}')" title="Cuenta pendiente de activación" style="font-size:10px;padding:2px 8px;border-radius:10px;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500">⏳ Pendiente</button>` : '';    if (isMobile) {
      return `<div style="margin:0 12px 10px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);border:1px solid var(--line);overflow:hidden">
        <div style="padding:14px 14px 10px;display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;font-family:'Cormorant Garamond',serif">${initials}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${inst.nombre}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">Niv. ${inst.nivel_certificado} · ${discs}</div>
            <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">${badgesCE}${btnInvitacion}</div>
          </div>
          ${badge(inst.activo?'Activo':'Inact.',inst.activo?'#0F6E56':'var(--silver)',inst.activo?'#E1F5EE':'var(--ice)')}
        </div>
        ${inst.telefono ? `<div style="padding:0 14px 10px;font-size:12px;color:var(--silver);display:flex;align-items:center;gap:6px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3c0 8 6 11 10 10l1-3-3-1-1 2C8 10 6 8 5 6l2-1L6 2z"/></svg>${inst.telefono}</div>` : ''}
        <div style="padding:10px 14px;border-top:1px solid var(--ice);display:flex;gap:8px;background:var(--ice)">
          <button class="inst-action-btn" onclick="editarInstructor('${inst.id}','${inst.nombre}','${inst.nivel_certificado}','${inst.telefono||''}','${inst.email||''}')" style="flex:1;border-radius:8px">Editar</button>
          ${inst.activo ? `<button class="inst-action-btn" onclick="abrirBajaTemporal('${inst.id}','${inst.nombre}')" style="flex:1;border-radius:8px">Baja temp.</button>` : ''}
          <button class="inst-action-btn ${inst.activo?'danger':''}" onclick="toggleActivoInstructor('${inst.id}',${inst.activo})" style="flex:1;border-radius:8px">${inst.activo?'Dar de baja':'Activar'}</button>
        </div>
      </div>`;
    }
    return `<div class="t-row" style="overflow:hidden">
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inst.nombre}</div>
        <div style="display:flex;gap:4px;margin-top:3px">${badgesCE}${btnInvitacion}</div>
      </div>
      <div style="width:50px;text-align:center;flex-shrink:0">${inst.nivel_certificado}</div>
      <div style="width:120px;flex-shrink:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${discs}</div>
      <div style="width:110px;flex-shrink:0;font-size:12px;color:var(--muted)">${inst.telefono||'—'}</div>
      <div style="width:70px;text-align:center;flex-shrink:0">${badge(inst.activo?'Activo':'Inact.',inst.activo?'#0F6E56':'var(--silver)',inst.activo?'#E1F5EE':'var(--ice)')}</div>
      <div style="width:180px;text-align:center;flex-shrink:0;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
        <button class="inst-action-btn" onclick="editarInstructor('${inst.id}','${inst.nombre}','${inst.nivel_certificado}','${inst.telefono||''}','${inst.email||''}')">Editar</button>
        ${inst.activo ? `<button class="inst-action-btn" onclick="abrirBajaTemporal('${inst.id}','${inst.nombre}')">Baja temp.</button>` : ''}
        <button class="inst-action-btn ${inst.activo?'danger':''}" onclick="toggleActivoInstructor('${inst.id}',${inst.activo})">${inst.activo?'Baja':'Activar'}</button>
      </div>
    </div>`;
  }).join('');
}
document.getElementById('f-buscar-inst').addEventListener('input',loadInstructores);
document.getElementById('f-activo-inst').addEventListener('change',loadInstructores);

let mostrandoInactivos = false;
function toggleInactivos() {
  mostrandoInactivos = !mostrandoInactivos;
  const sel = document.getElementById('f-activo-inst');
  const btn = document.getElementById('btn-mostrar-inactivos');
  sel.value = mostrandoInactivos ? 'false' : 'true';
  btn.textContent = mostrandoInactivos ? 'Ver activos' : 'Ver inactivos';
  btn.style.background = mostrandoInactivos ? 'var(--ice)' : '#fff';
  btn.style.color = mostrandoInactivos ? 'var(--navy)' : 'var(--muted)';
  btn.style.borderColor = mostrandoInactivos ? 'var(--navy)' : 'var(--line)';
  loadInstructores();
}
window.toggleInactivos = toggleInactivos;

// ── NUEVO / EDITAR CLIENTE ───────────────────────────────────
function abrirNuevoCliente() {
  document.getElementById('mnc-id').value = '';
  document.getElementById('mnc-title').textContent = 'Nuevo cliente';
  document.getElementById('mnc-nombre').value = '';
  document.getElementById('mnc-tel').value = '';
  document.getElementById('mnc-idioma').value = '';
  document.getElementById('mnc-disc').value = '';
  document.getElementById('mnc-nivel').value = '';
  document.getElementById('mnc-rango').value = '';
  openModal('modal-nuevo-cliente');
}
window.abrirNuevoCliente = abrirNuevoCliente;

async function abrirEditarCliente(id) {
  const {data:c} = await sb.from('clientes').select('*').eq('id',id).single();
  if (!c) return;
  document.getElementById('mnc-id').value = c.id;
  document.getElementById('mnc-title').textContent = 'Editar cliente';
  document.getElementById('mnc-nombre').value = c.nombre||'';
  document.getElementById('mnc-tel').value = c.telefono||'';
  document.getElementById('mnc-idioma').value = c.idioma||'';
  document.getElementById('mnc-disc').value = c.disciplina||'';
  document.getElementById('mnc-nivel').value = c.nivel||'';
  document.getElementById('mnc-rango').value = c.rango_etario||'';
  openModal('modal-nuevo-cliente');
}
window.abrirEditarCliente = abrirEditarCliente;

async function guardarCliente() {
  const id     = document.getElementById('mnc-id').value;
  const nombre = document.getElementById('mnc-nombre').value.trim();
  if (!nombre) { toast('Ingresá el nombre del cliente','err'); return; }

  const payload = {
    nombre,
    telefono:    document.getElementById('mnc-tel').value.trim()||null,
    idioma:      document.getElementById('mnc-idioma').value||null,
    disciplina:  document.getElementById('mnc-disc').value||null,
    nivel:       document.getElementById('mnc-nivel').value||null,
    rango_etario:document.getElementById('mnc-rango').value||null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('clientes').update(payload).eq('id',id));
    if (!error) { audit('cliente_editado','clientes',id,{nombre}); toast('Cliente actualizado ✓'); }
  } else {
    const {data:nuevo, error:e} = await sb.from('clientes').insert(payload).select('id').single();
    error = e;
    if (!error) { audit('cliente_creado','clientes',nuevo?.id,{nombre}); toast('Cliente creado ✓'); }
  }

  if (error) { toast('Error al guardar','err'); return; }
  closeModal('modal-nuevo-cliente');
  loadClientes();
}
window.guardarCliente = guardarCliente;

async function loadClientes() {
  const buscar = document.getElementById('f-buscar-cli').value.toLowerCase();
  const disc   = document.getElementById('f-disc-cli').value;
  const sort   = document.getElementById('f-sort-cli').value;
  const tabla  = document.getElementById('cli-tabla');
  tabla.innerHTML = skRows(4);

  // Traer clientes con su historial de clases
  const {data:clientes} = await sb.from('clientes').select('*').order('nombre');
  const {data:clases}   = await sb.from('clases').select('id, cliente_id, instructor_id, fecha, disciplina, nivel, estado, instructores(nombre)').eq('estado','completada').order('fecha',{ascending:false});

  if (!clientes?.length) { tabla.innerHTML='<div class="empty">No hay clientes</div>'; return; }

  // Enriquecer clientes con datos de clases
  const clasesPorCliente = {};
  (clases||[]).forEach(c => {
    if (!clasesPorCliente[c.cliente_id]) clasesPorCliente[c.cliente_id] = [];
    clasesPorCliente[c.cliente_id].push(c);
  });

  let data = clientes.map(c => {
    const historial = clasesPorCliente[c.id] || [];
    const ultima = historial[0];
    const instructores = [...new Set(historial.map(h=>h.instructores?.nombre).filter(Boolean))];
    return { ...c, historial, ultima, instructorHabitual: instructores[0]||'—', totalClases: historial.length };
  });

  // Filtrar
  if (buscar) data = data.filter(c => c.nombre?.toLowerCase().includes(buscar) || c.telefono?.includes(buscar));
  if (disc)   data = data.filter(c => c.disciplina === disc);

  // Ordenar
  if (sort === 'nombre')      data.sort((a,b) => a.nombre.localeCompare(b.nombre,'es'));
  if (sort === 'ultima_clase') data.sort((a,b) => (b.ultima?.fecha||'') > (a.ultima?.fecha||'') ? 1 : -1);
  if (sort === 'clases_total') data.sort((a,b) => b.totalClases - a.totalClases);
  if (sort === 'instructor')   data.sort((a,b) => a.instructorHabitual.localeCompare(b.instructorHabitual,'es'));

  document.getElementById('cli-ct').textContent = `${data.length} clientes`;
  if (!data.length) { tabla.innerHTML='<div class="empty">No hay clientes que coincidan</div>'; return; }

  const isMobile = window.innerWidth < 768;
  tabla.innerHTML = data.map(c => {
    const ultimaStr = c.ultima ? new Date(c.ultima.fecha+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'2-digit'}) : '—';
    const tel = c.telefono;
    const telLink = tel ? `<a href="tel:${tel}" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none">${tel}</a>` : '—';
    const waTel = tel ? tel.replace(/\D/g,'') : null;
    const waLink = waTel ? `<a href="https://wa.me/${waTel}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none;font-size:11px">WhatsApp →</a>` : '';

    if (isMobile) return `<div style="padding:14px 16px;border-bottom:1px solid var(--ice)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px" onclick="abrirClienteDetalle('${c.id}')" style="cursor:pointer">
        <div>
          <div style="font-size:14px;font-weight:500;color:var(--navy)">${c.nombre}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${c.disciplina||'—'} · ${c.nivel_validado||'—'} · ${c.totalClases} clase${c.totalClases!==1?'s':''}</div>
          ${tel?`<div style="font-size:12px;color:var(--accent2);margin-top:2px">${telLink}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--silver)">${ultimaStr}</div>
          ${waLink}
        </div>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button onclick="abrirClienteDetalle('${c.id}')" class="inst-action-btn" style="flex:1">Ver historial</button>
        <button onclick="abrirEditarCliente('${c.id}')" class="inst-action-btn" style="flex:1">Editar</button>
      </div>
    </div>`;

    return `<div class="t-row" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="flex:1;font-weight:500;color:var(--navy);cursor:pointer" onclick="abrirClienteDetalle('${c.id}')">${c.nombre}</div>
      <div style="width:110px;flex-shrink:0;font-size:12px;color:var(--muted)">${c.disciplina||'—'}</div>
      <div style="width:90px;flex-shrink:0;font-size:12px;color:var(--muted)">${c.nivel_validado||c.nivel_declarado||'—'}</div>
      <div style="width:150px;flex-shrink:0;font-size:12px">${telLink} ${waLink}</div>
      <div style="width:110px;flex-shrink:0;font-size:12px;color:var(--muted)">${ultimaStr}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;font-size:13px;font-weight:500;color:var(--navy)">${c.totalClases}</div>
      <div style="width:140px;flex-shrink:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.instructorHabitual}</div>
      <div style="width:70px;flex-shrink:0;text-align:center"><button onclick="abrirEditarCliente('${c.id}')" class="inst-action-btn">Editar</button></div>
    </div>`;
  }).join('');
}

async function abrirClienteDetalle(clienteId) {
  const {data:c} = await sb.from('clientes').select('*').eq('id',clienteId).single();
  const {data:historial} = await sb.from('clases').select('fecha, disciplina, nivel, hora_inicio, duracion_horas, instructores(nombre)').eq('cliente_id',clienteId).eq('estado','completada').order('fecha',{ascending:false}).limit(20);

  document.getElementById('mcd-nombre').textContent = c.nombre;

  const totalClases = historial?.length||0;
  const instructores = [...new Set((historial||[]).map(h=>h.instructores?.nombre).filter(Boolean))];
  const tel = c.telefono;
  const waTel = tel ? tel.replace(/\D/g,'') : null;

  document.getElementById('mcd-stats').innerHTML = [
    ['Clases totales', totalClases],
    ['Disciplina', c.disciplina||'—'],
    ['Nivel', c.nivel_validado||c.nivel_declarado||'—'],
    ['Instructor habitual', instructores[0]||'—'],
  ].map(([label,val])=>`<div style="background:var(--ice);border-radius:8px;padding:12px">
    <div style="font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${label}</div>
    <div style="font-size:14px;font-weight:500;color:var(--navy)">${val}</div>
  </div>`).join('');

  document.getElementById('mcd-contacto').innerHTML = tel
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="font-size:14px;font-weight:500">${tel}</div>
        <div style="display:flex;gap:8px">
          <a href="tel:${tel}" style="padding:7px 14px;background:var(--navy);color:#fff;border-radius:6px;font-size:12px;text-decoration:none;font-family:'DM Sans',sans-serif">📞 Llamar</a>
          ${waTel?`<a href="https://wa.me/${waTel}" target="_blank" style="padding:7px 14px;background:#25D366;color:#fff;border-radius:6px;font-size:12px;text-decoration:none;font-family:'DM Sans',sans-serif">WhatsApp</a>`:''}
        </div>
      </div>`
    : '<div style="font-size:13px;color:var(--silver)">Sin teléfono registrado</div>';

  document.getElementById('mcd-historial').innerHTML = historial?.length
    ? historial.map(h=>`<div style="padding:10px 14px;border-bottom:1px solid var(--ice);display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:500">${new Date(h.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short',year:'2-digit'})}</div>
          <div style="font-size:11px;color:var(--silver);margin-top:2px">${h.disciplina} · ${h.nivel} · ${h.instructores?.nombre||'—'}</div>
        </div>
        <div style="font-size:12px;color:var(--muted)">${h.hora_inicio?.slice(0,5)} · ${h.duracion_horas}h</div>
      </div>`).join('')
    : '<div class="empty">Sin clases completadas</div>';

  openModal('modal-cliente-det');
}
window.abrirClienteDetalle = abrirClienteDetalle;

document.getElementById('mcd-close').addEventListener('click',()=>closeModal('modal-cliente-det'));
document.getElementById('f-buscar-cli').addEventListener('input',loadClientes);
document.getElementById('f-disc-cli').addEventListener('change',loadClientes);
document.getElementById('f-sort-cli').addEventListener('change',loadClientes);

async function loadAsistencia() {
  const mes=parseInt(document.getElementById('f-mes').value);
  const anio=parseInt(document.getElementById('f-anio').value);
  const desde=`${anio}-${String(mes).padStart(2,'0')}-01`;
  // Calcular último día del mes correctamente
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta=`${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
  const mn=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('asist-period').textContent=`${anio} — ${mn[mes-1]}`;
  const tabla=document.getElementById('asist-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  const {data:insts}=await sb.from('instructores').select('id, nombre, creado_en').eq('activo',true).order('nombre');
  // Tabla asistencia = fuente de verdad (marcada por supervisor)
  const {data:registros}=await sb.from('asistencia').select('instructor_id, tipo, registrado_en').gte('registrado_en',desde+'T00:00:00').lte('registrado_en',hasta+'T23:59:59');
  // Bajas temporales en el período
  const {data:bajasTemporales}=await sb.from('bajas_temporales').select('instructor_id, fecha_inicio, fecha_fin').lte('fecha_inicio',hasta).or(`fecha_fin.gte.${desde},fecha_fin.is.null`);
  // Horas siguen saliendo de clases
  const {data:clases}=await sb.from('clases').select('instructor_id, duracion_horas').gte('fecha',desde).lte('fecha',hasta);
  if (!insts?.length) { tabla.innerHTML='<div class="empty">No hay instructores</div>'; return; }
  // Días transcurridos en el período (hasta hoy inclusive)
  const hoyISO = new Date().toISOString().split('T')[0];
  const fechaHasta = hasta < hoyISO ? hasta : hoyISO;
  const diasTranscurridos = Math.max(0, Math.round((new Date(fechaHasta) - new Date(desde)) / 86400000) + 1);
  const isMobile = window.innerWidth < 768;
  tabla.innerHTML=insts.map(inst=>{
    // Fecha de inicio efectiva: la mayor entre el inicio del período y la creación del instructor
    const fechaCreacion = inst.creado_en ? inst.creado_en.split('T')[0] : desde;
    const desdeEfectivo = fechaCreacion > desde ? fechaCreacion : desde;
    const diasInst = Math.max(0, Math.round((new Date(fechaHasta) - new Date(desdeEfectivo)) / 86400000) + 1);
    // Calcular días de baja temporal en el período
    const diasBaja = (bajasTemporales||[]).filter(b=>b.instructor_id===inst.id).reduce((total, b)=>{
      const bInicio = new Date(Math.max(new Date(b.fecha_inicio), new Date(desdeEfectivo)));
      const bFin    = new Date(Math.min(b.fecha_fin ? new Date(b.fecha_fin) : new Date(fechaHasta), new Date(fechaHasta)));
      if (bFin >= bInicio) return total + Math.round((bFin-bInicio)/86400000) + 1;
      return total;
    }, 0);
    // Un registro por día (el más reciente si hay varios)
    const regsInst=(registros||[]).filter(r=>r.instructor_id===inst.id && r.registrado_en.split('T')[0]<=fechaHasta && r.registrado_en.split('T')[0]>=desdeEfectivo);
    // Agrupar por día y tomar el último registro
    const porDia={};
    regsInst.forEach(r=>{ const d=r.registrado_en.split('T')[0]; porDia[d]=r.tipo; });
    const francos=Object.values(porDia).filter(t=>t==='franco').length;
    const pres=Object.values(porDia).filter(t=>t==='presente').length;
    const total=Math.max(0, diasInst-francos-diasBaja); // días laborables reales descontando francos y bajas
    const hs=(clases||[]).filter(x=>x.instructor_id===inst.id).reduce((s,x)=>s+(parseFloat(x.duracion_horas)||0),0);
    const pct=total>0?Math.round((pres/total)*100):0;
    const pC=pct>=90?'#0F6E56':pct>=70?'var(--warn)':'var(--danger)';
    const pB=pct>=90?'#E1F5EE':pct>=70?'var(--warn-bg)':'var(--danger-bg)';
    const onclick = `onclick="abrirDetalleClasesInstructor('${inst.id}','${inst.nombre.replace(/'/g,"\\'")}','${desde}','${hasta}')" style="cursor:pointer"`;
    if (isMobile) {
      const initials2 = inst.nombre.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
      return `<div ${onclick} style="margin:0 12px 10px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);border:1px solid var(--line);overflow:hidden">
        <div style="padding:14px 14px 10px;display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:50%;background:${pC};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;font-family:'Cormorant Garamond',serif">${initials2}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600;color:var(--navy)">${inst.nombre}</div>
            <div style="font-size:12px;color:var(--silver);margin-top:2px">${total} días laborables${francos>0?` · ☀ ${francos} franco${francos>1?'s':''}`:''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700;color:${pC}">${pct}%</div>
          </div>
        </div>
        <div style="padding:0 14px 12px">
          <div style="height:6px;background:var(--ice);border-radius:3px;overflow:hidden;margin-bottom:12px">
            <div style="height:100%;width:${pct}%;background:${pC};border-radius:3px"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div style="background:#ECFDF5;border-radius:8px;padding:8px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:#0F6E56">${pres}</div>
              <div style="font-size:10px;color:#047857;margin-top:2px">Presentes</div>
            </div>
            <div style="background:#FEF2F2;border-radius:8px;padding:8px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--danger)">${total-pres}</div>
              <div style="font-size:10px;color:#B91C1C;margin-top:2px">Ausentes</div>
            </div>
            <div style="background:var(--ice);border-radius:8px;padding:8px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--navy)">${hs.toFixed(1)}</div>
              <div style="font-size:10px;color:var(--silver);margin-top:2px">Horas</div>
            </div>
          </div>
        </div>
      </div>`;
    }
    return `<div class="t-row" ${onclick} onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div style="flex:1;font-weight:500">${inst.nombre}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;font-weight:500;color:#0F6E56">${pres}</div>
      <div style="width:90px;text-align:center;flex-shrink:0;font-weight:500;color:var(--danger)">${total-pres}</div>
      <div style="width:90px;text-align:center;flex-shrink:0">${total}${francos>0?` <span style="font-size:10px;color:#4A5FAD">(+${francos}fr)</span>`:''}</div>
      <div style="width:110px;text-align:center;flex-shrink:0">${hs.toFixed(1)} hs</div>
      <div style="width:110px;text-align:center;flex-shrink:0">${badge(pct+'%',pC,pB)}</div>
    </div>`;
  }).join('');
}
document.getElementById('f-mes').addEventListener('change',loadAsistencia);
// Poblar selector de año dinámicamente (año de inicio de plataforma hasta año actual)
(function() {
  const sel = document.getElementById('f-anio');
  const anioActual = new Date().getFullYear();
  const anioInicio = 2026;
  for (let a = anioInicio; a <= anioActual; a++) {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    if (a === anioActual) opt.selected = true;
    sel.appendChild(opt);
  }
})();
document.getElementById('f-anio').addEventListener('change',loadAsistencia);

// Detalle de clases del instructor por semana/periodo
async function abrirDetalleClasesInstructor(instId, nombre, desdeDefault, hastaDefault) {
  let modal = document.getElementById('modal-detalle-clases-inst');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-detalle-clases-inst';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px;animation:none">
        <div class="modal-head"><span class="modal-title" id="dci-titulo">Clases</span><button class="modal-close" onclick="document.getElementById('modal-detalle-clases-inst').remove()">&times;</button></div>
        <div class="modal-body" style="max-height:75vh;overflow-y:auto">
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <button id="dci-tab-semana" onclick="setDciTab('semana')" style="flex:1;height:34px;border:1px solid var(--line);border-radius:6px;background:var(--navy);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;font-weight:500">Esta semana</button>
            <button id="dci-tab-mes" onclick="setDciTab('mes')" style="flex:1;height:34px;border:1px solid var(--line);border-radius:6px;background:var(--ice);color:var(--muted);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;font-weight:500">Este mes</button>
          </div>
          <div id="dci-stats" style="display:flex;gap:10px;margin-bottom:16px"></div>
          <div id="dci-lista" style="border:1px solid var(--line);border-radius:8px;overflow:hidden"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } else {
    modal.style.display = 'flex';
  }
  document.getElementById('dci-titulo').textContent = nombre;
  dciInstId = instId;
  dciMesDefault = {desde: desdeDefault, hasta: hastaDefault};
  setDciTab('semana');
}
window.abrirDetalleClasesInstructor = abrirDetalleClasesInstructor;

let dciInstId = null;
let dciMesDefault = null;

function setDciTab(tab) {
  const esSemana = tab === 'semana';
  document.getElementById('dci-tab-semana').style.background = esSemana ? 'var(--navy)' : '#fff';
  document.getElementById('dci-tab-semana').style.color = esSemana ? '#fff' : 'var(--muted)';
  document.getElementById('dci-tab-mes').style.background = !esSemana ? 'var(--navy)' : '#fff';
  document.getElementById('dci-tab-mes').style.color = !esSemana ? '#fff' : 'var(--muted)';
  cargarClasesInstructorDetalle(tab);
}
window.setDciTab = setDciTab;

async function cargarClasesInstructorDetalle(periodo) {
  const lista = document.getElementById('dci-lista');
  const stats = document.getElementById('dci-stats');
  lista.innerHTML = '<div style="padding:20px;text-align:center;color:var(--silver);font-size:13px">Cargando...</div>';
  stats.innerHTML = '';

  let desde, hasta;
  if (periodo === 'semana') {
    const hoy = new Date();
    const diaSemana = hoy.getDay(); // 0=domingo
    const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() + offsetLunes);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    desde = lunes.toISOString().split('T')[0];
    hasta = domingo.toISOString().split('T')[0];
  } else {
    desde = dciMesDefault.desde;
    hasta = dciMesDefault.hasta;
  }

  const {data:clases} = await sb.from('clases')
    .select('*, clientes(nombre)')
    .eq('instructor_id', dciInstId)
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha').order('hora_inicio');

  const completadas = (clases||[]).filter(c=>c.estado==='completada').length;
  const canceladas = (clases||[]).filter(c=>c.estado==='cancelada').length;
  const horas = (clases||[]).reduce((s,c)=>s+(parseFloat(c.duracion_horas)||0),0);

  stats.innerHTML = `
    <div style="flex:1;background:var(--ice);border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:var(--navy)">${clases?.length||0}</div>
      <div style="font-size:9px;color:var(--silver);text-transform:uppercase">Clases</div>
    </div>
    <div style="flex:1;background:#E1F5EE;border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:#0F6E56">${completadas}</div>
      <div style="font-size:9px;color:#0F6E56;text-transform:uppercase">Completadas</div>
    </div>
    <div style="flex:1;background:var(--ice);border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif;color:var(--navy)">${horas.toFixed(1)}</div>
      <div style="font-size:9px;color:var(--silver);text-transform:uppercase">Horas</div>
    </div>
  `;

  if (!clases?.length) { lista.innerHTML = '<div class="empty">Sin clases en este período</div>'; return; }

  lista.innerHTML = clases.map(c => {
    const fechaStr = new Date(c.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const estadoColor = c.estado==='completada'?'#0F6E56':c.estado==='cancelada'?'var(--danger)':'var(--accent2)';
    const estadoBg = c.estado==='completada'?'#E1F5EE':c.estado==='cancelada'?'var(--danger-bg)':'#E6F1FB';
    return `<div style="padding:10px 14px;border-bottom:1px solid var(--ice);display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${fechaStr} · ${c.hora_inicio?.slice(0,5)}</div>
        <div style="font-size:11px;color:var(--silver);margin-top:1px">${c.clientes?.nombre||'—'} · ${c.disciplina} · ${c.nivel}</div>
      </div>
      <span style="font-size:10px;font-weight:500;color:${estadoColor};background:${estadoBg};padding:2px 8px;border-radius:10px;flex-shrink:0">${c.estado}</span>
    </div>`;
  }).join('');
}

async function loadResenas() {
  const buscar=document.getElementById('f-buscar-res').value.toLowerCase();
  const punt=document.getElementById('f-punt-res').value;
  const tabla=document.getElementById('res-tabla');
  tabla.innerHTML='<div class="empty">Cargando...</div>';
  const {data}=await sb.from('resenas').select('*, clases(disciplina, nivel, instructores(nombre), clientes(nombre))').order('creado_en',{ascending:false}).limit(100);
  let filtradas=data||[];
  if (buscar) filtradas=filtradas.filter(r=>r.clases?.instructores?.nombre?.toLowerCase().includes(buscar)||r.clases?.clientes?.nombre?.toLowerCase().includes(buscar));
  if (punt==='5') filtradas=filtradas.filter(r=>r.puntaje_clase===5&&r.puntaje_trato===5);
  if (punt==='4') filtradas=filtradas.filter(r=>Math.round((r.puntaje_clase+r.puntaje_trato)/2)===4);
  if (punt==='3') filtradas=filtradas.filter(r=>Math.round((r.puntaje_clase+r.puntaje_trato)/2)<=3);
  document.getElementById('res-ct').textContent=`${filtradas.length} reseñas`;
  if (!filtradas.length) { tabla.innerHTML='<div class="empty">No hay reseñas</div>'; return; }
  tabla.innerHTML=filtradas.map(r=>{
    const prom=((r.puntaje_clase+r.puntaje_trato)/2).toFixed(1);
    const fecha=new Date(r.creado_en).toLocaleDateString('es-AR',{day:'numeric',month:'long'});
    const pC=prom>=4?'#0F6E56':prom>=3?'var(--warn)':'var(--danger)';
    const pB=prom>=4?'#E1F5EE':prom>=3?'var(--warn-bg)':'var(--danger-bg)';
    return `<div style="padding:14px 18px;border-bottom:1px solid var(--ice)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:5px">
        <div><div style="font-size:13px;font-weight:500">${r.clases?.clientes?.nombre||'—'} → ${r.clases?.instructores?.nombre||'—'}</div><div style="font-size:11px;color:var(--silver);margin-top:2px">${fecha} · ${r.clases?.disciplina||''} ${r.clases?.nivel||''}</div></div>
        <div style="display:flex;gap:10px;align-items:center;flex-shrink:0"><span style="font-size:11px;color:var(--muted)">Clase <strong>${r.puntaje_clase}/5</strong> · Trato <strong>${r.puntaje_trato}/5</strong></span>${badge(prom,pC,pB)}</div>
      </div>
      ${r.comentario?`<div style="font-size:12px;color:var(--muted);font-style:italic">"${r.comentario}"</div>`:''}
    </div>`;
  }).join('');
}
document.getElementById('f-buscar-res').addEventListener('input',loadResenas);
document.getElementById('f-punt-res').addEventListener('change',loadResenas);

// Cancelar clase
let claseACancelar = null;
document.getElementById('mcc-close').addEventListener('click',()=>closeModal('modal-cancelar'));
document.getElementById('mcc-volver').addEventListener('click',()=>closeModal('modal-cancelar'));
document.getElementById('mcc-confirm').addEventListener('click', async()=>{
  if (!claseACancelar) return;
  const btn = document.getElementById('mcc-confirm');
  btn.textContent='Cancelando...'; btn.disabled=true;
  await sb.from('clases').update({estado:'cancelada'}).eq('id',claseACancelar);
  audit('clase_cancelada','clases',claseACancelar,{});
  // Notificar al instructor de la cancelación
  const {data:claseCancelada} = await sb.from('clases').select('instructor_id,hora_inicio,disciplina,fecha').eq('id',claseACancelar).single();
  const hoyISO = new Date().toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});
  const mananaISO = new Date(new Date().setDate(new Date().getDate()+1)).toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});
  if (claseCancelada) {
    const cuandoStr2 = claseCancelada.fecha === hoyISO ? 'hoy' : claseCancelada.fecha === mananaISO ? 'mañana' : new Date(claseCancelada.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
    enviarPushInstructor(claseCancelada.instructor_id, '❌ Clase cancelada', `${claseCancelada.disciplina} · ${claseCancelada.hora_inicio?.slice(0,5)} hs (${cuandoStr2})`);
  }
  closeModal('modal-cancelar');
  btn.textContent='Confirmar cancelación'; btn.disabled=false;
  toast('Clase cancelada');
  loadClases(); initClasesHoy();
  claseACancelar=null;
});

function abrirCancelarClase(claseId, cliente, hora) {
  claseACancelar = claseId;
  document.getElementById('mcc-info').innerHTML=`
    <div style="font-size:13px;font-weight:500;margin-bottom:3px">${cliente}</div>
    <div style="font-size:12px;color:var(--muted)">${hora} hs</div>`;
  openModal('modal-cancelar');
}

// Cambiar instructor
let claseACambiar = null;
document.getElementById('mci-close').addEventListener('click',()=>closeModal('modal-cambiar-inst'));
document.getElementById('mci-cancel').addEventListener('click',()=>closeModal('modal-cambiar-inst'));

async function abrirCambiarInstructor(claseId, cliente, hora, disciplina, nivel) {
  claseACambiar = claseId;
  document.getElementById('mci-info').innerHTML=`
    <div style="font-size:13px;font-weight:500;margin-bottom:3px">${cliente}</div>
    <div style="font-size:12px;color:var(--muted)">${hora} hs · ${disciplina} · ${nivel}</div>`;
  openModal('modal-cambiar-inst');
  const lista = document.getElementById('mci-lista');
  lista.innerHTML='<div class="empty">Cargando...</div>';
  const {data:claseActual} = await sb.from('clases').select('instructor_id,fecha,hora_inicio,hora_fin,duracion_horas').eq('id',claseId).single();
  const instActualId = claseActual?.instructor_id;
  const {data:conflictos} = await sb.from('clases').select('instructor_id').eq('fecha',claseActual?.fecha).neq('id',claseId).neq('estado','cancelada').lt('hora_inicio',claseActual?.hora_fin).gt('hora_fin',claseActual?.hora_inicio);
  const ocupados = new Set((conflictos||[]).map(c=>c.instructor_id));
  await cargarRankingCfg();
  const {data:insts}=await sb.from('instructores').select('*, ranking_snapshot(*)').eq('activo',true).order('nombre');
  if (!insts?.length) { lista.innerHTML='<div class="empty">No hay instructores</div>'; return; }
  lista.innerHTML=insts.map(inst=>{
    const snap=inst.ranking_snapshot?.[inst.ranking_snapshot.length-1];
    const totalEf=calcularPuntajeEfectivo(snap);
    const total=totalEf!=null?totalEf.toFixed(1):'—';
    const esActual = inst.id === instActualId;
    const ocupado = ocupados.has(inst.id);
    const disabled = esActual || ocupado;
    const sub = esActual ? 'Instructor actual' : ocupado ? 'Ocupado en este horario' : `Niv. ${inst.nivel_certificado}`;
    const col = esActual ? 'var(--silver)' : ocupado ? 'var(--danger)' : 'var(--text)';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);${disabled?'opacity:0.5;':'cursor:pointer;'}transition:background .1s"
      ${!disabled?`onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''" onclick="confirmarCambioInstructor('${inst.id}','${inst.nombre}')"`:''}>
      <div>
        <div style="font-size:13px;font-weight:500;color:${col}">${inst.nombre}</div>
        <div style="font-size:11px;color:var(--silver);margin-top:2px">${sub}</div>
      </div>
      <span class="pill ${parseFloat(total)>=7?'pill-ok':parseFloat(total)>=5?'pill-mid':'pill-low'}">${total}</span>
    </div>`;
  }).join('');
}

async function confirmarCambioInstructor(instId, instNombre) {
  if (!claseACambiar) return;
  await sb.from('clases').update({instructor_id:instId}).eq('id',claseACambiar);
  audit('instructor_cambiado','clases',claseACambiar,{nuevo_instructor_id:instId,nuevo_instructor:instNombre});
  closeModal('modal-cambiar-inst');
  toast(`Instructor cambiado a ${instNombre}`);
  loadClases(); initClasesHoy();
  claseACambiar=null;
}

// Finalizar clase — modal
let claseAdminFinalizar = null;

document.getElementById('mf-close').addEventListener('click',()=>closeModal('modal-finalizar'));
document.getElementById('mf-cancel').addEventListener('click',()=>closeModal('modal-finalizar'));
document.getElementById('mf-confirm').addEventListener('click', async()=>{
  if (!claseAdminFinalizar) return;
  const btn = document.getElementById('mf-confirm');
  btn.textContent = 'Finalizando...'; btn.disabled = true;
  await finalizarClase(claseAdminFinalizar);
  closeModal('modal-finalizar');
  btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M4 12l5 5L20 7"/></svg> Confirmar finalización';
  btn.disabled = false;
  claseAdminFinalizar = null;
});

function abrirFinalizarAdmin(claseId, instructor, cliente, hora, detalle) {
  claseAdminFinalizar = claseId;
  document.getElementById('mf-info').innerHTML = `
    <div style="font-size:13px;font-weight:500;margin-bottom:4px">${cliente}</div>
    <div style="font-size:12px;color:var(--muted)">${instructor} · ${hora} hs · ${detalle}</div>`;
  openModal('modal-finalizar');
}

async function finalizarClase(claseId) {
  const {error} = await sb.from('clases').update({estado:'completada'}).eq('id',claseId);
  if (error) { toast('Error al finalizar','err'); return; }
  audit('clase_completada','clases',claseId,{});
  try { await sb.rpc('calcular_ranking'); } catch(e) {}

  // Generar link de reseña
  const link = `${window.location.origin}/vertex_resena.html?clase=${claseId}`;

  // Intentar enviar WhatsApp si el cliente tiene teléfono
  const {data:clase} = await sb.from('clases').select('clientes(nombre,telefono), instructores(nombre), disciplina, nivel, hora_inicio').eq('id',claseId).single();
  const tel = clase?.clientes?.telefono;

  if (tel) {
    try {
      const resp = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          telefono: tel,
          instructor: clase?.instructores?.nombre,
          cliente: clase?.clientes?.nombre,
          disciplina: clase?.disciplina,
          nivel: clase?.nivel,
          hora: clase?.hora_inicio?.slice(0,5),
          claseId
        })
      });
      const data = await resp.json();
      if (data.success) {
        toast('Clase finalizada — WhatsApp enviado al cliente');
      } else if (data.error === 'Twilio no configurado') {
        // Copiar link manualmente si Twilio no está configurado
        navigator.clipboard?.writeText(link).catch(()=>{});
        toast('Clase finalizada — Link de reseña copiado (WhatsApp pendiente)');
      } else {
        navigator.clipboard?.writeText(link).catch(()=>{});
        toast('Clase finalizada — No se pudo enviar WhatsApp, link copiado');
      }
    } catch(e) {
      navigator.clipboard?.writeText(link).catch(()=>{});
      toast('Clase finalizada — Link de reseña copiado al portapapeles');
    }
  } else {
    navigator.clipboard?.writeText(link).catch(()=>{});
    toast('Clase finalizada — Link de reseña copiado (sin teléfono del cliente)');
  }

  loadClases(); initClasesHoy();
}

// Init
initClasesHoy();
initInstStats();
initPresencia();
initResStat();
checkSuperadmin();
initDatePickers();
initSkeletons();
async function loadEscInicio() {
  // Stats
  const hoy = new Date().toISOString().split('T')[0];
  const semLunes = (() => { const d=new Date(); const day=d.getDay(); const diff=d.getDate()-(day===0?6:day-1); d.setDate(diff); return d.toISOString().split('T')[0]; })();
  const semDom   = (() => { const d=new Date(semLunes); d.setDate(d.getDate()+6); return d.toISOString().split('T')[0]; })();

  const [{data:sesHoy},{data:ninos},{data:sesSemanales},{data:instsEsc}] = await Promise.all([
    sb.from('sesiones_escuelita').select('id,grupo_id').eq('fecha',hoy).neq('estado','cancelada'),
    sb.from('grupo_ninos').select('id').eq('activo',true),
    sb.from('sesiones_escuelita').select('id').gte('fecha',semLunes).lte('fecha',semDom).neq('estado','cancelada'),
    sb.from('instructores').select('id').eq('activo',true).eq('escuelita',true)
  ]);
  document.getElementById('esc-stat-grupos').textContent   = sesHoy?.length||0;
  document.getElementById('esc-stat-ninos').textContent    = ninos?.length||0;
  document.getElementById('esc-stat-sesiones').textContent = sesSemanales?.length||0;
  document.getElementById('esc-stat-insts').textContent    = instsEsc?.length||0;

  // Cumpleaños niños
  const {data:todosNinos} = await sb.from('grupo_ninos').select('nombre,fecha_nacimiento,grupos(nombre)').eq('activo',true).not('fecha_nacimiento','is',null);
  const contCumple = document.getElementById('esc-cumple-lista');
  if (!todosNinos?.length) { contCumple.innerHTML='<div class="empty">Sin fechas cargadas</div>'; }
  else {
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const prox = todosNinos.map(n => {
      const nac = new Date(n.fecha_nacimiento+'T12:00:00');
      let p = new Date(hoyD.getFullYear(), nac.getMonth(), nac.getDate());
      if (p < hoyD) p = new Date(hoyD.getFullYear()+1, nac.getMonth(), nac.getDate());
      const dias = Math.round((p - hoyD)/86400000);
      const edad = hoyD.getFullYear() - nac.getFullYear() + (p.getFullYear()>hoyD.getFullYear()?1:0);
      return {...n, dias, edad, fechaProx:p};
    }).filter(n=>n.dias<=7).sort((a,b)=>a.dias-b.dias);
    if (!prox.length) contCumple.innerHTML='<div class="empty">Sin cumpleaños en los próximos 7 días</div>';
    else contCumple.innerHTML = prox.map(n=>{
      const txt = n.dias===0?'🎉 Hoy':n.dias===1?'Mañana':`En ${n.dias} días`;
      const fechaStr = n.fechaProx.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--ice)">
        <div>
          <div style="font-size:13px;font-weight:500">🎂 ${n.nombre}</div>
          <div style="font-size:11px;color:var(--silver)">${fechaStr} · Cumple ${calcEdad(n.fecha_nacimiento)||n.edad||'—'} años · ${n.grupos?.nombre||'—'}</div>
        </div>
        <span style="font-size:11px;font-weight:500;color:${n.dias===0?'var(--accent2)':'var(--muted)'}">${txt}</span>
      </div>`;
    }).join('');
  }

  // Grupos de hoy (resumen)
  const {data:gruposHoy} = await sb.from('sesiones_escuelita').select('grupos(id,nombre,edad_min,edad_max,instructores(nombre)),estado').eq('fecha',hoy).neq('estado','cancelada');
  const contGrupos = document.getElementById('esc-dash-grupos-lista');
  document.getElementById('esc-dash-grupos-ct').textContent = `${gruposHoy?.length||0} grupos`;
  if (!gruposHoy?.length) contGrupos.innerHTML='<div class="empty">Sin sesiones hoy</div>';
  else contGrupos.innerHTML = gruposHoy.map(s=>`
    <div onclick="abrirDetalleGrupo('${s.grupos?.id}','${s.grupos?.nombre||'—'}','${s.grupos?.instructores?.nombre||'Sin instructor'}','${s.grupos?.edad_min||'?'}-${s.grupos?.edad_max||'?'} años')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid var(--ice);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--ice)'" onmouseout="this.style.background=''">
      <div>
        <div style="font-size:13px;font-weight:500">${s.grupos?.nombre||'—'}</div>
        <div style="font-size:11px;color:var(--silver)">${s.grupos?.instructores?.nombre||'Sin instructor'}</div>
      </div>
      ${badge(s.estado==='completada'?'Completada':s.estado==='en_curso'?'En curso':'Pendiente', s.estado==='completada'?'#0F6E56':s.estado==='en_curso'?'var(--accent2)':'var(--silver)', s.estado==='completada'?'#E1F5EE':s.estado==='en_curso'?'#E0F7F0':'var(--ice)')}
    </div>`).join('');

  // Fichas médicas de niños en grupos de hoy
  const contFichas = document.getElementById('esc-fichas-hoy');
  const escAlerta = document.getElementById('esc-alerta-alergias');
  const escAlertaLista = document.getElementById('esc-alerta-lista');
  if (!sesHoy?.length) { contFichas.innerHTML='<div class="empty">Sin grupos activos hoy</div>'; escAlerta.style.display='none'; return; }
  const grupoIds2 = [...new Set(sesHoy.map(s=>s.grupo_id))];
  const {data:ninosMed} = await sb.from('grupo_ninos').select('nombre,alergias,medicacion,condiciones_medicas,observaciones,grupo_id,grupos(nombre)').in('grupo_id',grupoIds2).eq('activo',true);
  const tieneInfo = n => {
    const vals = [n.alergias, n.medicacion, n.condiciones_medicas, n.observaciones];
    return vals.some(v => v && v.trim() && v.toLowerCase() !== 'ninguna' && v.toLowerCase() !== 'ninguno');
  };
  const conMed = (ninosMed||[]).filter(tieneInfo);
  if (!conMed.length) { contFichas.innerHTML='<div class="empty">Ningún niño con condiciones médicas hoy</div>'; escAlerta.style.display='none'; }
  else {
    escAlerta.style.display='block';
    escAlertaLista.innerHTML = conMed.map(n=>`<div style="margin-bottom:4px"><strong>${n.nombre}</strong> (${n.grupos?.nombre||'—'}): ${[n.alergias,n.medicacion].filter(Boolean).join(' · ')}</div>`).join('');
    contFichas.innerHTML = conMed.map(n=>`
      <div style="padding:12px 18px;border-bottom:1px solid var(--ice)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:13px;font-weight:500">⚕️ ${n.nombre}</div>
          <span style="font-size:10px;color:var(--silver)">${n.grupos?.nombre||'—'}</span>
        </div>
        ${n.alergias?`<div style="font-size:11px;color:var(--danger);margin-bottom:2px">⚠ ${n.alergias}</div>`:''}
        ${n.medicacion?`<div style="font-size:11px;color:var(--muted)">💊 ${n.medicacion}</div>`:''}
        ${n.observaciones?`<div style="font-size:11px;color:var(--silver);margin-top:2px">${n.observaciones}</div>`:''}
      </div>`).join('');
  }
}
window.loadEscInicio = loadEscInicio;

/* loadReporte(), descargarReportePDF() → js/vertex_reporte.js */


  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
  }

// ── MINI HEADER MOBILE ───────────────────────────────────
const miniHeaderPanel = document.getElementById('mini-header-panel');
const miniAvatarPanel = document.getElementById('mini-avatar-panel');
const topbarEl = document.querySelector('.topbar');
if (miniHeaderPanel && topbarEl) {
  window.addEventListener('scroll', () => {
    if (window.innerWidth >= 768) { miniHeaderPanel.style.transform = 'translateY(-100%)'; return; }
    miniHeaderPanel.style.transform = topbarEl.getBoundingClientRect().bottom < 0 ? 'translateY(0)' : 'translateY(-100%)';
  }, { passive: true });
  const avatarObs = new MutationObserver(() => {
    miniAvatarPanel.textContent = document.getElementById('user-avatar').textContent;
  });
  avatarObs.observe(document.getElementById('user-avatar'), { childList: true, characterData: true, subtree: true });
}

loadDashboardExtras();

// Restaurar modo y página
const savedModo = localStorage.getItem('vertex_modo') || 'escuela';
const savedPage = localStorage.getItem('vertex_page') || 'asignacion';
if (savedModo === 'escuelita') {
  setModo('escuelita');
  setPage(savedPage.startsWith('esc-') ? savedPage : 'esc-inicio');
} else {
  setModo('escuela');
  setPage(['asignacion','nueva-asignacion','ranking','clases','instructores','clientes','asistencia','resenas','reporte','usuarios'].includes(savedPage) ? savedPage : 'asignacion');
}
// Mostrar contenido una vez restaurado
requestAnimationFrame(() => {
  document.getElementById('main-content').style.opacity = '1';
});

// Inicializar fechas escuelita
document.getElementById('f-fecha-esc').value = fechaISO;
document.getElementById('f-fecha-ses').value = fechaISO;
document.getElementById('f-fecha-esc').addEventListener('change', loadEscGruposHoy);
document.getElementById('f-fecha-ses').addEventListener('change', loadEscSesiones);
document.getElementById('f-estado-ses').addEventListener('change', loadEscSesiones);

// Nota: el rebote elástico de iOS ya se bloquea correctamente por CSS
// (html,body{overscroll-behavior:none} arriba). Había acá además un bloqueador
// manual por JS (touchmove + preventDefault) que era redundante y tenía un bug:
// como la página siempre arranca en scrollY=0, el primer touchmove con cualquier
// componente hacia abajo disparaba preventDefault() y el navegador cancelaba el
// scroll para todo el gesto — dejando la lista de Clientes "trabada", solo
// arrastrable manualmente. Se saca; overscroll-behavior alcanza y no rompe nada.

// Realtime: actualización en vivo sin polling (WebSocket, no gasta I/O)
sb.channel('vertex-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'clases' }, () => {
    if (document.getElementById('pg-asignacion')?.style.display !== 'none') initClasesHoy();
    if (document.getElementById('pg-clases')?.style.display !== 'none') loadClases();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencia' }, () => {
    if (document.getElementById('pg-asignacion')?.style.display !== 'none') initPresencia();
    if (document.getElementById('pg-asistencia')?.style.display !== 'none') loadAsistencia();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_escuelita' }, () => {
    if (document.getElementById('pg-esc-inicio')?.style.display !== 'none') loadEscInicio();
    if (document.getElementById('pg-esc-grupos')?.style.display !== 'none') loadEscGruposHoy();
    if (document.getElementById('pg-esc-sesiones')?.style.display !== 'none') loadEscSesiones();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencia_ninos' }, () => {
    if (document.getElementById('pg-esc-asistencia')?.style.display !== 'none') loadAsistEscNinos();
  })
  .subscribe();
