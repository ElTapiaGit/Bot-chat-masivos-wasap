
const alertas = document.getElementById('alertas');
const qrDiv = document.getElementById('qr');
const estadoSesionH2 = document.getElementById('estado-sesion');
const cerrarSesionBtn = document.getElementById('cerrar-sesion');

let intervaloQR = null; // setInterval para recargar qr 

document.getElementById('limpiar-mensaje').addEventListener('click', () => {
    const textarea = document.getElementById('mensaje');
    textarea.value = ''; // Limpiar contenido
    textarea.focus(); // Poner cursor en el campo
});

// Función para mostrar alertas Bootstrap
function mostrarAlerta(mensaje, tipo = 'success', tiempo = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    const alerta = document.createElement('div');
    alerta.className = `toast align-items-center text-white bg-${tipo} border-0 show animate__animated animate__fadeInDown`;
    alerta.role = 'alert';
    alerta.ariaLive = 'assertive';
    alerta.ariaAtomic = 'true';

    alerta.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${mensaje}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastContainer.appendChild(alerta);
    //auto eliminar despues del tiempo
    setTimeout(() => alerta.remove(), tiempo);
}


// Cargar qr al cargar la pagina
async function cargarQR() {

    try {
        qrDiv.innerHTML = '<div class="spinner-border text-success" role="status"><span class="visually-hidden">Cargando QR...</span></div>';
        const res = await fetch('/qr');
        if (res.ok) {
            const data = await res.json();
            qrDiv.innerHTML = `<img src="${data.qr}" alt="QR" width="300">`;
            estadoSesionH2.textContent = '📱 Escanea el QR';
            qrDiv.style.display = 'block';
        } else {
            qrDiv.textContent = "Aún no hay QR disponible.";
        }
    } catch {
        qrDiv.innerHTML = "<div class='text-danger'>⚠️ Error al cargar QR. Verifica conexión con el servidor.</div>";
    } 
}

async function verificarSesion() {
    try {
        const res = await fetch('/estado-sesion');
        if (!res.ok) throw new Error('Servidor no respondio');
        const data = await res.json();

        if (data.activo) {
            estadoSesionH2.textContent = 'Sesion establecida correctamente';
            qrDiv.style.display = 'none'; // Oculta el QR
            cerrarSesionBtn.disabled = false;
    
            // Detener el intervalo de cargarQR si ya hay sesión
            if (intervaloQR) {
                clearInterval(intervaloQR);
                intervaloQR = null;
            }
        } else {
            estadoSesionH2.textContent = '📱 Escanea el QR';
            qrDiv.style.display = 'block'; // Muestra QR si no hay sesión
            cerrarSesionBtn.disabled = true;
    
            // Si no hay sesión, asegurarse que el QR se actualiza cada 5 seg
            if (!intervaloQR) {
                cargarQR();
                intervaloQR = setInterval(cargarQR, 5000);
            }
        }
    } catch {
        mostrarAlerta('⚠️ Error al verificar sesión. Comprueba tu conexión.', 'danger');
    }
}

//accion para el boton cerrar sesion
cerrarSesionBtn.addEventListener('click', async () => {
    if (confirm("¿Seguro que deseas cerrar la sesion de WhatsApp?")) {
        const res =await fetch('/logout', { method: 'POST' });
        const mensaje = await res.text();
        mostrarAlerta(mensaje, 'warning');

        // Reinicia el ciclo de QR
        cargarQR();
        if (!intervaloQR) {
            intervaloQR = setInterval(cargarQR, 5000);
        }
        verificarSesion();
    }
});


verificarSesion();
setInterval(verificarSesion, 3000); //refres cada 3 seg

// Enviar formulario
document.getElementById('formulario').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnEnviar = document.getElementById('btnEnviar');
    const btnEnviarTexto = document.getElementById('btnEnviarTexto');
    const btnEnviarSpinner = document.getElementById('btnEnviarSpinner');

    //desactiva el boton para mostrar carga
    btnEnviar.disabled = true;
    btnEnviarTexto.textContent = "Enviando...";
    btnEnviarSpinner.classList.remove('d-none');

    const formData = new FormData(e.target);
    mostrarAlerta('📤 Enviando mensajes...', 'info');

    try {
        const res = await fetch('/enviar', {
        method: 'POST',
        body: formData
        });
        
        const data = await res.text();

        const salidaProcesada = data
          .split('\n')
          .map(linea => {
              if (linea.includes('✅')) return `<span class="ok">${linea}</span>`;
              if (linea.includes('❌')) return `<span class="fail">${linea}</span>`;
              return linea;
          })
          .join('<br>');
        document.getElementById('salida').innerHTML = salidaProcesada;
        mostrarAlerta('✅ Mensajes enviados', 'success');
    } catch (err) {
        mostrarAlerta('❌ Error al enviar mensajes. Revisa tu archivo y conexión.', 'danger');
    } finally {
        //reactivar el boton
        btnEnviar.disabled = false;
        btnEnviarTexto.textContent = "Enviar";
        btnEnviarSpinner.classList.add('d-none');
    }
});
