import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedInvoiceData } from '@/types';

// 1. Permite definir hasta 3 claves API y modelos alternativos (por variables de entorno: GOOGLE_API_KEY, GOOGLE_API_KEY_2, GOOGLE_API_KEY_3, y modelos asociados).
// 2. Al recibir error 429 o 503, cambia a la siguiente clave/modelo y reintenta (con backoff exponencial).
// 3. Si todas fallan, lanza un error claro.

if (!process.env.GOOGLE_API_KEY) {
  console.warn('⚠️ GOOGLE_API_KEY is not set in environment variables. OCR extraction will fail at runtime.');
}

// Cambia los valores por defecto de modelo en GEMINI_CONFIGS a 'gemini-2.0-flash' para las tres claves.
const getGeminiConfigs = () => {
  const configs = [
    {
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-pro',
    },
    {
      apiKey: process.env.GOOGLE_API_KEY_2,
      model: process.env.GOOGLE_GEMINI_MODEL_2 || 'gemini-1.5-pro',
    },
    {
      apiKey: process.env.GOOGLE_API_KEY_3,
      model: process.env.GOOGLE_GEMINI_MODEL_3 || 'gemini-1.5-pro',
    },
  ].filter(cfg => !!cfg.apiKey);

  if (configs.length === 0) {
    console.warn('⚠️ No Gemini API keys found in environment variables');
  }
  return configs;
};

const callGeminiRestApi = async (apiKey: string, model: string, content: string, mimeType: string): Promise<string> => {
  const cleanedKey = apiKey.trim().replace(/^["']|["']$/g, '');
  // Usar v1beta que a veces es más estable para modelos nuevos o si v1 falla
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanedKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: content,
              },
            },
            {
              text: INVOICE_EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.05,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini REST API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
    throw new Error('Gemini REST API: No content in response');
  }

  return data.candidates[0].content.parts[0].text;
};

