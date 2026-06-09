/* ================================================================
   script.js — Sistema de Administración de Cementerio
================================================================ */

const SUPABASE_URL = "https://edpdfxbszdhjrzxfontl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkcGRmeGJzemRoanJ6eGZvbnRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzQ3ODgsImV4cCI6MjA5NTE1MDc4OH0.MYiYXyJ5zSnx7DiN22ycU7h_0NEQz5rl_17REKVn5JQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


/* ================================================================
   2. LOGIN Y SESIÓN
================================================================ */

async function iniciarSesion() {
  const email      = document.getElementById("username").value.trim();
  const contrasena = document.getElementById("password").value.trim();
  const errorMsg   = document.getElementById("login-error");
  const btnLogin   = document.querySelector(".btn-login");

  btnLogin.textContent = "Iniciando sesion...";
  btnLogin.disabled    = true;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email:    email,
    password: contrasena
  });

  btnLogin.textContent = "Iniciar sesion";
  btnLogin.disabled    = false;

  if (error) {
    errorMsg.classList.remove("hidden");
    errorMsg.textContent = "Usuario o contrasena incorrectos.";
    return;
  }

  errorMsg.classList.add("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("topbar-username").textContent = data.user.email;

  await cargarInicio();
  await generarMapa();
  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", function () {
  const inputPass = document.getElementById("password");
  if (inputPass) {
    inputPass.addEventListener("keydown", function (e) {
      if (e.key === "Enter") iniciarSesion();
    });
  }
});

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  lucide.createIcons();
}

async function verificarSesionExistente() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("topbar-username").textContent = session.user.email;
    await cargarInicio();
    await generarMapa();
    lucide.createIcons();
  }
}


/* ================================================================
   3. NAVEGACION
================================================================ */

async function mostrarSeccion(nombreSeccion, itemClicado) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const seccion = document.getElementById("sec-" + nombreSeccion);
  if (seccion) seccion.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(i => {
    i.classList.remove("active");
    i.removeAttribute("aria-current");
  });
  if (itemClicado) {
    itemClicado.classList.add("active");
    itemClicado.setAttribute("aria-current", "page");
  }

  const titulos = {
    inicio: "Inicio", difuntos: "Difuntos", responsables: "Responsables",
    parcelas: "Parcelas", mapa: "Mapa", movimientos: "Movimientos", buscar: "Buscar"
  };
  document.getElementById("page-title").textContent = titulos[nombreSeccion] || nombreSeccion;

  if (nombreSeccion === "difuntos")     await cargarDifuntos();
  if (nombreSeccion === "responsables") await cargarResponsables();
  if (nombreSeccion === "parcelas")     await cargarParcelas();
  if (nombreSeccion === "movimientos")  await cargarMovimientos();
  if (nombreSeccion === "mapa")         await generarMapa();

  return false;
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}


/* ================================================================
   4A. INICIO
   Columna correcta: difuntos.nombres (plural)
   Join: difuntos.parcela_id → parcelas.id → zonas.id
================================================================ */

async function cargarInicio() {
  const { count: totalParcelas } = await supabaseClient
    .from('parcelas').select('*', { count: 'exact', head: true });

  const { count: ocupadas } = await supabaseClient
    .from('parcelas').select('*', { count: 'exact', head: true })
    .eq('estado', 'ocupada');

  const { count: totalDifuntos } = await supabaseClient
    .from('difuntos').select('*', { count: 'exact', head: true });

  const disponibles = (totalParcelas || 0) - (ocupadas || 0);

  const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  s("stat-total",       totalParcelas || 0);
  s("stat-ocupadas",    ocupadas      || 0);
  s("stat-disponibles", disponibles);
  s("stat-difuntos",    totalDifuntos || 0);

  const { data: ultimos, error } = await supabaseClient
    .from('difuntos')
    .select('nombres, apellido, fecha_defuncion, parcelas(codigo, zonas(nombre))')
    .order('registrado_en', { ascending: false })
    .limit(5);

  if (error) { console.error("cargarInicio:", error.message); return; }

  const tbody = document.getElementById("tabla-inicio-body");
  if (tbody && ultimos) {
    tbody.innerHTML = ultimos.map((d, i) => `
      <tr>
        <td>${String(i + 1).padStart(3, '0')}</td>
        <td>${d.nombres} ${d.apellido}</td>
        <td>${d.parcelas?.zonas?.nombre || '-'}</td>
        <td>${d.parcelas?.codigo || '-'}</td>
        <td>${formatearFecha(d.fecha_defuncion)}</td>
        <td><span class="badge red">Ocupada</span></td>
      </tr>
    `).join('');
  }
}


