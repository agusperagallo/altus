// api/estado-pistas.js
// Función serverless de Vercel: trae el "Parte Diario" (clima + estado de medios
// de elevación) de la web pública de Cerro Bayo y lo devuelve como JSON limpio.
//
// Por qué existe: cerrobayo.com.ar/montana/estado/ no tiene una API — es una
// página HTML pensada para mostrarse en un navegador. Esta función la lee del
// lado del servidor (evita el bloqueo de CORS que tendría el navegador del
// cliente) y devuelve solo los datos, ya parseados.
//
// IMPORTANTE — estado desconocido de los medios de elevación:
// El clima y los nombres/horarios de los medios están verificados letra por
// letra contra la página real. El "estado" (abierto/pausa/cerrado) de cada
// medio se muestra ahí con un ícono/color, no con texto — no tuve forma de
// inspeccionar ese HTML exacto para saber qué clase/atributo lo marca. El
// parser de abajo intenta detectarlo con patrones razonables (alt de imagen,
// nombre de clase CSS) pero, si no lo reconoce con confianza, devuelve
// estado: null en vez de arriesgar un "abierto" que en realidad esté cerrado.
// Si en algún momento me pasás el HTML real de una fila de la tabla de medios
// (botón derecho → Inspeccionar sobre el ícono de estado, copiar ese <td>),
// ajusto PARSEAR_ESTADO_MEDIO para que sea exacto.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://www.cerrobayo.com.ar/montana/estado/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VertexCB/1.0)' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'No se pudo consultar cerrobayo.com.ar', status: response.status });
    }

    const html = await response.text();
    const data = parsearParteDiario(html);

    // Cachear 5 minutos en el CDN de Vercel — el parte no cambia tan seguido
    // como para pegarle a la web del cerro en cada carga del dashboard.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);

  } catch (err) {
    console.error('[estado-pistas] Error:', err);
    return res.status(500).json({ error: 'Error interno al leer el parte diario' });
  }
}

function parsearParteDiario(html) {
  return {
    ultima_actualizacion: parsearUltimaActualizacion(html),
    estado_montana: parsearEstadoMontana(html),
    clima: parsearClima(html),
    medios: parsearMedios(html),
  };
}

function limpiarTexto(str) {
  return (str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&ordm;/g, 'º').replace(/&deg;/g, '°').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsearUltimaActualizacion(html) {
  const m = html.match(/Última actualización:\s*([\d/]+\s+[\d:]+\s*hs\.?)/i);
  return m ? m[1].trim() : null;
}

function parsearEstadoMontana(html) {
  // Estructura real: <p class="lead">Estado de la montaña:\n[texto libre]</p>
  // — el texto sigue directo después de los dos puntos, sin tag de cierre
  // en el medio, hasta que cierra el <p>.
  const m = html.match(/Estado de la montaña:\s*([\s\S]{0,1500}?)<\/p>/i);
  return m ? limpiarTexto(m[1]).slice(0, 800) : null;
}

function parsearClima(html) {
  // Tabla "Condiciones Climáticas". Estructura real confirmada:
  //   <tr><th>Base</th><td>1 &ordm;c</td><td>5 km/h</td><td>5 cm</td></tr>
  // La zona va en <th> (no en el primer <td> como se había asumido antes).
  const zonas = ['Base', 'Cota 1500', 'Cota 1810'];
  const resultado = [];

  const bloqueMatch = html.match(/Condiciones Climáticas[\s\S]{0,3000}?<\/table>/i);
  const bloque = bloqueMatch ? bloqueMatch[0] : '';

  const filas = bloque.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const fila of filas) {
    const nombreMatch = fila.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    const zonaTexto = nombreMatch ? limpiarTexto(nombreMatch[1]) : '';
    const zonaEncontrada = zonas.find(z => zonaTexto.toLowerCase() === z.toLowerCase());
    if (!zonaEncontrada) continue;

    const celdas = (fila.match(/<td[\s\S]*?<\/td>/gi) || []).map(c => limpiarTexto(c));
    resultado.push({
      zona: zonaEncontrada,
      temperatura: celdas[0] || null,
      viento: celdas[1] || null,
      nieve_acumulada: celdas[2] || null,
    });
  }
  return resultado;
}

function parsearMedios(html) {
  // Tabla(s) "Medios de Elevación". Estructura real confirmada contra el HTML
  // de la página (visto el 29/07/2026):
  //   <tr><th>Nombre</th><td class='estadoN'></td><td>Horario</td></tr>
  // El nombre va en <th>, no en <td> — y la celda de estado está VACÍA, el
  // estado se marca solo con la clase CSS (estado1/estado2/estado3), sin texto.
  const bloqueMatch = html.match(/Medios de Elevación[\s\S]{0,8000}?(?=Referencias)/i);
  const bloque = bloqueMatch ? bloqueMatch[0] : '';

  const filas = bloque.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const medios = [];

  for (const fila of filas) {
    const nombreMatch = fila.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!nombreMatch) continue; // fila de encabezado (usa <th></th><th>Estado</th>...) sin nombre real

    const nombre = limpiarTexto(nombreMatch[1]);
    if (!nombre) continue;

    const celdas = fila.match(/<td[\s\S]*?<\/td>/gi) || [];
    medios.push({
      nombre,
      estado: parsearEstadoMedio(celdas[0] || ''),
      horario: celdas[1] ? limpiarTexto(celdas[1]) : null,
    });
  }
  return medios;
}

// Mapeo confirmado contra el HTML real (y su leyenda "Referencias"):
//   estado1 = "El medio funciona con normalidad"              -> abierto
//   estado2 = "puede tener paradas temporales... o cerrarse"   -> pausa
//   estado3 = "esta cerrado por condiciones climáticas/técnicas" -> cerrado
function parsearEstadoMedio(celdaHtml) {
  const claseMatch = (celdaHtml || '').match(/class=['"]?estado(\d)['"]?/i);
  if (!claseMatch) return null; // no reconocido — no arriesgar
  switch (claseMatch[1]) {
    case '1': return 'abierto';
    case '2': return 'pausa';
    case '3': return 'cerrado';
    default:  return null;
  }
}
