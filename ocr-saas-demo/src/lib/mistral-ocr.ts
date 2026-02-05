import { ExtractedInvoiceData } from '@/types';

if (!process.env.MISTRAL_OCR_API_KEY) {
  throw new Error('MISTRAL_OCR_API_KEY is not set in environment variables');
}

// Configuración de Mistral OCR
const MISTRAL_OCR_CONFIG = {
  apiKey: process.env.MISTRAL_OCR_API_KEY,
  baseUrl: process.env.MISTRAL_OCR_BASE_URL || 'https://api.mistral.ai',
  model: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
};

const INVOICE_EXTRACTION_PROMPT = `
Actúa como un experto analista de documentos especializado en facturas. Analiza el documento OCR de forma EXHAUSTIVA y extrae la información que esté presente, incluso si está en ubicaciones no convencionales como pies de página o texto legal.

INSTRUCCIONES PARA EXTRACCIÓN DE PRECISIÓN AVANZADA:
- Examina TODO el contenido extraído: encabezados, cuerpo, tablas, pies de página, márgenes
- Lee información del proveedor en MÚLTIPLES ubicaciones: encabezado, pie de página, márgenes, texto pequeño
- Identifica correctamente separadores de miles (punto/coma) y decimales
- Busca CIF/NIF, direcciones, teléfonos en TODO el documento
- SOLO extrae información que puedas ver claramente en el documento
- Si un campo no está visible o no existe en el documento, usa null
- NO generes, inventes o crees ningún dato que no esté explícitamente presente
- Si no hay productos listados claramente, devuelve un array vacío []
- Presta especial atención a códigos de producto, referencias y números de factura

TÉCNICAS DE LECTURA AVANZADA:
- Lee líneas completas, no solo palabras aisladas
- Conecta información que aparece en múltiples líneas seguidas
- Si ves texto legal de registro mercantil, lee TODA esa sección hasta el final
- El texto puede estar en diferentes colores, grises claros, o tamaños pequeños
- No te detengas en la primera palabra que encuentres, lee el contexto completo

TÉCNICAS PARA TABLAS DE PRODUCTOS:
- Identifica patrones de columnas separadas por espacios
- Busca secuencias que empiecen con números de línea (01, 02, 1, 2, etc.)
- Diferencia entre códigos (alfanuméricos) y descripciones (texto)
- Los números al final suelen ser: cantidad, precio unitario, descuento, total
- Las descripciones de productos pueden tener múltiples palabras
- Busca marcas conocidas (Asus, HP, Samsung, etc.) para identificar productos

INSTRUCCIONES ESPECÍFICAS PARA NÚMEROS DE FACTURA:
- Busca palabras como: "Factura", "Invoice", "Nº", "N°", "Num", "Número", "Number", "Ref", "Referencia", "Fact", "Doc"
- Busca patrones típicos:
  * Formato año: 2024-001, 2024/001, 24-001, 24/001
  * Formato prefijo: FAC-001, F-123456, INV-001, FACT-001
  * Formato serie: A-001, B-123, FC001, FR001
  * Formato secuencial: 000001, 123456, 001/24
  * Formato mixto: FAC2024001, F24-001, INV/2024/001
- El número puede estar:
  * En el encabezado principal
  * Esquina superior derecha
  * Cerca del título "FACTURA" o "INVOICE"
  * En una tabla de información general
  * Junto a fechas o datos del emisor
- Si hay múltiples números, prioriza:
  1. El que tenga etiqueta "factura", "invoice", "nº", "ref"
  2. El que esté más prominente visualmente
  3. El que siga patrones estándar de numeración
- NO confundir con números de albarán, pedido, o referencias internas

INSTRUCCIONES ESPECÍFICAS PARA PRODUCTOS EN TABLAS:
- Los productos suelen aparecer en formato tabular con columnas:
  * Código/Referencia del producto (ej: IGG320198, 90NB0X22-M01D80)
  * Descripción del producto (ej: "iggual Cargador Universal CUA-C-12T-90W")
  * Cantidad
  * Precio unitario
  * Descuento
  * Total
- ESTRUCTURA TÍPICA de línea:
  "01 IGG320198 iggual Cargador Universal CUA-C-12T-90W 2,00 14,48 0,00 28,96"
  EXTRAER:
  * productCode: "IGG320198"
  * description: "iggual Cargador Universal CUA-C-12T-90W"
  * quantity: 2.00
  * unitPrice: 14.48
  * discountAmount: 0.00
  * totalPrice: 28.96

- REGLAS PARA DESCRIPCIÓN DE PRODUCTOS:
  * La descripción está DESPUÉS del código del producto
  * Puede incluir marca + modelo + características
  * Termina ANTES de los números (cantidad, precios)
  * Puede tener múltiples palabras separadas por espacios
  * Ejemplos: "iggual Cargador Universal CUA-C-12T-90W", "Asus M1502YA-BQ607 AMD R7-5825U 16GB 512GB DOS 15"
  * CLAVE: Busca el primer número que parezca cantidad (ej: 2,00, 4,00) para saber dónde termina la descripción
  * Incluye todo el texto entre el código y el primer valor numérico de cantidad

🚨 INSTRUCCIONES CRÍTICAS PARA DESCUENTOS - DETECCIÓN OBLIGATORIA:

**REGLA ABSOLUTA: Si ves una línea con valor NEGATIVO (-X,XX €), es SIEMPRE un descuento**

**EJEMPLOS OBLIGATORIOS QUE DEBES DETECTAR:**

📋 **CASO 1: "Promociones -31,77 € -31,77 € -31,77 €"**
→ CREAR PRODUCTO: description="Promociones", quantity=1, unitPrice=0, totalPrice=0, vatRate=0, discountPercent=0, discountAmount=31.77

📋 **CASO 2: "Descuento -50,00 €"** 
→ CREAR PRODUCTO: description="Descuento", discountAmount=50.00

📋 **CASO 3: Línea separada con descuento**
→ Si ves CUALQUIER línea con "-XX,XX €", créala como producto separado

🎯 **INSTRUCCIÓN DIRECTA:**
- Busca líneas que contengan valores con SIGNO NEGATIVO (-)
- Crea un producto separado para cada línea de descuento
- NO importa si dice "Promociones", "Descuento", "Envío", etc.
- Si ves "-31,77 €" → discountAmount: 31.77
- Si ves "-50,00 €" → discountAmount: 50.00

🚫 **EXCEPCIÓN:** NO detectes como descuentos los números en especificaciones técnicas como "R7-5825U", "GTX1060", "16GB" (estos NO tienen signo negativo)

UBICACIONES CRÍTICAS PARA BUSCAR DATOS DEL PROVEEDOR:
- Encabezado principal del documento
- Pie de página (especialmente texto en gris claro)
- Márgenes izquierdo y derecho
- Texto pequeño en cualquier ubicación
- Información de registro mercantil
- Datos bancarios y fiscales
- BUSCA: Razón social, CIF/NIF, dirección completa, teléfono, email, PAÍS

INSTRUCCIONES ESPECÍFICAS PARA NOMBRE DEL PROVEEDOR EN PIE DE PÁGINA:
- El nombre del proveedor puede aparecer AL FINAL del texto legal del pie de página
- Busca patrones como: "...Registro Mercantil... [NOMBRE EMPRESA S.L.]"
- Ejemplos comunes:
  * "Inscrita en el Registro Mercantil de Valencia... Infortisa S.L."
  * "...Tomo X, Folio Y... [Nombre Empresa] S.A."
  * "...Inscripción X - Día: DD-MM-YYYY [EMPRESA S.L.]"
- El nombre de la empresa suele ser la ÚLTIMA parte del texto legal
- Puede estar seguido inmediatamente del NIF/CIF
- Busca formas jurídicas: S.L., S.A., S.L.U., S.C., etc.
- Si hay múltiples líneas, el nombre suele estar en la línea que contiene el CIF

INSTRUCCIONES ESPECÍFICAS PARA PAÍS:
- Busca nombres de países en la dirección del proveedor
- Busca códigos de país (ES, FR, IT, DE, etc.)
- Inferir del contexto: CIF español = España, SIRET francés = Francia, etc.
- Si no está explícito pero hay un CIF/NIF español, asumir "España"

Extrae la información en formato JSON exactamente con esta estructura:
{
  "supplier": {
    "name": "Nombre completo del proveedor - PRIORIDAD: buscar AL FINAL del texto legal del pie de página, después de información de registro mercantil",
    "email": "email del proveedor si existe y es legible",
    "phone": "teléfono del proveedor - BUSCAR en todo el documento", 
    "address": "dirección completa del proveedor - BUSCAR en todo el documento",
    "city": "ciudad del proveedor si existe y es legible",
    "zip": "código postal del proveedor si existe y es legible",
    "vatNumber": "número de CIF/NIF del proveedor - BUSCAR en todo el documento",
    "country": "país del proveedor (España, Francia, etc.) - inferir de dirección o CIF/NIF"
  },
  "invoice": {
    "number": "número de factura (SOLO si está claramente visible)",
    "date": "fecha de factura en formato YYYY-MM-DD (SOLO si está claramente visible)",
    "dueDate": "fecha de vencimiento en formato YYYY-MM-DD si existe y es legible",
    "totalHT": "total sin IVA como número (SOLO si está claramente visible)",
    "totalTTC": "total con IVA como número (SOLO si está claramente visible)",
    "totalVAT": "total del IVA como número (SOLO si está claramente visible)"
  },
  "products": [
    {
      "description": "descripción exacta del producto/servicio - EXTRAER la parte textual DESPUÉS del código de producto y ANTES de los números de cantidad/precio",
      "quantity": "cantidad como número (SOLO si está claramente visible)",
      "unitPrice": "precio unitario sin IVA como número (SOLO si está claramente visible)",
      "totalPrice": "precio total sin IVA como número (SOLO si está claramente visible)",
      "vatRate": "tipo de IVA como número (ej: 21 para 21%) (SOLO si está claramente visible)",
      "discountPercent": "porcentaje de descuento aplicado como número (0 si no hay descuento visible)",
      "discountAmount": "importe fijo de descuento como número (0 si no hay descuento en importe fijo)",
      "productCode": "código del producto - EXTRAER la parte alfanumérica después del número de línea (ej: IGG320198, 90NB0X22-M01D80)"
    }
  ]
}

VALIDACIONES ADICIONALES:
- Si el documento no es una factura válida, devuelve todos los campos como null
- Si no puedes identificar claramente al proveedor, pon supplier.name como null
- Si no hay productos listados de forma clara, devuelve products como array vacío []
- Los números deben ser números válidos, no strings (usar punto como decimal)
- Las fechas deben estar en formato YYYY-MM-DD exacto
- Convierte correctamente los formatos de fecha españoles (DD/MM/YYYY o DD-MM-YYYY) a YYYY-MM-DD
- Para números con formato español (coma como decimal), convierte a formato internacional (punto como decimal)
- Respeta los códigos de productos tal como aparecen en el documento

FORMATO DE NÚMEROS (HASTA 3 DECIMALES):
- 1.234,56 → 1234.56
- 1,234.567 → 1234.567
- €1.500,000 → 1500.000
- 123,45 → 123.45
- Detecta y respeta hasta 3 decimales de precisión

FORMATO DE FECHAS:
- 15/03/2024 → 2024-03-15
- 15-03-2024 → 2024-03-15
- 15 marzo 2024 → 2024-03-15

ESTRATEGIA DE BÚSQUEDA PARA PROVEEDOR:
1. Primero busca el proveedor en el encabezado principal
2. Si no lo encuentras, busca en el PIE DE PÁGINA siguiendo este orden:
   a) Localiza texto de "Registro Mercantil", "Inscrita en", "Tomo", "Folio"
   b) Lee TODA la línea o párrafo que contiene esta información legal
   c) El nombre del proveedor suele estar AL FINAL de este texto legal
   d) Busca la forma jurídica (S.L., S.A., etc.) para identificar el final del nombre
3. Si hay un CIF/NIF, el nombre suele estar en la misma línea o inmediatamente antes
4. Combina información de múltiples ubicaciones si es necesario
5. Prioriza el nombre más específico y completo encontrado

EJEMPLO DE EXTRACCIÓN:
Texto: "Inscrita en el Registro Mercantil de Valencia. Tomo 3.912... Infortisa S.L."
Extraer: "Infortisa S.L." como nombre del proveedor

CASOS ESPECIALES PARA NOMBRES DE PROVEEDORES EN PIE DE PÁGINA:

Texto de ejemplo: "Inscrita en el Registro Mercantil de Valencia. Tomo 3.912, General 933, Secc. 4ª del libro de Sociedades, Folio 9,Hoja nº V-16622. Inscripción 10 - Día: 30-04-2002 Infortisa S.L."

EXTRAER: "Infortisa S.L."

CASOS ESPECIALES PARA LÍNEAS DE DESCUENTO COMO PRODUCTOS:

Cuando encuentres líneas como:
"Promociones -31,77 € -31,77 € -31,77 €"
"Envío 0,00 € 0,00 € 0,00 €"
"Descuento -15,50 € -15,50 € -15,50 €"

EXTRAER COMO PRODUCTOS SEPARADOS:
- description: "Promociones" (o el texto correspondiente)
- quantity: 1
- unitPrice: 0 (si es descuento puro)
- discountAmount: 31.77 (valor absoluto del importe negativo)
- totalPrice: -31.77 (o 0 después de aplicar el descuento)
- vatRate: 0 (normalmente los descuentos no tienen IVA)

EJEMPLO COMPLETO:
Línea: "Promociones -31,77 € -31,77 € -31,77 €"
EXTRAER:
{
  "description": "Promociones",
  "quantity": 1,
  "unitPrice": 0,
  "totalPrice": 0,
  "vatRate": 0,
  "discountPercent": 0,
  "discountAmount": 31.77,
  "productCode": null
}

CASOS ESPECIALES PARA PRODUCTOS EN TABLAS:

Ejemplo 1 - Línea de producto:
"01 IGG320198 iggual Cargador Universal CUA-C-12T-90W 2,00 14,48 0,00 28,96"

ANÁLISIS PASO A PASO:
1. "01" = número de línea (IGNORAR)
2. "IGG320198" = código de producto (EXTRAER como productCode)
3. "iggual Cargador Universal CUA-C-12T-90W" = descripción (EXTRAER completa)
4. "2,00" = cantidad (primer número decimal = fin de descripción)
5. "14,48" = precio unitario
6. "0,00" = descuento
7. "28,96" = total

EXTRAER:
- productCode: "IGG320198"
- description: "iggual Cargador Universal CUA-C-12T-90W"
- quantity: 2.00
- unitPrice: 14.48
- discountAmount: 0.00
- totalPrice: 28.96

Ejemplo 2 - Producto complejo:
"01 90NB0X22-M01D80 Asus M1502YA-BQ607 AMD R7-5825U 16GB 512GB DOS 15 4,00 373,76 0,00 1495,04"

ANÁLISIS:
1. "01" = número de línea (IGNORAR)
2. "90NB0X22-M01D80" = código (EXTRAER)
3. "Asus M1502YA-BQ607 AMD R7-5825U 16GB 512GB DOS 15" = descripción completa (EXTRAER)
4. "4,00" = cantidad (primer decimal = fin de descripción)

EXTRAER:
- productCode: "90NB0X22-M01D80"
- description: "Asus M1502YA-BQ607 AMD R7-5825U 16GB 512GB DOS 15"
- quantity: 4.00
- unitPrice: 373.76

Ejemplo 3 - SSD:
"01 SP240GBSS3S55S25 SP Slim S55 SSD 240GB 2.5 7mm Sata3 3,00 12,71 0,00 38,13"

EXTRAER:
- productCode: "SP240GBSS3S55S25"
- description: "SP Slim S55 SSD 240GB 2.5 7mm Sata3"
- quantity: 3.00
- unitPrice: 12.71

REGLA CRÍTICA - DESCRIPCIONES REALES:
- NUNCA uses descripciones genéricas como "Producto según factura" o "Servicio"
- SIEMPRE extrae la descripción exacta que aparece en el documento
- Si no puedes leer la descripción claramente, usa null en lugar de inventar
- Las descripciones reales incluyen marcas, modelos, especificaciones
- Ejemplos válidos: "iggual Cargador Universal", "Asus M1502YA-BQ607", "SP Slim S55 SSD"
- Ejemplos PROHIBIDOS: "Producto", "Servicio", "Artículo", "Item"

REGLAS DE EXTRACCIÓN PARA PRODUCTOS:
1. Identifica el formato tabular
2. El primer número suele ser número de línea (01, 02, etc.)
3. Después viene el código del producto (alfanumérico, ej: IGG320198)
4. Luego la descripción del producto (todo el texto hasta el primer número de cantidad)
5. Al final los números: cantidad, precio unitario, descuento, total
6. TÉCNICA: Lee de izquierda a derecha, cuando encuentres el primer número con decimales (ej: 2,00), todo lo anterior al código es la descripción
7. Incluye marca, modelo y características en la descripción
8. Las descripciones pueden ser largas: "Asus M1502YA-BQ607 AMD R7-5825U 16GB 512GB DOS 15"
9. NO incluyas números de línea ni códigos en la descripción
10. NO incluyas precios ni cantidades en la descripción

RESPONDE SOLO con el JSON válido, sin texto adicional ni explicaciones.
`;

