// ── TABS DEL REPORTE ─────────────────────────────────────────
function setRepTab(tab) {
  const isMensual = tab === 'mensual';
  document.getElementById('rep-panel-mensual').style.display   = isMensual ? '' : 'none';
  document.getElementById('rep-panel-temporada').style.display = isMensual ? 'none' : '';
  document.getElementById('rep-tab-mensual').style.cssText   = `padding:10px 20px;border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:${isMensual?'600':'500'};color:${isMensual?'var(--accent)':'var(--silver)'};border-bottom:${isMensual?'2px solid var(--accent)':'none'};margin-bottom:-2px;cursor:pointer`;
  document.getElementById('rep-tab-temporada').style.cssText = `padding:10px 20px;border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:${isMensual?'500':'600'};color:${isMensual?'var(--silver)':'var(--accent)'};border-bottom:${isMensual?'none':'2px solid var(--accent)'};margin-bottom:-2px;cursor:pointer`;
  if (!isMensual && document.getElementById('rep-contenido-temporada').innerHTML.includes('Cargando')) {
    loadReporteTemporada();
  }
  if (isMensual) loadReporte();
}
window.setRepTab = setRepTab;

// ── Altus Reporte Mensual ────────────────────────────────────
// Genera el reporte mensual de gestión del cerro

