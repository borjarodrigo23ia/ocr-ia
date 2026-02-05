import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceData } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`🔍 Starting OCR extraction for: ${file.name} ${file.type}`);

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    let extractedData;

    try {
      // Usar ÚNICAMENTE Gemini AI para extracción
      console.log('🔍 Iniciando extracción con Gemini...');
      const base64Content = fileBuffer.toString('base64');
      const mimeType = file.type;

      extractedData = await extractInvoiceData(base64Content, mimeType);
      console.log('✅ Extracción exitosa con Gemini');

    } catch (geminiError: any) {
      console.error('❌ Error en el motor de extracción:', geminiError.message);

      // Mensaje simplificado para errores de cuota o saturación
      if (geminiError.message?.includes('quota') ||
        geminiError.message?.includes('rate limit') ||
        geminiError.message?.includes('saturado') ||
        geminiError.message?.includes('límites de uso')) {
        throw new Error('El sistema de lectura está recibiendo muchas solicitudes. Por favor, espere un momento e inténtelo de nuevo.');
      }

      throw new Error('No hemos podido procesar este documento. Por favor, asegúrese de que el archivo sea legible e inténtelo de nuevo.');
    }

    // Validar que los datos extraídos no estén vacíos o sean inválidos
    if (!extractedData || !extractedData.supplier || !extractedData.supplier.name) {
      console.error('❌ No se pudo extraer información válida del documento');
      return NextResponse.json({
        error: 'No hemos podido encontrar los datos de la factura. Por favor, suba una imagen más clara o un PDF de mejor calidad.'
      }, { status: 422 });
    }

    // Devolver directamente los datos extraídos
    return NextResponse.json(extractedData);

  } catch (error: any) {
    console.error('❌ Error en extracción OCR:', error);

    // Mapear errores técnicos a mensajes amigables
    let clientMessage = 'Ha ocurrido un inconveniente al leer el archivo. Por favor, reintente en unos instantes.';

    if (error.message?.includes('saturado') || error.message?.includes('muchas solicitudes') || error.message?.includes('503') || error.message?.includes('overloaded')) {
      clientMessage = 'El sistema está un poco ocupado ahora mismo. Por favor, espere 10 segundos y vuelva a intentarlo.';
    } else if (error.message?.includes('legible') || error.message?.includes('archivo no soportado')) {
      clientMessage = error.message;
    }

    return NextResponse.json(
      { error: clientMessage },
      { status: 500 }
    );
  }
} 