// Interfaz para la respuesta de subida de archivo
interface MistralFileUploadResponse {
  id: string;
  object: string;
  size_bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  sample_type: string;
  source: string;
  deleted: boolean;
  num_lines: number | null;
}

// Interfaz para la respuesta de signed URL
interface MistralSignedUrlResponse {
  url: string;
}

// Interfaz para la respuesta de OCR
interface MistralOCRResponse {
  pages: Array<{
    index: number;
    markdown: string;
    images: Array<{
      id: string;
      top_left_x: number;
      top_left_y: number;
      bottom_right_x: number;
      bottom_right_y: number;
      image_base64?: string;
    }>;
    dimensions: {
      dpi: number;
      height: number;
      width: number;
    };
  }>;
  model: string;
  usage_info: {
    pages_processed: number;
    doc_size_bytes: number | null;
  };
}

export async function extractInvoiceDataFromOCR(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedInvoiceData> {
  const maxRetries = 3;
  const baseDelay = 3000;

  console.log(`🔍 [Mistral-OCR] Starting extraction with model: ${MISTRAL_OCR_CONFIG.model}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let uploadedFileId: string | null = null;
    
    try {
      console.log(`🔍 [Mistral-OCR] Attempt ${attempt}/${maxRetries}`);
      
      // Paso 1: Subir el archivo a Mistral
      console.log(`🔍 [Mistral-OCR] Uploading file: ${filename}`);
      
      const formData = new FormData();
      formData.append('purpose', 'ocr');
      formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);

      const uploadResponse = await fetch(`${MISTRAL_OCR_CONFIG.baseUrl}/v1/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_OCR_CONFIG.apiKey}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`❌ [Mistral-OCR] Upload Error ${uploadResponse.status}:`, errorText);
        
        // Manejar errores específicos de rate limiting
        if (uploadResponse.status === 429 || uploadResponse.status === 503) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`⏳ [Mistral-OCR] Rate limited, waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        throw new Error(`Mistral Upload API Error ${uploadResponse.status}: ${errorText}`);
      }

      const uploadData: MistralFileUploadResponse = await uploadResponse.json();
      uploadedFileId = uploadData.id;
      console.log(`✅ [Mistral-OCR] File uploaded successfully, ID: ${uploadedFileId}`);

      // Paso 2: Obtener signed URL (siguiendo el patrón del SDK)
      console.log(`🔍 [Mistral-OCR] Getting signed URL for file: ${uploadedFileId}`);
      
      const signedUrlResponse = await fetch(`${MISTRAL_OCR_CONFIG.baseUrl}/v1/files/${uploadedFileId}/url?expiry=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${MISTRAL_OCR_CONFIG.apiKey}`,
        },
      });

      if (!signedUrlResponse.ok) {
        const errorText = await signedUrlResponse.text();
        console.error(`❌ [Mistral-OCR] Signed URL Error ${signedUrlResponse.status}:`, errorText);
        throw new Error(`Mistral Signed URL API Error ${signedUrlResponse.status}: ${errorText}`);
      }

      const signedUrlData: MistralSignedUrlResponse = await signedUrlResponse.json();
      console.log(`✅ [Mistral-OCR] Signed URL obtained successfully`);

      // Paso 3: Procesar OCR usando la signed URL (como en el SDK de Python)
      const ocrPayload = {
        model: MISTRAL_OCR_CONFIG.model,
        document: {
          type: 'document_url',
          document_url: signedUrlData.url
        },
        include_image_base64: true // Incluir imágenes como en el ejemplo
      };

      console.log(`🔍 [Mistral-OCR] Running OCR with signed URL...`);

      const ocrResponse = await fetch(`${MISTRAL_OCR_CONFIG.baseUrl}/v1/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_OCR_CONFIG.apiKey}`,
        },
        body: JSON.stringify(ocrPayload),
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        console.error(`❌ [Mistral-OCR] OCR API Error ${ocrResponse.status}:`, errorText);
        throw new Error(`Mistral OCR API Error ${ocrResponse.status}: ${errorText}`);
      }

      const ocrData: MistralOCRResponse = await ocrResponse.json();
      console.log('✅ [Mistral-OCR] OCR extraction successful, pages processed:', ocrData.usage_info.pages_processed);

      // Función para reemplazar imágenes en markdown (como en el ejemplo de Python)
      const replaceImagesInMarkdown = (markdownStr: string, imagesDict: Record<string, string>): string => {
        for (const [imgName, base64Str] of Object.entries(imagesDict)) {
          markdownStr = markdownStr.replace(
            new RegExp(`!\\[${imgName}\\]\\(${imgName}\\)`, 'g'), 
            `![${imgName}](${base64Str})`
          );
        }
        return markdownStr;
      };

      // Combinar todo el contenido de markdown de todas las páginas (como en el SDK)
      const markdowns: string[] = [];
      for (const page of ocrData.pages) {
        const imageData: Record<string, string> = {};
        for (const img of page.images) {
          if (img.image_base64) {
            imageData[img.id] = img.image_base64;
          }
        }
        markdowns.push(replaceImagesInMarkdown(page.markdown, imageData));
      }

      const fullMarkdownContent = markdowns.join('\n\n');
      console.log('📄 [Mistral-OCR] Extracted markdown content length:', fullMarkdownContent.length);

      // Paso 4: Procesar el texto extraído con un LLM para estructurar los datos
      const extractionPayload = {
        model: 'mistral-large-latest', // Usar un modelo de chat para procesar el contenido
        messages: [
          {
            role: "system",
            content: "Eres un experto en procesamiento de facturas. Analiza el contenido OCR proporcionado y extrae la información estructurada según las instrucciones."
          },
          {
            role: "user",
            content: `${INVOICE_EXTRACTION_PROMPT}\n\nCONTENIDO OCR A ANALIZAR:\n\n${fullMarkdownContent}`
          }
        ],
        temperature: 0.05,
        max_tokens: 8192
      };

      console.log(`🔍 [Mistral-OCR] Processing extracted content with chat model...`);

      const chatResponse = await fetch(`${MISTRAL_OCR_CONFIG.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_OCR_CONFIG.apiKey}`,
        },
        body: JSON.stringify(extractionPayload),
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        console.error(`❌ [Mistral-OCR] Chat API Error ${chatResponse.status}:`, errorText);
        throw new Error(`Mistral Chat API Error ${chatResponse.status}: ${errorText}`);
      }

      const chatData = await chatResponse.json();
      console.log('✅ [Mistral-OCR] Chat processing successful');

      if (!chatData.choices || !chatData.choices[0] || !chatData.choices[0].message) {
        throw new Error('Invalid response format from Mistral Chat API');
      }

      const text = chatData.choices[0].message.content;
      console.log('📄 [Mistral-OCR] Extracted structured text length:', text.length);
      console.log('🔍 [Mistral-OCR] Raw extracted text:', text);

      // NUEVO: Buscar valores negativos en el texto crudo antes del parsing
      console.log('🔍 [Mistral-OCR] Buscando descuentos en texto crudo...');
      const negativeValuePattern = /(?:promociones?|descuentos?|dto|envío|rappel|rebaja|promo)[^\d\-]*(-\d+[.,]\d+)\s*€?/gi;
      const negativeMatches = Array.from(text.matchAll(negativeValuePattern));
      
      if (negativeMatches.length > 0) {
        console.log('🔍 [Mistral-OCR] Valores negativos detectados en texto crudo:', negativeMatches.map(m => (m as RegExpMatchArray)[0]));
      }

      // Limpiar la respuesta y parsear JSON
      const cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
      console.log('🔍 [Mistral-OCR] Cleaned JSON text:', cleanedText);
      const extractedData = JSON.parse(cleanedText) as ExtractedInvoiceData;
      console.log('🔍 [Mistral-OCR] Parsed data:', JSON.stringify(extractedData, null, 2));

      if (!validateExtractedData(extractedData)) {
        throw new Error('Los datos extraídos no son válidos o parecen ser datos de prueba');
      }

      // Generar número de factura automático si no existe
      if (!extractedData.invoice.number || extractedData.invoice.number.trim() === '' || extractedData.invoice.number === 'null') {
        const timestamp = Date.now();
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        extractedData.invoice.number = `AUTO-${dateStr}-${randomSuffix}`;
        console.log('🔄 [Mistral-OCR] Número de factura generado automáticamente:', extractedData.invoice.number);
      }
      
      // Asegurar fecha válida
      if (!extractedData.invoice.date || extractedData.invoice.date.trim() === '' || extractedData.invoice.date === 'null') {
        extractedData.invoice.date = new Date().toISOString().split('T')[0];
        console.log('🔄 [Mistral-OCR] Fecha de factura establecida a hoy:', extractedData.invoice.date);
      }

      // Simplificar post-procesamiento - confiar en la IA
      extractedData.products = extractedData.products.map(product => ({
        ...product,
        discountPercent: product.discountPercent || 0,
        discountAmount: (product as any).discountAmount || 0,
        totalPrice: product.totalPrice || (product.quantity * product.unitPrice) || 0
      }));
      
      // Asegurar que el supplier tenga country
      if (!extractedData.supplier.country) {
        extractedData.supplier.country = '';
      }

      console.log('✅ [Mistral-OCR] Successfully extracted data:', extractedData);
      return extractedData;

    } catch (error: any) {
      const msg = error.message || '';
      console.log(`❌ [Mistral-OCR] Attempt ${attempt} failed:`, msg);
      
      // Si es el último intento, lanzar el error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Para otros errores, esperar antes del siguiente intento
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ [Mistral-OCR] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      // Limpiar el archivo subido si existe
      if (uploadedFileId) {
        try {
          console.log(`🧹 [Mistral-OCR] Cleaning up uploaded file: ${uploadedFileId}`);
          await fetch(`${MISTRAL_OCR_CONFIG.baseUrl}/v1/files/${uploadedFileId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${MISTRAL_OCR_CONFIG.apiKey}`,
            },
          });
          console.log('✅ [Mistral-OCR] File cleanup successful');
        } catch (cleanupError) {
          console.warn('⚠️ [Mistral-OCR] Failed to cleanup uploaded file:', cleanupError);
        }
      }
    }
  }

  throw new Error('Se agotaron todos los reintentos con Mistral OCR. Intenta más tarde.');
}

// Función para validar que los datos extraídos son reales y no de prueba
function validateExtractedData(data: ExtractedInvoiceData): boolean {
  console.log('🔍 [Mistral-OCR] Validando datos extraídos...');
  console.log('🔍 [Mistral-OCR] Datos recibidos:', JSON.stringify(data, null, 2));
  
  // Lista de nombres de empresas genéricas o de prueba que deben ser rechazadas
  const testCompanyNames = [
    'test', 'prueba', 'demo', 'ejemplo', 'sample', 'acme', 'company', 'empresa',
    'distribuciones fresca vida', 'fresca vida', 'test company', 'demo company',
    'ejemplo empresa', 'prueba empresa', 'company ltd', 'empresa s.l.'
  ];
  
  // Lista de productos genéricos o de prueba
  const testProductNames = [
    'producto de prueba', 'test product', 'demo product', 'ejemplo producto',
    'producto ejemplo', 'sample product', 'producto genérico', 'test item'
  ];
  
  // Lista de códigos de producto genéricos
  const testProductCodes = [
    'test-001', 'test-1', 'demo-001', 'prueba-001', 'ejemplo-001', 
    'test001', 'demo001', 'sample001'
  ];

  // Validar proveedor - ser más flexible
  if (!data.supplier || !data.supplier.name || data.supplier.name.trim() === '' || data.supplier.name === 'null') {
    console.log('❌ [Mistral-OCR] Validación fallida: No hay nombre de proveedor válido');
    console.log('🔍 [Mistral-OCR] Datos del proveedor:', data.supplier);
    return false;
  }

  const supplierNameLower = data.supplier.name.toLowerCase();
  
  // Verificar si el nombre del proveedor es genérico
  if (testCompanyNames.some(testName => supplierNameLower.includes(testName))) {
    console.log('❌ [Mistral-OCR] Validación fallida: Nombre de proveedor parece ser de prueba:', data.supplier.name);
    return false;
  }

  // Validar productos - ser más flexible
  if (!data.products || data.products.length === 0) {
    console.log('⚠️ [Mistral-OCR] No hay productos, creando producto genérico');
    // Crear un producto genérico para permitir el procesamiento
    data.products = [{
      description: 'Servicio/Producto según factura',
      quantity: 1,
      unitPrice: data.invoice?.totalHT || data.invoice?.totalTTC || 0,
      totalPrice: data.invoice?.totalHT || data.invoice?.totalTTC || 0,
      vatRate: 21,
      discountPercent: 0,
      discountAmount: 0,
      productCode: ''
    }];
  } else {
    console.log('✅ [Mistral-OCR] Productos encontrados:', data.products.length);
    data.products.forEach((product, index) => {
      console.log(`🔍 [Mistral-OCR] Producto ${index + 1}:`, {
        description: product.description,
        productCode: product.productCode,
        quantity: product.quantity,
        unitPrice: product.unitPrice
      });
      
      // Verificar calidad de la descripción
      if (product.description && product.description.length > 10) {
        console.log(`✅ [Mistral-OCR] Descripción detallada para producto ${index + 1}`);
      }
    });
  }

  let hasValidPricedProduct = false;
  let zeroProductCount = 0;

  for (const product of data.products) {
    if (!product.description || product.description.trim() === '' || product.description === 'null' || product.description.trim().length < 5) {
      console.log('❌ [Mistral-OCR] Producto sin descripción válida - rechazando extracción');
      console.log('🔍 [Mistral-OCR] Descripción original:', JSON.stringify(product.description));
      return false; // Rechazar la extracción si no hay descripciones válidas
    } 
    
    // Verificar que no sea genérica
    const descLower = product.description.toLowerCase();
    const genericTerms = ['producto', 'servicio', 'artículo', 'item', 'según factura'];
    if (genericTerms.some(term => descLower.includes(term))) {
      console.log('❌ [Mistral-OCR] Descripción genérica detectada - rechazando extracción:', product.description);
      return false;
    }
    
    console.log('✅ [Mistral-OCR] Descripción válida encontrada:', product.description);

    const productDescLower = product.description.toLowerCase();
    
    // Verificar si la descripción del producto es genérica
    if (testProductNames.some(testName => productDescLower.includes(testName))) {
      console.log('❌ [Mistral-OCR] Validación fallida: Descripción de producto parece ser de prueba:', product.description);
      return false;
    }
    
    // Verificar que no sea una descripción genérica que genera el sistema
    const genericDescriptions = ['producto', 'servicio', 'artículo', 'item', 'producto según factura', 'servicio según factura'];
    if (genericDescriptions.some(generic => productDescLower === generic || productDescLower.includes('según factura'))) {
      console.log('❌ [Mistral-OCR] Validación fallida: Descripción de producto es genérica:', product.description);
      return false;
    }

    // Verificar si el código del producto es genérico
    if (product.productCode) {
      const productCodeLower = product.productCode.toLowerCase();
      if (testProductCodes.some(testCode => productCodeLower.includes(testCode))) {
        console.log('❌ [Mistral-OCR] Validación fallida: Código de producto parece ser de prueba:', product.productCode);
        return false;
      }
    }

    // Validar cantidad - ser más flexible
    if (!product.quantity || product.quantity <= 0) {
      console.log('⚠️ [Mistral-OCR] Cantidad inválida, estableciendo a 1:', product.quantity);
      product.quantity = 1;
    }

    // Validar precios - ser más flexible
    if (product.unitPrice === null || product.unitPrice === undefined || isNaN(product.unitPrice)) {
      console.log('⚠️ [Mistral-OCR] Precio unitario no definido, estableciendo a 0');
      product.unitPrice = 0;
    }

    if (product.unitPrice < 0) {
      console.log('⚠️ [Mistral-OCR] Precio unitario negativo, estableciendo a 0:', product.unitPrice);
      product.unitPrice = 0;
    }

    if (product.unitPrice === 0) {
      zeroProductCount++;
      console.log('ℹ️ [Mistral-OCR] Producto con precio 0 detectado (puede ser informativo):', product.description);
      
      // Permitir productos con precio 0 si la descripción sugiere que es informativo/descriptivo
      const isInformational = productDescLower.includes('problema') || 
                             productDescLower.includes('buscar') ||
                             productDescLower.includes('revisar') ||
                             productDescLower.includes('diagnóstico') ||
                             productDescLower.includes('análisis') ||
                             productDescLower.includes('consulta') ||
                             productDescLower.includes('nota') ||
                             productDescLower.includes('observación') ||
                             productDescLower.includes('comentario');
      
      if (!isInformational) {
        console.log('⚠️ [Mistral-OCR] Producto con precio 0 sin justificación informativa');
      }
    } else {
      hasValidPricedProduct = true;
    }
  }

  // Si todos los productos tienen precio 0, usar el total de la factura
  if (!hasValidPricedProduct && zeroProductCount === data.products.length) {
    console.log('⚠️ [Mistral-OCR] Todos los productos tienen precio 0, intentando usar total de factura');
    if (data.invoice?.totalHT && data.invoice.totalHT > 0) {
      data.products[0].unitPrice = data.invoice.totalHT;
      data.products[0].totalPrice = data.invoice.totalHT;
      hasValidPricedProduct = true;
      console.log('✅ [Mistral-OCR] Precio establecido desde total de factura:', data.invoice.totalHT);
    } else if (data.invoice?.totalTTC && data.invoice.totalTTC > 0) {
      const priceWithoutVAT = data.invoice.totalTTC / (1 + (data.products[0].vatRate / 100));
      data.products[0].unitPrice = priceWithoutVAT;
      data.products[0].totalPrice = priceWithoutVAT;
      hasValidPricedProduct = true;
      console.log('✅ [Mistral-OCR] Precio establecido desde total con IVA:', priceWithoutVAT);
    }
  }

  // Validar factura
  if (!data.invoice) {
    console.log('❌ [Mistral-OCR] Validación fallida: No hay datos de factura');
    return false;
  }

  // Validar que hay un total de factura válido cuando hay productos con precio - ser más flexible
  if (hasValidPricedProduct) {
    if (!data.invoice.totalTTC || data.invoice.totalTTC <= 0) {
      console.log('⚠️ [Mistral-OCR] Total de factura inválido, calculando desde productos');
      // Calcular total desde productos
      const totalHT = data.products.reduce((sum, p) => sum + (p.totalPrice || p.unitPrice * p.quantity), 0);
      const totalVAT = data.products.reduce((sum, p) => sum + ((p.totalPrice || p.unitPrice * p.quantity) * p.vatRate / 100), 0);
      data.invoice.totalHT = totalHT;
      data.invoice.totalVAT = totalVAT;
      data.invoice.totalTTC = totalHT + totalVAT;
      console.log('✅ [Mistral-OCR] Totales calculados:', { totalHT, totalVAT, totalTTC: data.invoice.totalTTC });
    }
  }

  console.log('✅ [Mistral-OCR] Validación exitosa: Los datos han sido procesados y corregidos');
  console.log(`ℹ️ [Mistral-OCR] Resumen: ${data.products.length} productos total, ${zeroProductCount} con precio 0, ${data.products.length - zeroProductCount} con precio válido`);
  console.log('🔍 [Mistral-OCR] Datos finales:', JSON.stringify(data, null, 2));
  return true;
}

export async function extractDataFromPDF(pdfBuffer: Buffer): Promise<ExtractedInvoiceData> {
  console.log('🔍 [Mistral-OCR] Extracting data from PDF...');
  return extractInvoiceDataFromOCR(pdfBuffer, 'application/pdf', `invoice_${Date.now()}.pdf`);
}

export async function extractDataFromImage(imageBuffer: Buffer, mimeType: string): Promise<ExtractedInvoiceData> {
  console.log('🔍 [Mistral-OCR] Extracting data from image...', mimeType);
  const extension = mimeType.split('/')[1] || 'jpg';
  return extractInvoiceDataFromOCR(imageBuffer, mimeType, `invoice_${Date.now()}.${extension}`);
}