async function loadReporte() {
  const selAnio = document.getElementById('rep-anio');
  if (!selAnio.options.length) {
    const anioActual = new Date().getFullYear();
    for (let a = 2026; a <= anioActual; a++) {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      if (a === anioActual) opt.selected = true;
      selAnio.appendChild(opt);
    }
    document.getElementById('rep-mes').value = new Date().getMonth() + 1;
  }

  const mes  = parseInt(document.getElementById('rep-mes').value);
  const anio = parseInt(document.getElementById('rep-anio').value);
  if (!mes || !anio) return;

  const desde       = `${anio}-${String(mes).padStart(2,'0')}-01`;
  const hasta       = new Date(anio, mes, 0).toISOString().split('T')[0];
  const mesAntD     = new Date(anio, mes-2, 1).toISOString().split('T')[0];
  const mesAntH     = new Date(anio, mes-1, 0).toISOString().split('T')[0];
  const nombreMes   = new Date(anio, mes-1).toLocaleString('es-AR', { month:'long' });
  const diasMes     = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;

  const cont = document.getElementById('rep-contenido-temporada');
  cont.innerHTML = '<div class="empty">Cargando reporte...</div>';

  const [
    {data:clases}, {data:clasesAnt},
    {data:insts},  {data:registrosAsist},
    {data:clientesMes}
  ] = await Promise.all([
    sb.from('clases').select('*, instructores(nombre), clientes(id,creado_en)').gte('fecha',desde).lte('fecha',hasta),
    sb.from('clases').select('id,estado').gte('fecha',mesAntD).lte('fecha',mesAntH),
    sb.from('instructores').select('id, nombre, ranking_snapshot(*)').eq('activo',true),
    sb.from('asistencia').select('instructor_id, tipo').gte('registrado_en',desde+'T00:00:00').lte('registrado_en',hasta+'T23:59:59'),
    sb.from('clientes').select('id, creado_en').gte('creado_en',desde).lte('creado_en',hasta+'T23:59:59')
  ]);

  const clasesTotal    = clases?.length || 0;
  const clasesAntTotal = clasesAnt?.length || 0;
  const completadas    = (clases||[]).filter(c=>c.estado==='completada').length;
  const canceladas     = (clases||[]).filter(c=>c.estado==='cancelada').length;
  const diffClases     = clasesAntTotal > 0 ? Math.round(((clasesTotal-clasesAntTotal)/clasesAntTotal)*100) : null;
  const horasTotal     = (clases||[]).reduce((s,c)=>s+(parseFloat(c.duracion_horas)||0),0);
  const clientesNuevos = clientesMes?.length || 0;
  const clientesRecurrentes = [...new Set((clases||[]).filter(c=>c.clientes?.creado_en < desde).map(c=>c.clientes?.id))].filter(Boolean).length;

  // Agrupaciones
  const porDisc = {};
  const porInst = {};
  (clases||[]).forEach(c => {
    if (c.disciplina) porDisc[c.disciplina] = (porDisc[c.disciplina]||0) + 1;
    const nom = c.instructores?.nombre || 'Sin asignar';
    if (!porInst[nom]) porInst[nom] = { clases:0, horas:0 };
    porInst[nom].clases++;
    porInst[nom].horas += parseFloat(c.duracion_horas)||0;
  });

  const asistPorInst = {};
  (registrosAsist||[]).forEach(r => {
    if (!asistPorInst[r.instructor_id]) asistPorInst[r.instructor_id] = { pres:0, francos:0 };
    if (r.tipo==='presente') asistPorInst[r.instructor_id].pres++;
    if (r.tipo==='franco')   asistPorInst[r.instructor_id].francos++;
  });

  const rankingMes = (insts||[]).map(i => {
    const snap = i.ranking_snapshot?.[i.ranking_snapshot.length-1];
    return { nombre:i.nombre, id:i.id, total:snap?.puntaje_total||0, opinion:snap?.puntaje_opinion||0 };
  }).sort((a,b) => b.total - a.total);

  // Helpers de UI
  const pct       = (n,d) => d>0 ? Math.round((n/d)*100)+'%' : '0%';
  const barColor  = (p) => p>=80 ? '#0F6E56' : p>=50 ? '#F59E0B' : '#EF4444';
  const diffLabel = (v) => v===null ? '' : `<span style="font-size:11px;color:${v>=0?'#0F6E56':'#EF4444'};margin-left:6px">${v>=0?'↑':'↓'}${Math.abs(v)}% vs mes ant.</span>`;

  cont.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">✓</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:#065F46">Reporte generado correctamente</div>
          <div style="font-size:11px;color:#047857;margin-top:1px">Revisá el contenido y descargalo cuando estés listo</div>
        </div>
      </div>
    </div>
    <div id="rep-print" style="font-family:'DM Sans',sans-serif">

      <!-- ENCABEZADO -->
      <div class="panel" style="padding:24px 28px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--silver);font-weight:500">Cerro Bayo — Villa La Angostura</div>
          <div style="font-size:22px;font-weight:600;color:var(--navy);margin-top:4px">Reporte — ${nombreMes.charAt(0).toUpperCase()+nombreMes.slice(1)} ${anio}</div>
        </div>
      </div>

      <!-- STATS -->
      <div class="stats" style="margin-bottom:16px">
        <div class="stat">
          <div class="stat-label">Total clases</div>
          <div class="stat-val">${clasesTotal}${diffLabel(diffClases)}</div>
          <div class="stat-sub">${completadas} completadas · ${canceladas} canceladas</div>
        </div>
        <div class="stat">
          <div class="stat-label">Horas trabajadas</div>
          <div class="stat-val">${horasTotal.toFixed(1)} hs</div>
          <div class="stat-sub">en el mes</div>
        </div>
        <div class="stat">
          <div class="stat-label">Clientes</div>
          <div class="stat-val">${clientesNuevos + clientesRecurrentes}</div>
          <div class="stat-sub">${clientesNuevos} nuevos · ${clientesRecurrentes} recurrentes</div>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <!-- CLASES POR DISCIPLINA -->
          <div class="panel">
            <div class="panel-head"><span class="panel-title">Clases por disciplina</span></div>
            <div style="padding:8px 0">
              ${Object.entries(porDisc).sort((a,b)=>b[1]-a[1]).map(([disc,n])=>`
                <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--ice)">
                  <div style="font-size:13px;font-weight:500;min-width:100px">${disc}</div>
                  <div style="flex:1;height:6px;background:var(--ice);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct(n,clasesTotal)};background:var(--accent);border-radius:3px"></div>
                  </div>
                  <div style="font-size:13px;font-weight:600;min-width:30px;text-align:right">${n}</div>
                </div>`).join('')||'<div class="empty">Sin datos</div>'}
            </div>
          </div>

          <!-- HORAS POR INSTRUCTOR -->
          <div class="panel">
            <div class="panel-head"><span class="panel-title">Horas por instructor</span></div>
            <div style="padding:8px 0">
              ${Object.entries(porInst).sort((a,b)=>b[1].horas-a[1].horas).map(([nom,d])=>`
                <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--ice)">
                  <div style="font-size:13px;font-weight:500;flex:1">${nom}</div>
                  <div style="font-size:12px;color:var(--muted)">${d.clases} clases</div>
                  <div style="font-size:13px;font-weight:600;color:var(--navy);min-width:50px;text-align:right">${d.horas.toFixed(1)} hs</div>
                </div>`).join('')||'<div class="empty">Sin datos</div>'}
            </div>
          </div>
        </div>

        <div>
          <!-- ASISTENCIA -->
          <div class="panel">
            <div class="panel-head"><span class="panel-title">Asistencia instructores</span></div>
            <div style="padding:8px 0">
              ${(insts||[]).map(i=>{
                const a = asistPorInst[i.id]||{pres:0,francos:0};
                const total = diasMes - a.francos;
                const p = total>0 ? Math.round((a.pres/total)*100) : 0;
                return `<div style="padding:10px 18px;border-bottom:1px solid var(--ice)">
                  <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                    <div style="font-size:13px;font-weight:500">${i.nombre}</div>
                    <div style="font-size:12px;font-weight:600;color:${barColor(p)}">${p}%</div>
                  </div>
                  <div style="height:5px;background:var(--ice);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${p}%;background:${barColor(p)};border-radius:3px"></div>
                  </div>
                  <div style="font-size:10px;color:var(--silver);margin-top:3px">${a.pres} pres. · ${a.francos} franco · ${total-a.pres} aus.</div>
                </div>`;
              }).join('')||'<div class="empty">Sin datos</div>'}
            </div>
          </div>

          <!-- RANKING -->
          <div class="panel">
            <div class="panel-head"><span class="panel-title">Ranking del mes</span></div>
            <div style="padding:8px 0">
              ${rankingMes.map((i,idx)=>`
                <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--ice)">
                  <div style="font-size:13px;font-weight:600;color:${idx===0?'#B45309':idx===1?'#6B7280':idx===2?'#92400E':'var(--silver)'};min-width:20px">${idx+1}</div>
                  <div style="font-size:13px;font-weight:500;flex:1">${i.nombre}</div>
                  <span style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:20px;background:${i.total>=7?'#E1F5EE':i.total>=5?'#FFF8E0':'#FFE8E8'};color:${i.total>=7?'#0F6E56':i.total>=5?'#92400E':'#991B1B'}">${i.total.toFixed(1)}</span>
                </div>`).join('')||'<div class="empty">Sin datos</div>'}
            </div>
          </div>
        </div>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--silver);margin-top:16px;padding:12px">
        Generado por Altus · ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}
      </div>
    </div>`;
}

async function descargarReportePDF() {
  const mes  = parseInt(document.getElementById('rep-mes').value);
  const anio = parseInt(document.getElementById('rep-anio').value);
  const nombreMes = new Date(anio, mes-1).toLocaleString('es-AR',{month:'long'});
  // Si no hay reporte en pantalla, generarlo primero
  if (!document.getElementById('rep-print')) await loadReporte();
  const el = document.getElementById('rep-print');
  if (!el) { toast('No se pudo generar el reporte','err'); return; }
  const btn = document.getElementById('btn-descargar-pdf');
  btn.textContent = 'Generando...'; btn.disabled = true;
  try {
    await html2pdf().set({
      margin: [10,10,10,10],
      filename: `Altus_Reporte_${nombreMes}_${anio}.pdf`,
      image: { type:'jpeg', quality:0.98 },
      html2canvas: { scale:2, useCORS:true },
      jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
    }).from(el).save();
    toast('PDF mensual descargado ✓');
    audit('reporte_descargado', null, null, { mes, anio });
  } catch(e) { toast('Error al generar PDF','err'); }
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v9M5 7l3 3 3-3"/><path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg> Descargar PDF';
  btn.disabled = false;
}

window.loadReporte = loadReporte;
window.descargarReportePDF = descargarReportePDF;


// ── RESUMEN DE TEMPORADA ─────────────────────────────────────
// Muestra el resumen en pantalla primero, igual que el reporte mensual
// El PDF se descarga desde lo que ya está renderizado

async function loadReporteTemporada() {
  const {data:cfg} = await sb.from('configuracion')
    .select('temporada_inicio,temporada_nombre').single();

  if (!cfg?.temporada_inicio) {
    document.getElementById('rep-contenido').innerHTML = '<div class="empty">Configurá el inicio de temporada desde el menú del avatar.</div>';
    return;
  }

  const desde = cfg.temporada_inicio;
  const hasta  = new Date().toISOString().split('T')[0];
  const nombreTemp = cfg.temporada_nombre || 'Temporada 2026';
  const hoy = new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'});
  const diasTotal = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;

  const cont = document.getElementById('rep-contenido-temporada');
  cont.innerHTML = '<div class="empty">Cargando temporada...</div>';

  const [{data:clases},{data:insts},{data:registrosAsist}] = await Promise.all([
    sb.from('clases').select('instructor_id, duracion_horas, disciplina, estado, instructores(nombre)')
      .gte('fecha', desde).lte('fecha', hasta),
    sb.from('instructores').select('id, nombre, creado_en, ranking_snapshot(*)')
      .eq('activo', true).order('nombre'),
    sb.from('asistencia').select('instructor_id, tipo')
      .gte('registrado_en', desde+'T00:00:00').lte('registrado_en', hasta+'T23:59:59'),
  ]);

  const clasesTotal = clases?.length || 0;
  const completadas = (clases||[]).filter(c=>c.estado==='completada').length;
  const canceladas  = (clases||[]).filter(c=>c.estado==='cancelada').length;
  const horasTotal  = (clases||[]).reduce((s,c)=>s+(parseFloat(c.duracion_horas)||0),0);

  const porDisc = {};
  (clases||[]).forEach(c => { if (c.disciplina) porDisc[c.disciplina] = (porDisc[c.disciplina]||0)+1; });

  const porInst = {};
  (clases||[]).forEach(c => {
    const nom = c.instructores?.nombre||'—';
    if (!porInst[nom]) porInst[nom] = {clases:0, horas:0};
    porInst[nom].clases++;
    porInst[nom].horas += parseFloat(c.duracion_horas)||0;
  });

  const asistMap = {};
  (registrosAsist||[]).forEach(r => {
    if (!asistMap[r.instructor_id]) asistMap[r.instructor_id] = {pres:0,francos:0};
    if (r.tipo==='presente') asistMap[r.instructor_id].pres++;
    if (r.tipo==='franco')   asistMap[r.instructor_id].francos++;
  });

  const barColor = p => p>=80?'#0F6E56':p>=50?'#F59E0B':'#EF4444';
  const pctN = (n,d) => d>0?Math.round((n/d)*100):0;

  const ranking = (insts||[]).map(i => {
    const snap = i.ranking_snapshot?.[i.ranking_snapshot.length-1];
    const a = asistMap[i.id]||{pres:0,francos:0};
    const altaDate = i.creado_en ? i.creado_en.split('T')[0] : desde;
    const desdeEf = altaDate > desde ? altaDate : desde;
    const diasInst = Math.max(0, Math.round((new Date(hasta)-new Date(desdeEf))/86400000)+1);
    const pct = pctN(a.pres, diasInst - a.francos);
    const d = porInst[i.nombre]||{clases:0,horas:0};
    return {nombre:i.nombre, id:i.id, total:snap?.puntaje_total||0,
            clases:d.clases, horas:d.horas, pct, color:barColor(pct)};
  }).sort((a,b)=>b.total-a.total);

  cont.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">✓</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:#065F46">Reporte generado correctamente</div>
          <div style="font-size:11px;color:#047857;margin-top:1px">Revisá el contenido y descargalo cuando estés listo</div>
        </div>
      </div>
    </div>
    <div id="rep-print-temporada" style="font-family:'DM Sans',sans-serif">
    <div class="panel" style="padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--silver);font-weight:500">Cerro Bayo — Villa La Angostura</div>
        <div style="font-size:20px;font-weight:600;color:var(--navy);margin-top:3px">${nombreTemp} · Resumen parcial</div>
        <div style="font-size:12px;color:var(--accent);margin-top:2px">Al ${hoy} · Desde ${new Date(desde+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'})}</div>
      </div>
    </div>
    <div class="stats" style="margin-bottom:16px">
      <div class="stat"><div class="stat-label">Clases totales</div><div class="stat-val">${clasesTotal}</div><div class="stat-sub">${completadas} completadas · ${canceladas} canceladas</div></div>
      <div class="stat"><div class="stat-label">Horas trabajadas</div><div class="stat-val">${horasTotal.toFixed(1)} hs</div><div class="stat-sub">en la temporada</div></div>
      <div class="stat"><div class="stat-label">Días transcurridos</div><div class="stat-val">${diasTotal}</div><div class="stat-sub">desde el inicio</div></div>
      <div class="stat"><div class="stat-label">Instructores</div><div class="stat-val">${insts?.length||0}</div><div class="stat-sub">activos</div></div>
    </div>
    <div class="grid-2">
      <div>
        <div class="panel"><div class="panel-head"><span class="panel-title">Clases por disciplina</span></div>
          <div style="padding:8px 0">
            ${Object.entries(porDisc).sort((a,b)=>b[1]-a[1]).map(([disc,n])=>`
              <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--ice)">
                <div style="font-size:13px;font-weight:500;min-width:120px">${disc}</div>
                <div style="flex:1;height:6px;background:var(--ice);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${pctN(n,clasesTotal)}%;background:var(--accent);border-radius:3px"></div>
                </div>
                <div style="font-size:13px;font-weight:600;min-width:30px;text-align:right">${n}</div>
              </div>`).join('')||'<div class="empty">Sin datos</div>'}
          </div>
        </div>
        <div class="panel"><div class="panel-head"><span class="panel-title">Horas por instructor</span></div>
          <div style="padding:8px 0">
            ${Object.entries(porInst).sort((a,b)=>b[1].horas-a[1].horas).map(([nom,d])=>`
              <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--ice)">
                <div style="font-size:13px;font-weight:500;flex:1">${nom}</div>
                <div style="font-size:12px;color:var(--muted)">${d.clases} clases</div>
                <div style="font-size:13px;font-weight:600;color:var(--navy);min-width:50px;text-align:right">${d.horas.toFixed(1)} hs</div>
              </div>`).join('')||'<div class="empty">Sin datos</div>'}
          </div>
        </div>
      </div>
      <div>
        <div class="panel"><div class="panel-head"><span class="panel-title">Ranking de la temporada</span></div>
          <div style="padding:8px 0">
            ${ranking.map((i,idx)=>`
              <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--ice)">
                <div style="font-size:13px;font-weight:600;color:${idx===0?'#B45309':idx===1?'#6B7280':idx===2?'#92400E':'var(--silver)'};min-width:20px">${idx+1}</div>
                <div style="font-size:13px;font-weight:500;flex:1">${i.nombre}</div>
                <div style="font-size:11px;color:var(--muted)">${i.clases} clases · ${i.horas.toFixed(1)} hs</div>
                <span style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:20px;background:${i.total>=7?'#E1F5EE':i.total>=5?'#FFF8E0':'#FFE8E8'};color:${i.total>=7?'#0F6E56':i.total>=5?'#92400E':'#991B1B'}">${i.total.toFixed(1)}</span>
              </div>`).join('')||'<div class="empty">Sin datos</div>'}
          </div>
        </div>
        <div class="panel"><div class="panel-head"><span class="panel-title">Asistencia de la temporada</span></div>
          <div style="padding:8px 0">
            ${ranking.map(i=>`
              <div style="padding:10px 18px;border-bottom:1px solid var(--ice)">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                  <div style="font-size:13px;font-weight:500">${i.nombre}</div>
                  <div style="font-size:12px;font-weight:600;color:${i.color}">${i.pct}%</div>
                </div>
                <div style="height:5px;background:var(--ice);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${i.pct}%;background:${i.color};border-radius:3px"></div>
                </div>
              </div>`).join('')||'<div class="empty">Sin datos</div>'}
          </div>
        </div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:var(--silver);margin-top:16px;padding:12px">
      Generado por Altus · ${hoy}
    </div>
  </div>`;
}

