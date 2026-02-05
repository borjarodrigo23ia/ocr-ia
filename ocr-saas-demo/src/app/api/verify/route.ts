import { NextRequest, NextResponse } from 'next/server';
import { invoiceProcessor } from '@/lib/processor';
import { dolibarrClient } from '@/lib/dolibarr';
import { ExtractedInvoiceData } from '@/types';

export async function POST(request: NextRequest) {
  let body: any;
  
  try {
    console.log('🔍 VERIFICACIÓN - Endpoint de verificación llamado');
    
    body = await request.json();
    console.log('🔍 VERIFICACIÓN - Cuerpo de la petición recibido:', {
      hasExtractedData: !!body.extractedData,
      hasEntityId: !!body.entityId,
      entityId: body.entityId,
      extractedDataKeys: body.extractedData ? Object.keys(body.extractedData) : undefined
    });

    const { extractedData, entityId } = body;

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
      console.log('🏢 VERIFICACIÓN - Estableciendo entidad:', entityId);
      dolibarrClient.setCurrentEntity(entityId);
    }

    console.log('🔍 VERIFICACIÓN - Datos extraídos recibidos:', {
      supplier: extractedData.supplier.name,
      productsCount: extractedData.products?.length || 0,
      invoiceNumber: extractedData.invoice?.number
    });

    // Verificar datos antes del procesamiento
    console.log('🔍 VERIFICACIÓN - Iniciando verificación de datos...');
    const verificationResult = await invoiceProcessor.verifyDataBeforeProcessing(extractedData);

    console.log('✅ VERIFICACIÓN - Verificación completada:', {
      canProcess: verificationResult.canProcess,
      supplierExists: verificationResult.supplier.exists,
      supplierNeedsCreation: verificationResult.supplier.needsCreation,
      productsCount: verificationResult.products.length,
      productsNeedingCreation: verificationResult.products.filter(p => p.needsCreation).length,
      isDuplicate: verificationResult.invoice.isDuplicate,
      warningsCount: verificationResult.warnings.length
    });

    return NextResponse.json({
      success: true,
      verification: verificationResult,
    });

  } catch (error) {
    console.error('❌ ERROR - Error verificando datos:', {
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined,
      extractedData: body?.extractedData ? {
        supplier: body.extractedData.supplier?.name,
        productsCount: body.extractedData.products?.length,
        invoiceNumber: body.extractedData.invoice?.number
      } : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Error verificando datos extraídos', 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'OCR Dolibarr API - Use POST to verify extracted data' },
    { status: 200 }
  );
} 