const getModelInstance = (apiKey: string, model: string) => {
  const cleanedKey = apiKey.trim().replace(/^["']|["']$/g, '');
  const genAI = new GoogleGenerativeAI(cleanedKey);

  return genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      temperature: 0.05,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
};

const INVOICE_EXTRACTION_PROMPT = `
Actúa como un experto analista de documentos OCR especializado en facturas. Analiza esta factura o documento de forma EXHAUSTIVA y extrae la información que esté presente, incluso si está en ubicaciones no convencionales como pies de página o texto legal.

INSTRUCCIONES PARA OCR DE PRECISIÓN AVANZADA:
- Examina TODA la imagen: encabezados, cuerpo, tablas, pies de página, márgenes, texto en gris claro
- Lee texto en TODOS los colores: negro, gris oscuro, gris claro, azul, cualquier color visible
- Busca información del proveedor en MÚLTIPLES ubicaciones: encabezado, pie de página, márgenes, texto pequeño
- Lee números y texto con extrema precisión, respetando formato original
- Identifica correctamente separadores de miles (punto/coma) y decimales
- ANALIZA texto en gris claro o colores tenues que pueden contener datos del proveedor
- Busca CIF/NIF, direcciones, teléfonos en TODA la imagen, no solo en las secciones obvias
- SOLO extrae información que puedas ver claramente en el documento
- Si un campo no está visible o no existe en el documento, usa null
- NO generes, inventes o crees ningún dato que no esté explícitamente presente
- NO uses nombres de empresas genéricos o de prueba
- NO inventes números de teléfono, direcciones o códigos
- Si no hay productos listados claramente, devuelve un array vacío []
- Presta especial atención a códigos de producto, referencias y números de factura
- IMPORTANTE: Revisa texto en colores claros o grises que puede contener información crítica del proveedor

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

🚨 DETECCIÓN AUTOMÁTICA DE DESCUENTOS - REGLAS SIMPLES:

**REGLA SIMPLE: Si ves "-X,XX €" en CUALQUIER línea, es un descuento de X.XX euros**

**EJEMPLOS DIRECTOS:**
- "Promociones -31,77 €" → Crear producto: description="Promociones", discountAmount=31.77
- "Descuento -50,00 €" → Crear producto: description="Descuento", discountAmount=50.00  
- "Envío -5,25 €" → Crear producto: description="Envío", discountAmount=5.25

**INSTRUCCIÓN SIMPLE:**
1. Busca TODAS las líneas que contengan "-" seguido de un número y "€"
2. Para cada línea así, crea un producto separado con discountAmount igual al valor (sin el signo -)
3. NO busques descuentos en especificaciones técnicas como "R7-5825U" (no tienen € ni signo -)

**FORMATO EXACTO PARA DESCUENTOS:**
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
    "phone": "teléfono del proveedor - BUSCAR en toda la imagen", 
    "address": "dirección completa del proveedor - BUSCAR en toda la imagen",
    "city": "ciudad del proveedor si existe y es legible",
    "zip": "código postal del proveedor si existe y es legible",
    "vatNumber": "número de CIF/NIF del proveedor - BUSCAR en toda la imagen",
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

EJEMPLO DE TEXTO EN GRIS CLARO QUE DEBES LEER:
Si ves texto como "Empresa S.L. • Dirección • Ciudad | CIF:XXX | Teléfono: XXX" en el pie de página o márgenes, aunque esté en gris claro, DEBE ser extraído como información del proveedor.

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
- totalPrice: 0 (después de aplicar el descuento)
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

export async function extractInvoiceData(
  content: string,
  mimeType: string
): Promise<ExtractedInvoiceData> {
  const maxRetriesPerModel = 1; // Solo 1 reintento para máxima velocidad de rotación
  const baseDelay = 500;       // 0.5s base delay

  // Lista de modelos a probar por cada clave, en orden de fiabilidad y cuota
  const modelsToTry = [
    'gemini-1.5-pro',
    'gemini-1.5-pro-002',
    'gemini-pro'
  ];

  const configs = getGeminiConfigs();
  if (configs.length === 0) {
    throw new Error('No se han configurado las claves de API de Gemini. Por favor, añada GOOGLE_API_KEY a sus variables de entorno.');
  }

  // 1. Barajar (shuffle) las configuraciones de API para distribuir la carga entre las 3 llaves
  const shuffledConfigs = [...configs].sort(() => Math.random() - 0.5);

  console.log(`🔀 [Gemini] Load balancing: Using ${shuffledConfigs.length} keys in random order`);

  for (let configIdx = 0; configIdx < shuffledConfigs.length; configIdx++) {
    const { apiKey } = shuffledConfigs[configIdx];
    const originalIdx = configs.findIndex(c => c.apiKey === apiKey) + 1;

    for (const modelToUse of modelsToTry) {
      let attempt = 1;
      let delay = baseDelay;

      while (attempt <= maxRetriesPerModel) {
        try {
          console.log(`🔍 [Gemini] Key #${originalIdx} | Model: ${modelToUse} | Attempt ${attempt}/${maxRetriesPerModel}`);

          let text: string;

          try {
            // Intentar primero con REST API directo (más robusto contra fallos de URL del SDK)
            console.log(`📡 [Gemini-REST] Sending payload with ${modelToUse}...`);
            text = await callGeminiRestApi(apiKey!, modelToUse, content, mimeType);
          } catch (restError: any) {
            console.warn(`⚠️ [Gemini-REST] Failed, falling back to SDK:`, restError.message.substring(0, 100));

            // Fallback al SDK si REST falla por cualquier motivo
            const modelInstance = getModelInstance(apiKey!, modelToUse);
            const result = await modelInstance.generateContent([
              {
                inlineData: {
                  data: content,
                  mimeType,
                },
              },
              { text: INVOICE_EXTRACTION_PROMPT },
            ]);

            const response = await result.response;
            text = response.text();
          }

          const cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
          const extractedData = JSON.parse(cleanedText) as ExtractedInvoiceData;

          if (!validateExtractedData(extractedData)) {
            throw new Error('DATOS_INVALIDOS');
          }

          // Post-procesamiento rápido
          if (!extractedData.invoice.number || extractedData.invoice.number.trim() === '' || extractedData.invoice.number === 'null') {
            const timestamp = Date.now();
            const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            extractedData.invoice.number = `AUTO-${dateStr}-${randomSuffix}`;
          }

          if (!extractedData.invoice.date || extractedData.invoice.date.trim() === '' || extractedData.invoice.date === 'null') {
            extractedData.invoice.date = new Date().toISOString().split('T')[0];
          }

          extractedData.products = extractedData.products.map(product => ({
            ...product,
            discountPercent: product.discountPercent || 0,
            discountAmount: (product as any).discountAmount || 0,
            totalPrice: product.totalPrice || (product.quantity * product.unitPrice) || 0
          }));

          if (!extractedData.supplier.country) extractedData.supplier.country = '';

          console.log(`✅ [Gemini] Success with Key #${originalIdx} and ${modelToUse}`);
          return extractedData;

        } catch (error: any) {
          const msg = error.message || '';
          console.log(`⚠️ [Gemini] Key #${originalIdx} failed:`, msg.substring(0, 100));

          // REGLA DE ORO: Si es Error 429 (Too Many Requests), NO reintentar esa llave, pasar a la siguiente inmediatamente
          if (msg.includes('429') || msg.toLowerCase().includes('too many requests') || msg.includes('quota')) {
            console.log(`🚫 [Gemini] Key #${originalIdx} Rate Limited. Jumping to next key...`);
            break;
          }

          // Si el error es de construcción de URL o fetch básico, loguear con más detalle
          if (msg.includes('fetching') || msg.includes('Network') || msg.includes('invalid')) {
            console.error(`❌ [Gemini] Protocol error with Key #${originalIdx} / Model ${modelToUse}:`, msg);
          }

          // Si es otro error (503), intentar reintento rápido una vez
          if (msg.includes('503') && attempt < maxRetriesPerModel) {
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
            continue;
          }

          // Para cualquier otro error, pasar al siguiente modelo/llave
          break;
        }
      }
    }
  }

  throw new Error('Lo sentimos, el sistema de lectura automática está saturado en este momento. Por favor, espera unos segundos y vuelve a intentarlo.');
}

