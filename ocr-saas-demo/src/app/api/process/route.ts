import { NextRequest, NextResponse } from 'next/server';
import { invoiceProcessor } from '@/lib/processor';
import { dolibarrClient } from '@/lib/dolibarr';
import { ExtractedInvoiceData } from '@/types';

export async function POST(request: NextRequest) {
  let body: any;
  
  try {
    console.log('🔍 PROCESAMIENTO - Endpoint de procesamiento llamado');
    
    body = await request.json();
    console.log('🔍 PROCESAMIENTO - Cuerpo de la petición recibido:', {
      hasExtractedData: !!body.extractedData,
      fileName: body.fileName,
      forceDuplicate: body.forceDuplicate,
      hasEntityId: !!body.entityId,
      entityId: body.entityId,
      extractedDataKeys: body.extractedData ? Object.keys(body.extractedData) : undefined
    });

    const { extractedData, fileName, forceDuplicate, entityId } = body;

    if (!extractedData) {
      console.error('❌ ERROR - No se encontraron datos extraídos en la petición');
      return NextResponse.json(
        { error: 'No se encontraron datos extraídos' },
        { status: 400 }
      );
    }

    // Validar que extractedData tenga la estructura mínima requerida
    if (!extractedData.supplier || !extractedData.supplier.name) {
      console.error('❌ ERROR - Datos de proveedor inválidos o faltantes');
      return NextResponse.json(
        { error: 'Los datos extraídos no contienen información válida del proveedor' },
        { status: 422 }
      );
    }

    // Set entity if provided
    if (entityId) {
      console.log('🏢 PROCESAMIENTO - Estableciendo entidad:', entityId);
      dolibarrClient.setCurrentEntity(entityId);
    }

    console.log(`🔍 PROCESAMIENTO - Procesando datos extraídos de: ${fileName || 'archivo desconocido'}`);
    if (forceDuplicate) {
      console.log('⚠️ PROCESAMIENTO - Procesando factura duplicada por confirmación del usuario');
    }
    console.log('🔍 PROCESAMIENTO - Datos extraídos completos:', JSON.stringify(extractedData, null, 2));

    // Process the extracted data directly
    console.log('🔍 PROCESAMIENTO - Llamando a invoiceProcessor.processExtractedData...');
    const result = await invoiceProcessor.processExtractedData(extractedData);

    console.log('✅ PROCESAMIENTO - Procesamiento completado exitosamente:', {
      supplierId: result.supplierId,
      invoiceId: result.invoiceId,
      createdProductsCount: result.createdProducts.length,
      errorsCount: result.errors.length,
      wasDuplicateForced: forceDuplicate,
      entityId: entityId
    });

    return NextResponse.json({
      success: true,
      wasDuplicateForced: forceDuplicate,
      entityId: entityId,
      ...result,
    });

  } catch (error) {
    console.error('❌ ERROR - Error procesando datos extraídos:', {
      fileName: body?.fileName || 'desconocido',
      forceDuplicate: body?.forceDuplicate || false,
      entityId: body?.entityId || 'sin entidad',
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined,
      extractedData: body?.extractedData ? {
        supplier: body.extractedData.supplier?.name,
        productsCount: body.extractedData.products?.length,
        invoiceNumber: body.extractedData.invoice?.number
      } : undefined
    });
    
    // Determinar el tipo de error y el código de estado HTTP apropiado
    let statusCode = 500;
    let errorMessage = 'Error procesando datos extraídos';
    
    if (error instanceof Error) {
      if (error.message.includes('Error de validación')) {
        statusCode = 422; // Unprocessable Entity
        errorMessage = 'Error de validación en los datos';
      } else if (error.message.includes('Error en Dolibarr')) {
        statusCode = 503; // Service Unavailable
        errorMessage = 'Error en el sistema Dolibarr';
      } else if (error.message.includes('obligatorio') || 
                 error.message.includes('debe ser') || 
                 error.message.includes('no puede ser')) {
        statusCode = 422;
        errorMessage = 'Datos de la factura inválidos';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'OCR Dolibarr API - Use POST to upload files' },
    { status: 200 }
  );
} 