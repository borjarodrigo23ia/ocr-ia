# Doligestion OCR - Procesamiento Automático de Facturas

Una aplicación Next.js que utiliza IA (Gemini) para extraer datos de facturas (PDF, JPG, PNG) e insertarlos automáticamente en Dolibarr ERP.

## 🚀 Características

- **OCR con IA Avanzada**: Utiliza Gemini AI para extraer datos precisos de facturas
- **Verificación Automática**: Comprueba la existencia de proveedores y productos en Dolibarr
- **Edición Inteligente**: Formularios editables con validación y generación de referencias únicas
- **Creación Selectiva**: Botones para crear proveedores y productos individualmente
- **Integración Completa con Dolibarr**: Creación automática de proveedores, productos y facturas
- **Gestión Inteligente de Stock**: Actualización automática de inventario y precios
- **Historial Completo**: Tabla de facturas procesadas con persistencia local
- **Interfaz Minimalista**: Diseño limpio con drag & drop para archivos
- **Procesamiento por Lotes**: Procesa múltiples archivos simultáneamente
- **Validación Robusta**: Verificación de datos antes de insertar en Dolibarr

## 📋 Requisitos Previos

- Node.js 18+ 
- Cuenta de Google Cloud con API de Gemini habilitada
- Instancia de Dolibarr con API REST habilitada
- Clave API de Dolibarr

## 🛠 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd ocr-onna-dolibarr
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   
   Crear archivo `.env.local` en la raíz del proyecto:
   ```env
   # Gemini AI Configuration
   GOOGLE_API_KEY=tu_clave_api_de_gemini
   
   # Dolibarr API Configuration
   DOLIBARR_BASE_URL=https://tu-dolibarr.com/api/index.php
   DOLIBARR_API_KEY=tu_clave_api_de_dolibarr
   ```

4. **Ejecutar en desarrollo**
   ```bash
   npm run dev
   ```

5. **Acceder a la aplicación**
   
   Abrir [http://localhost:3000](http://localhost:3000) en el navegador

## ⚙️ Configuración

### Gemini AI
1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Habilitar la API de Gemini
3. Crear una clave API
4. Añadir la clave al archivo `.env.local`

### Dolibarr
1. Activar el módulo API REST en Dolibarr
2. Crear un usuario con permisos de API
3. Generar una clave API para el usuario
4. Configurar la URL base y clave en `.env.local`

## 📱 Uso

1. **Cargar Archivos**: Arrastra o selecciona archivos PDF, JPG o PNG
2. **Extracción Automática**: La IA extrae datos y verifica existencia en Dolibarr
3. **Revisar y Editar**: 
   - Revisa los datos extraídos
   - Edita campos si es necesario
   - Completa referencias únicas automáticas
   - Valida la información
4. **Crear Elementos**: 
   - Crea proveedores y productos individualmente si no existen
   - Visualiza el estado de cada elemento
5. **Procesar**: Confirma y envía todo a Dolibarr automáticamente:
   - Crea el proveedor si no existe
   - Crea productos si no existen
   - Asocia productos al proveedor
   - Crea la factura de proveedor
   - Actualiza precios de compra
   - Incrementa el stock
6. **Historial**: Las facturas procesadas se mueven automáticamente al historial

## 🏗 Arquitectura

```
src/
├── app/
│   ├── api/process/          # API route para procesamiento
│   ├── globals.css           # Estilos globales
│   ├── layout.tsx            # Layout principal
│   └── page.tsx              # Página principal
├── components/
│   └── FileDropzone.tsx      # Componente drag & drop
├── lib/
│   ├── dolibarr.ts          # Cliente API Dolibarr
│   ├── gemini.ts            # Configuración Gemini AI
│   └── processor.ts         # Lógica principal de procesamiento
└── types/
    └── index.ts             # Tipos TypeScript
```

## 🔄 Flujo de Procesamiento

1. **Extracción OCR**: Gemini AI analiza el archivo y extrae datos estructurados
2. **Verificación Automática**: Comprueba existencia de proveedores y productos en Dolibarr
3. **Revisión y Edición**: Permite editar datos, completar campos faltantes y generar referencias
4. **Creación Selectiva**: Opción de crear elementos individualmente antes del procesamiento final
5. **Validación**: Se verifican los datos editados y referencias únicas
6. **Proveedor**: Se busca o crea el proveedor en Dolibarr
7. **Productos**: Se buscan o crean los productos en Dolibarr
8. **Factura**: Se crea la factura de proveedor con las líneas
9. **Stock**: Se actualiza el inventario y precios de compra
10. **Historial**: Se mueve a la tabla de facturas procesadas

## 📊 Datos Extraídos

### Proveedor
- Nombre
- Email
- Teléfono
- Dirección completa
- NIF/CIF

### Factura
- Número de factura
- Fecha de emisión
- Fecha de vencimiento
- Totales (con/sin IVA)

### Productos
- Descripción
- Código de producto (si existe)
- Cantidad
- Precio unitario
- Tipo de IVA

## 🚀 Despliegue

### Vercel (Recomendado)
```bash
npm run build
vercel --prod
```

### Docker
```bash
docker build -t ocr-dolibarr .
docker run -p 3000:3000 --env-file .env.local ocr-dolibarr
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit los cambios (`git commit -m 'Añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abrir un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Para problemas o preguntas:
- Abrir un [Issue](../../issues)
- Contactar al equipo de desarrollo

## 🔧 Solución de Problemas

### Error de conexión con Dolibarr
- Verificar que la URL y clave API sean correctas
- Comprobar que el módulo API REST esté habilitado
- Revisar permisos del usuario de API

### Error de OCR con Gemini
- Verificar que la clave API de Google sea válida
- Comprobar que el archivo sea un formato válido
- Revisar límites de uso de la API

### Errores de procesamiento
- Revisar logs en la consola del navegador
- Verificar formato y calidad de las imágenes
- Comprobar que los datos extraídos sean válidos 