/* ================================================================
   4B. DIFUNTOS
   Columna correcta: nombres (plural)
   Join desde difuntos hacia parcelas (FK vive en difuntos.parcela_id)
================================================================ */

async function cargarDifuntos() {
  mostrarCargando("tabla-difuntos-body", 7);

  const { data, error } = await supabaseClient
    .from('difuntos')
    .select('id, nombres, apellido, ci, fecha_nacimiento, fecha_defuncion, parcela_id, parcelas(codigo, zonas(nombre))')
    .order('registrado_en', { ascending: false });

  if (error) { console.error("cargarDifuntos:", error.message); return; }

  const tbody = document.getElementById("tabla-difuntos-body");
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--color-text-muted)">Sin registros aun</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((d, i) => `
    <tr>
      <td>${String(i + 1).padStart(3, '0')}</td>
      <td>${d.nombres} ${d.apellido}</td>
      <td>${d.ci || '-'}</td>
      <td>${formatearFecha(d.fecha_nacimiento)}</td>
      <td>${formatearFecha(d.fecha_defuncion)}</td>
      <td>${d.parcelas?.codigo || '-'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-icon" title="Ver" onclick="verDifunto(${d.id})">
          <i data-lucide="eye"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar" onclick="eliminarDifunto(${d.id}, ${d.parcela_id || null})">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}


/* ================================================================
   ELIMINAR DIFUNTO
   1. Pide confirmación
   2. Elimina el responsable asociado (CASCADE lo hace automático
      si configuraste ON DELETE CASCADE, si no lo hacemos manual)
   3. Elimina el difunto
   4. Libera la parcela → estado = 'disponible'
   5. Registra movimiento de baja
================================================================ */

async function eliminarDifunto(difuntoId, parcelaId) {
  const confirmado = confirm("¿Estás seguro de que querés eliminar este difunto y liberar su parcela? Esta acción no se puede deshacer.");
  if (!confirmado) return;

  // Paso 1: eliminar responsable manualmente por si no hay CASCADE configurado
  await supabaseClient
    .from('responsables')
    .delete()
    .eq('difunto_id', difuntoId);

  // Paso 2: eliminar el difunto
  const { error: errorDelete } = await supabaseClient
    .from('difuntos')
    .delete()
    .eq('id', difuntoId);

  if (errorDelete) {
    alert("Error al eliminar: " + errorDelete.message);
    return;
  }

  // Paso 3: liberar la parcela
  if (parcelaId) {
    await supabaseClient
      .from('parcelas')
      .update({ estado: 'disponible' })
      .eq('id', parcelaId);

    // Paso 4: registrar movimiento de baja
    await supabaseClient.from('movimientos').insert([{
      tipo:        'baja',
      descripcion: 'Difunto eliminado del sistema. Parcela liberada.',
      parcela_id:  parcelaId
    }]);
  }

  // Paso 5: refrescar vistas
 await Promise.all([cargarInicio(), cargarDifuntos(), generarMapa()]); 
}


/* ================================================================
   4C. RESPONSABLES
   Join: responsables.difunto_id → difuntos.id
================================================================ */

async function cargarResponsables() {
  mostrarCargando("tabla-responsables-body", 9);

  const { data, error } = await supabaseClient
    .from('responsables')
    .select('id, nombre, apellido, ci, parentesco, telefono, email, direccion, registrado_en, difuntos(nombres, apellido)')
    .order('registrado_en', { ascending: false });

  if (error) { console.error("cargarResponsables:", error.message); return; }

  const tbody = document.getElementById("tabla-responsables-body");
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--color-text-muted)">Sin responsables registrados aún</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td>${String(i + 1).padStart(3, '0')}</td>
      <td>${r.nombre} ${r.apellido}</td>
      <td>${r.ci || '-'}</td>
      <td>${r.parentesco || '-'}</td>
      <td>${r.difuntos ? r.difuntos.nombres + ' ' + r.difuntos.apellido : '-'}</td>
      <td>${r.telefono || '-'}</td>
      <td>${r.email || '-'}</td>
      <td>${r.direccion || '-'}</td>
      <td>${formatearFecha(r.registrado_en)}</td>
    </tr>
  `).join('');
}


/* ================================================================
   4D. PARCELAS
   No hay FK de parcelas → difuntos, así que consultamos difuntos
   y agrupamos por parcela en JS.
================================================================ */

async function cargarParcelas() {
  mostrarCargando("tabla-parcelas-body", 4);

  // Traemos parcelas con zona
  const { data: parcelas, error: errorParcelas } = await supabaseClient
    .from('parcelas')
    .select('id, codigo, estado, zonas(nombre)')
    .order('codigo');

  // Traemos difuntos con su parcela_id para hacer el match
  const { data: difuntos, error: errorDifuntos } = await supabaseClient
    .from('difuntos')
    .select('nombres, apellido, parcela_id');

  if (errorParcelas) { console.error("cargarParcelas:", errorParcelas.message); return; }

  const tbody = document.getElementById("tabla-parcelas-body");
  if (!tbody || !parcelas) return;

  // Mapa rápido: parcela_id → nombre del difunto

  const difuntosPorParcela = {};
  (difuntos || []).forEach(d => {
    if (d.parcela_id) difuntosPorParcela[d.parcela_id] = d.nombres + ' ' + d.apellido;
  });

  tbody.innerHTML = parcelas.map(p => {
    const difunto = difuntosPorParcela[p.id] || '-';
    const badge   = p.estado === 'ocupada'
      ? '<span class="badge red">Ocupada</span>'
      : '<span class="badge green">Disponible</span>';
    return `<tr>
      <td>${p.codigo}</td>
      <td>${p.zonas?.nombre || '-'}</td>
      <td>${badge}</td>
      <td>${difunto}</td>
    </tr>`;
  }).join('');
}


/* ================================================================
   4E. MOVIMIENTOS
================================================================ */

async function cargarMovimientos() {
  mostrarCargando("tabla-mov-body", 5);

  const { data, error } = await supabaseClient
    .from('movimientos')
    .select('tipo, descripcion, fecha, parcelas(codigo)')
    .order('fecha', { ascending: false })
    .limit(50);

  if (error) { console.error("cargarMovimientos:", error.message); return; }
  if (!data) return;

  const tbody = document.getElementById("tabla-mov-body");
  tbody.innerHTML = data.map((m, i) => `
    <tr>
      <td>${String(i + 1).padStart(3, '0')}</td>
      <td><span class="badge blue">${m.tipo}</span></td>
      <td>${m.descripcion || '-'}</td>
      <td>${m.parcelas?.codigo || '-'}</td>
      <td>${formatearFecha(m.fecha)}</td>
    </tr>
  `).join('');
}


/* ================================================================
   5. MAPA INTERACTIVO
   Consulta parcelas con zonas, y difuntos por separado.
   Match en JS por parcela_id.
================================================================ */

async function generarMapa() {
  const { data: parcelas, error: errorParcelas } = await supabaseClient
    .from('parcelas')
    .select('id, codigo, estado, fila, columna, zonas(nombre)')
    .order('fila')
    .order('columna');

  const { data: difuntos, error: errorDifuntos } = await supabaseClient
    .from('difuntos')
    .select('nombres, apellido, fecha_defuncion, parcela_id, responsables(nombre, apellido, telefono)');

  if (errorParcelas) {
    console.error("generarMapa parcelas:", errorParcelas.message);
    ['A','B','C','D'].forEach(z => {
      const el = document.getElementById("zona-" + z);
      if (el) el.innerHTML = '<div style="padding:8px;color:red;font-size:0.75rem">Error al cargar</div>';
    });
    return;
  }

  // Mapa rápido: parcela_id → difunto completo
  const difuntosPorParcela = {};
  (difuntos || []).forEach(d => {
    if (d.parcela_id) difuntosPorParcela[d.parcela_id] = d;
  });

  // Agrupar parcelas por zona
  const porZona = { A: [], B: [], C: [], D: [] };
  (parcelas || []).forEach(p => {
    const zona = p.zonas?.nombre;
    if (zona && porZona[zona]) porZona[zona].push(p);
  });

  ['A', 'B', 'C', 'D'].forEach(zona => {
    const contenedor = document.getElementById("zona-" + zona);
    if (!contenedor) return;

    const lista = porZona[zona];
    if (lista.length === 0) {
      contenedor.innerHTML = '<div style="padding:8px;font-size:0.75rem;color:#94a3b8">Sin parcelas</div>';
      return;
    }

    contenedor.innerHTML = '';
    lista.forEach(parcela => {
      // Enriquecer parcela con su difunto para el panel de info
      parcela._difunto = difuntosPorParcela[parcela.id] || null;

      const casilla = document.createElement('div');
      casilla.classList.add('parcela-cell', parcela.estado === 'ocupada' ? 'occupied' : 'available');
      casilla.textContent = parcela.codigo.split('-')[1];
      casilla.title       = parcela.codigo;
      casilla.addEventListener('click', () => {
        mostrarInfoParcela(parcela);
        resaltarCasilla(casilla);
      });
      contenedor.appendChild(casilla);
    });
  });
}

function resaltarCasilla(seleccionada) {
  document.querySelectorAll('.parcela-cell').forEach(c => c.classList.remove('selected'));
  seleccionada.classList.add('selected');
}

function mostrarInfoParcela(parcela) {
  document.getElementById("info-titulo").textContent = "Parcela: " + parcela.codigo;

  const estadoEl = document.getElementById("info-estado");
  estadoEl.textContent = parcela.estado === 'disponible' ? "Disponible" : "Ocupada";
  estadoEl.style.color = parcela.estado === 'disponible' ? "#16a34a" : "#b91c1c";

  const d = parcela._difunto || null;
  const r = d?.responsables || null;

  document.getElementById("info-zona").textContent            = parcela.zonas?.nombre ? "Zona " + parcela.zonas.nombre : '-';
  document.getElementById("info-difunto").textContent         = d ? d.nombres + ' ' + d.apellido : "Sin asignar";
  document.getElementById("info-fecha").textContent           = d ? formatearFecha(d.fecha_defuncion) : "-";
  document.getElementById("info-responsable").textContent     = r ? r.nombre + ' ' + r.apellido : "-";
  document.getElementById("info-responsable-tel").textContent = r?.telefono || "-";

  document.getElementById("info-panel").classList.remove("hidden");
}

function cerrarPanel() {
  document.getElementById("info-panel").classList.add("hidden");
  document.querySelectorAll('.parcela-cell').forEach(c => c.classList.remove('selected'));
}


/* ================================================================
   6. BUSCADOR con debounce
================================================================ */

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function buscar(termino) {
  const contenedor = document.getElementById("search-results");

  if (!termino || termino.trim().length < 2) {
    contenedor.innerHTML = '<p class="search-hint">Escribi al menos 2 caracteres...</p>';
    return;
  }

  contenedor.innerHTML = '<p class="search-hint">Buscando...</p>';

  const { data: difuntos } = await supabaseClient
    .from('difuntos')
    .select('id, nombres, apellido, ci, parcelas(codigo)')
    .or(`nombres.ilike.%${termino}%,apellido.ilike.%${termino}%,ci.ilike.%${termino}%`)
    .limit(20);

  const { data: responsables } = await supabaseClient
    .from('responsables')
    .select('nombre, apellido, ci, parentesco, telefono, difuntos(nombres, apellido)')
    .or(`nombre.ilike.%${termino}%,apellido.ilike.%${termino}%,ci.ilike.%${termino}%`)
    .limit(10);

  const hayDifuntos     = difuntos     && difuntos.length > 0;
  const hayResponsables = responsables && responsables.length > 0;

  if (!hayDifuntos && !hayResponsables) {
    contenedor.innerHTML = `<p class="search-no-results">Sin resultados para: <strong>${termino}</strong></p>`;
    return;
  }

  let html = '';
  if (hayDifuntos) {
    html += '<p class="search-section-label">Difuntos</p>';
    html += difuntos.map(d => `
      <div class="search-result-item">
        <strong>${d.nombres} ${d.apellido}</strong>
        &nbsp;·&nbsp; CI: ${d.ci || '-'}
        &nbsp;·&nbsp; Parcela: <strong>${d.parcelas?.codigo || '-'}</strong>
      </div>`).join('');
  }
  if (hayResponsables) {
    html += '<p class="search-section-label">Responsables</p>';
    html += responsables.map(r => `
      <div class="search-result-item">
        <strong>${r.nombre} ${r.apellido}</strong>
        &nbsp;·&nbsp; CI: ${r.ci || '-'}
        &nbsp;·&nbsp; ${r.parentesco || 'Sin parentesco'}
        &nbsp;·&nbsp; Tel: ${r.telefono || '-'}
        &nbsp;·&nbsp; Difunto: <strong>${r.difuntos ? r.difuntos.nombres + ' ' + r.difuntos.apellido : '-'}</strong>
      </div>`).join('');
  }

  contenedor.innerHTML = html;
}

const debounceBuscar = debounce(buscar, 400);


/* ================================================================
   7. REGISTRAR DIFUNTO + RESPONSABLE
   Columna correcta: nombres (plural)
   No existe causa_defuncion en la tabla — removido
================================================================ */

async function registrarDifunto(evento) {
  evento.preventDefault();

  const datosDifunto = {
    nombres:          document.getElementById("f-nombre").value.trim(),
    apellido:         document.getElementById("f-apellido").value.trim(),
    ci:               document.getElementById("f-ci").value.trim() || null,
    fecha_nacimiento: document.getElementById("f-nacimiento").value || null,
    fecha_defuncion:  document.getElementById("f-defuncion").value,
    parcela_id:       parseInt(document.getElementById("f-parcela").value)
  };

  if (!datosDifunto.nombres || !datosDifunto.apellido || !datosDifunto.fecha_defuncion || !datosDifunto.parcela_id) {
    alert("Completá los campos obligatorios.");
    return;
  }

  const { data: difunto, error: errorDifunto } = await supabaseClient
    .from('difuntos')
    .insert([datosDifunto])
    .select()
    .single();

  if (errorDifunto) {
    alert("Error al guardar el difunto: " + errorDifunto.message);
    return;
  }

  await supabaseClient.from('parcelas').update({ estado: 'ocupada' }).eq('id', datosDifunto.parcela_id);

  await supabaseClient.from('movimientos').insert([{
    tipo:        'ingreso',
    descripcion: 'Registro de ' + datosDifunto.nombres + ' ' + datosDifunto.apellido,
    difunto_id:  difunto.id,
    parcela_id:  datosDifunto.parcela_id
  }]);

  const respNombre = document.getElementById("f-resp-nombre").value.trim();
  if (respNombre) {
    const { error: errorResp } = await supabaseClient.from('responsables').insert([{
      difunto_id: difunto.id,
      nombre:     respNombre,
      apellido:   document.getElementById("f-resp-apellido").value.trim() || '',
      ci:         document.getElementById("f-resp-ci").value.trim()        || null,
      parentesco: document.getElementById("f-resp-parentesco").value.trim() || null,
      telefono:   document.getElementById("f-resp-telefono").value.trim()  || null,
      email:      document.getElementById("f-resp-email").value.trim()     || null,
      direccion:  document.getElementById("f-resp-direccion").value.trim() || null,
    }]);
    if (errorResp) {
      console.error("Error responsable:", errorResp.message);
      alert("Difunto guardado, pero error en responsable: " + errorResp.message);
    }
  }

  cerrarModal();
  await cargarInicio();
  await cargarDifuntos();
  await generarMapa();
}

async function cargarParcelasDisponibles() {
  const { data } = await supabaseClient
    .from('parcelas')
    .select('id, codigo, zonas(nombre)')
    .eq('estado', 'disponible')
    .order('codigo');

  const selector = document.getElementById("f-parcela");
  if (!selector || !data) return;

  selector.innerHTML = '<option value="">Seleccioná una parcela</option>' +
    data.map(p => `<option value="${p.id}">${p.codigo} (Zona ${p.zonas?.nombre || '-'})</option>`).join('');
}

function abrirModal() {
  const modal = document.getElementById("modal-difunto");
  modal.classList.remove("hidden");
  modal.classList.add("modal-visible");
  cargarParcelasDisponibles();
  lucide.createIcons();
}

function cerrarModal() {
  const modal = document.getElementById("modal-difunto");
  modal.classList.add("hidden");
  modal.classList.remove("modal-visible");
  document.getElementById("form-difunto").reset();
}


/* ================================================================
   8. MODAL RESPONSABLE INDEPENDIENTE
================================================================ */

async function abrirModalResponsable() {
  const modal = document.getElementById("modal-responsable");
  modal.classList.remove("hidden");
  modal.classList.add("modal-visible");
  await cargarDifuntosParaResponsable();
  lucide.createIcons();
}

function cerrarModalResponsable() {
  const modal = document.getElementById("modal-responsable");
  modal.classList.add("hidden");
  modal.classList.remove("modal-visible");
  document.getElementById("form-responsable").reset();
}

async function cargarDifuntosParaResponsable() {
  const { data: yaAsignados } = await supabaseClient
    .from('responsables').select('difunto_id');

  const idsOcupados = (yaAsignados || []).map(r => r.difunto_id);

  let query = supabaseClient
    .from('difuntos')
    .select('id, nombres, apellido')
    .order('apellido');

  if (idsOcupados.length > 0) {
    query = query.not('id', 'in', '(' + idsOcupados.join(',') + ')');
  }

  const { data: difuntos } = await query;
  const selector = document.getElementById("fr-difunto");
  if (!selector) return;

  if (!difuntos || difuntos.length === 0) {
    selector.innerHTML = '<option value="">Todos los difuntos ya tienen responsable</option>';
    return;
  }

  selector.innerHTML = '<option value="">Seleccioná un difunto</option>' +
    difuntos.map(d => `<option value="${d.id}">${d.apellido}, ${d.nombres}</option>`).join('');
}

async function registrarResponsable(evento) {
  evento.preventDefault();

  const difuntoId = parseInt(document.getElementById("fr-difunto").value);
  const nombre    = document.getElementById("fr-nombre").value.trim();
  const apellido  = document.getElementById("fr-apellido").value.trim();

  if (!difuntoId || !nombre || !apellido) {
    alert("Completá los campos obligatorios: difunto, nombre y apellido.");
    return;
  }

  const { error } = await supabaseClient.from('responsables').insert([{
    difunto_id: difuntoId,
    nombre,
    apellido,
    ci:         document.getElementById("fr-ci").value.trim()         || null,
    parentesco: document.getElementById("fr-parentesco").value.trim() || null,
    telefono:   document.getElementById("fr-telefono").value.trim()   || null,
    email:      document.getElementById("fr-email").value.trim()      || null,
    direccion:  document.getElementById("fr-direccion").value.trim()  || null,
  }]);

  if (error) { alert("Error al guardar el responsable: " + error.message); return; }

  cerrarModalResponsable();
  await cargarResponsables();
}


/* ================================================================
   UTILIDADES
================================================================ */

function formatearFecha(fecha) {
  if (!fecha) return '-';
  const f = new Date(fecha + (fecha.includes('T') ? '' : 'T00:00:00'));
  return f.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mostrarCargando(tbodyId, columnas) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${columnas}" style="text-align:center;padding:20px;color:var(--color-text-muted)">Cargando datos...</td></tr>`;
}