async function descargarReporteTemporada() {
  const btn = document.getElementById('btn-descargar-temporada');
  const originalHTML = btn.innerHTML;

  // Primero cargar el reporte de temporada en pantalla
  await loadReporteTemporada();

  const el = document.querySelector('#rep-panel-temporada #rep-print-temporada');
  if (!el) { toast('Error al generar el reporte', 'err'); return; }

  btn.textContent = 'Generando PDF...'; btn.disabled = true;

  try {
    await html2pdf().set({
      margin: [10,10,10,10],
      filename: `Altus_Temporada_${new Date().toISOString().split('T')[0]}.pdf`,
      image: {type:'jpeg', quality:0.98},
      html2canvas: {scale:2, useCORS:true},
      jsPDF: {unit:'mm', format:'a4', orientation:'portrait'}
    }).from(el).save();
    toast('PDF de temporada descargado ✓');
    try { audit('reporte_temporada_descargado', null, null, {}); } catch(e){}
  } catch(e) {
    console.error('Error PDF temporada:', e);
    toast('Error al generar el PDF', 'err');
  }

  btn.innerHTML = originalHTML;
  btn.disabled = false;
}

window.loadReporteTemporada = loadReporteTemporada;
window.descargarReporteTemporada = descargarReporteTemporada;
