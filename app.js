const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuración de multer para subir CSV
const upload = multer({ dest: 'uploads/' });

let qrCodeBase64 = ''; // guardamos el QR actual
let sesionActiva = false; // flag para verificar sesion activa
let client = null; // cliente WhatsApp

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Función para crear y configurar un nuevo cliente WhatsApp
function inicializarCliente() {
  client = new Client({
    authStrategy: new LocalAuth(), //{clientId: 'cliente-1'}pa +usuarios o +dispositivos
    puppeteer: { headless: true }
  });

  client.on('qr', async qr => {
    console.log('📲 Escanea este QR:');
    qrCodeBase64 = await qrcode.toDataURL(qr); // convierte el QR a imagen base64
    sesionActiva = false; // No hay sesión mientras el QR está activo
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado');
    sesionActiva = true;
  });

  client.on('authenticated', () => {
    console.log('🔒 Sesión autenticada');
    sesionActiva = true;
  });

  client.on('disconnected', () => {
    console.log('⚠️ WhatsApp desconectado');
    sesionActiva = false;

    // Intentar reiniciar
    inicializarCliente();
    //client.initialize(); //intenta conectarse
  });
}

inicializarCliente();
client.initialize();

// Endpoint para obtener el QR en la web
app.get('/qr', (req, res) => {
  if (!qrCodeBase64) {
    return res.status(503).send('QR aún no generado');
  }
  res.json({ qr: qrCodeBase64 });
});

// Endpoint para verificar si hay sesión activa
app.get('/estado-sesion', (req, res) => {
  res.json({ activo: sesionActiva });
});

// Endpoint para cerrar sesión
app.post('/logout', async (req, res) => {
  try {
    console.log('🔴 Cerrando sesion...');
    await client.destroy(); // Desconecta WhatsApp
    
    if (fs.existsSync('./.wwebjs_auth')) {
      fs.rmSync('./.wwebjs_auth', { recursive: true, force: true }); // Borra caché
    }
    qrCodeBase64 = '';
    sesionActiva = false;

    // Reinicializar cliente para escanear nuevo QR
    inicializarCliente();
    client.initialize();

    res.send('✅ Sesion cerrada. Escanea un nuevo QR.');
  } catch (error) {
    console.error('Error al cerrar sesion:', error);
    res.status(500).send('❌ No se pudo cerrar la sesion.');
  }
});

// Endpoint para enviar mensajes
app.post('/enviar', upload.single('archivo'), (req, res) => {
  const contactos = [];
  const archivo = req.file.path;
  const mensaje = req.body.mensaje;

  fs.createReadStream(archivo)
    .pipe(csv())
    .on('data', row => {
      if(!('telefono' in row)) {
        return console.log('El archivo no tinene la columna telefono...');;
      }
      const numero = row.telefono?.trim(); // trim elimina espacios vacíos
      if (numero) {
        contactos.push(numero);
      }
    })
    .on('end', async () => {
      let salida = '';

      function dividirEnBloques(array, tamano) {
        const bloques = [];
        for (let i=0; i<array.length; i += tamano)  {
          bloques.push(array.slice(i, i + tamano));
        }
        return bloques;
      }
      //para pausar el envio
      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      const bloques = dividirEnBloques(contactos, 1); //dividir en bloques de 50

      for (let i=0; i<bloques.length; i++) {
        const bloque = bloques[i];
        salida += `\n Enviando bloque ${i + 1}/${bloques.length}...\n`;

        for (const numero of bloque) {
          const numeroWhats = numero.replace(/\D/g, '') + '@c.us';
          try {
            await client.sendMessage(numeroWhats, mensaje);
            salida += `✅ Enviado a ${numero}\n`;
          } catch (err) {
            //mejorar el mensaje de error
            console.error(`Error tecnico con ${numero}:`, err);
            //Esto toma solo la primera línea del error (sin las líneas del stacktrace).
            const mensajeError = String(err?.message || err).split('\n')[0].toLowerCase();

            let errorUsuario = "numero invalido o no tiene WhatsApp";
            if (mensajeError.includes('invalid wid')) {
              errorUsuario = "numero invalido o no registrado en WhatsApp";
            } else if (mensajeError.includes('not a valid')) {
              errorUsuario = "formato de numero incorrecto";
            } else if (mensajeError.includes('blocked')) {
              errorUsuario = "numero bloqueado o no disponible";
            }
            salida +=  `❌ Error con ${numero}: ${errorUsuario}\n`;
          }
        }

        if (i < bloques.length - 1) {
          salida += `⏳ Esperando 1 minuto antes de continuar con el siguiente bloque...\n`;
          await sleep(5000); // Espera 60,000 ms = 1 minuto
        }
      }
      fs.unlinkSync(archivo); // Borra el archivo subido después de usarlo
      res.send(salida);
    });
});

app.listen(PORT, () => {
  console.log(`Servidor web iniciado en http://localhost:${PORT}`);
});