async function verDifunto(id) {
  const { data, error } = await supabaseClient
    .from('difuntos')
    .select('nombres, apellido, ci, fecha_nacimiento, fecha_defuncion, parcelas(codigo), responsables(nombre, apellido, telefono)')
    .eq('id', id)
    .single();

  if (error || !data) { console.error("verDifunto:", error?.message); return; }

  const r = data.responsables || null;

  document.getElementById("ver-nombre-completo").textContent = data.nombres + ' ' + data.apellido;
  document.getElementById("ver-ci").textContent          = data.ci || '—';
  document.getElementById("ver-nacimiento").textContent  = formatearFecha(data.fecha_nacimiento);
  document.getElementById("ver-defuncion").textContent   = formatearFecha(data.fecha_defuncion);
  document.getElementById("ver-parcela").textContent     = data.parcelas?.codigo || '—';
  document.getElementById("ver-resp-nombre").textContent = r ? r.nombre + ' ' + r.apellido : '—';
  document.getElementById("ver-resp-tel").textContent    = r?.telefono || '—';

  const modal = document.getElementById("modal-ver-difunto");
  modal.classList.remove("hidden");
  modal.classList.add("modal-visible");
  lucide.createIcons();
}

function cerrarModalVerBtn() {
  const modal = document.getElementById("modal-ver-difunto");
  modal.classList.add("hidden");
  modal.classList.remove("modal-visible");
}

// Cierra al hacer clic fuera del contenido
function cerrarModalVer(event) {
  if (event.target === document.getElementById("modal-ver-difunto")) {
    cerrarModalVerBtn();
  }
}

/* ================================================================
   INICIALIZACIÓN
================================================================ */

document.addEventListener("DOMContentLoaded", async function () {
  console.log("Sistema de Cementerio - conectando con Supabase...");
  await verificarSesionExistente();
});