// Función para validar que los datos extraídos son reales y no de prueba
function validateExtractedData(data: ExtractedInvoiceData): boolean {
  console.log('🔍 [Gemini] Validando datos extraídos...');
  console.log('🔍 [Gemini] Datos recibidos:', JSON.stringify(data, null, 2));

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
    console.log('❌ [Gemini] Validación fallida: No hay nombre de proveedor válido');
    console.log('🔍 [Gemini] Datos del proveedor:', data.supplier);
    return false;
  }

  const supplierNameLower = data.supplier.name.toLowerCase();

  // Verificar si el nombre del proveedor es genérico
  if (testCompanyNames.some(testName => supplierNameLower.includes(testName))) {
    console.log('❌ Validación fallida: Nombre de proveedor parece ser de prueba:', data.supplier.name);
    return false;
  }

  // Validar productos - ser más flexible
  if (!data.products || data.products.length === 0) {
    console.log('⚠️ [Gemini] No hay productos, creando producto genérico');
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
    console.log('✅ [Gemini] Productos encontrados:', data.products.length);
    data.products.forEach((product, index) => {
      console.log(`🔍 [Gemini] Producto ${index + 1}:`, {
        description: product.description,
        productCode: product.productCode,
        quantity: product.quantity,
        unitPrice: product.unitPrice
      });

      // Verificar calidad de la descripción
      if (product.description && product.description.length > 10) {
        console.log(`✅ [Gemini] Descripción detallada para producto ${index + 1}`);
      }
    });
  }

  let hasValidPricedProduct = false;
  let zeroProductCount = 0;

  for (const product of data.products) {
    if (!product.description || product.description.trim() === '' || product.description === 'null' || product.description.trim().length < 5) {
      console.log('❌ [Gemini] Producto sin descripción válida - rechazando extracción');
      console.log('🔍 [Gemini] Descripción original:', JSON.stringify(product.description));
      return false; // Rechazar la extracción si no hay descripciones válidas
    }

    // Verificar que no sea genérica
    const descLower = product.description.toLowerCase();
    const genericTerms = ['producto', 'servicio', 'artículo', 'item', 'según factura'];
    if (genericTerms.some(term => descLower.includes(term))) {
      console.log('❌ [Gemini] Descripción genérica detectada - rechazando extracción:', product.description);
      return false;
    }

    console.log('✅ [Gemini] Descripción válida encontrada:', product.description);

    const productDescLower = product.description.toLowerCase();

    // Verificar si la descripción del producto es genérica
    if (testProductNames.some(testName => productDescLower.includes(testName))) {
      console.log('❌ Validación fallida: Descripción de producto parece ser de prueba:', product.description);
      return false;
    }

    // Verificar si el código del producto es genérico
    if (product.productCode) {
      const productCodeLower = product.productCode.toLowerCase();
      if (testProductCodes.some(testCode => productCodeLower.includes(testCode))) {
        console.log('❌ Validación fallida: Código de producto parece ser de prueba:', product.productCode);
        return false;
      }
    }

    // Validar cantidad - ser más flexible
    if (!product.quantity || product.quantity <= 0) {
      console.log('⚠️ [Gemini] Cantidad inválida, estableciendo a 1:', product.quantity);
      product.quantity = 1;
    }

    // Validar precios - ser más flexible
    if (product.unitPrice === null || product.unitPrice === undefined || isNaN(product.unitPrice)) {
      console.log('⚠️ [Gemini] Precio unitario no definido, estableciendo a 0');
      product.unitPrice = 0;
    }

    if (product.unitPrice < 0) {
      console.log('⚠️ [Gemini] Precio unitario negativo, estableciendo a 0:', product.unitPrice);
      product.unitPrice = 0;
    }

    if (product.unitPrice === 0) {
      zeroProductCount++;
      console.log('ℹ️ Producto con precio 0 detectado (puede ser informativo):', product.description);

      // Permitir productos con precio 0 si:
      // 1. La descripción sugiere que es informativo/descriptivo
      // 2. O si hay otros productos con precio válido
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
        console.log('⚠️ Producto con precio 0 sin justificación informativa');
      }
    } else {
      hasValidPricedProduct = true;
    }
  }

  // Rechazar solo si TODOS los productos tienen precio 0 y no son informativos
  if (!hasValidPricedProduct && zeroProductCount === data.products.length) {
    console.log('❌ Validación fallida: Todos los productos tienen precio 0 sin justificación');
    return false;
  }

  // Validar factura
  if (!data.invoice) {
    console.log('❌ Validación fallida: No hay datos de factura');
    return false;
  }

  // Validar que hay un total de factura válido cuando hay productos con precio
  if (hasValidPricedProduct) {
    if (!data.invoice.totalTTC || data.invoice.totalTTC <= 0) {
      console.log('❌ Validación fallida: Total de factura inválido cuando hay productos con precio');
      return false;
    }
  }

  console.log('✅ Validación exitosa: Los datos parecen ser reales');
  console.log(`ℹ️ Resumen: ${data.products.length} productos total, ${zeroProductCount} con precio 0, ${data.products.length - zeroProductCount} con precio válido`);
  return true;
}

export async function extractDataFromPDF(pdfBuffer: Buffer): Promise<ExtractedInvoiceData> {
  // Para PDFs, Gemini puede procesarlos directamente como imágenes
  const base64Content = pdfBuffer.toString('base64');
  return extractInvoiceData(base64Content, 'application/pdf');
}

export async function extractDataFromImage(imageBuffer: Buffer, mimeType: string): Promise<ExtractedInvoiceData> {
  const base64Content = imageBuffer.toString('base64');
  return extractInvoiceData(base64Content, mimeType);
} 