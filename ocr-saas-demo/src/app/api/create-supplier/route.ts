import { NextRequest, NextResponse } from 'next/server';
import { dolibarrClient } from '@/lib/dolibarr';
import { EditableExtractedData } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierData } = body as { supplierData: EditableExtractedData['supplier'] };

    if (!supplierData) {
      return NextResponse.json(
        { error: 'No se encontraron datos del proveedor' },
        { status: 400 }
      );
    }

    console.log('🏢 Creando proveedor en Dolibarr...');

    // Check if supplier already exists
    const existingSupplier = await dolibarrClient.getThirdPartyByName(supplierData.name);
    
    if (existingSupplier) {
      return NextResponse.json({
        success: true,
        supplierId: existingSupplier.id,
        message: 'Proveedor ya existe en Dolibarr',
        isNew: false
      });
    }

    // Create new supplier
    const supplierPayload = {
      name: supplierData.name,
      name_alias: supplierData.name,
      client: "0",
      prospect: "0", 
      fournisseur: "1",
      email: supplierData.email || '',
      phone: supplierData.phone || '',
      address: supplierData.address || '',
      zip: supplierData.zip || '',
      town: supplierData.city || '',
      country_id: "1", // Spain
      tva_assuj: "1",
      tva_intra: supplierData.vatNumber || '',
      status: "1",
      note_public: `Proveedor creado vía OCR-ONNA. Ref: ${supplierData.ref}`,
      default_lang: "es_ES",
      mode_reglement_supplier_id: 2, // Bank transfer
      cond_reglement_supplier_id: 1, // Due upon receipt
      fk_user_creat: 1,
    };

    const newSupplierId = await dolibarrClient.createThirdParty(supplierPayload);

    console.log('✅ Proveedor creado exitosamente:', newSupplierId);

    return NextResponse.json({
      success: true,
      supplierId: newSupplierId,
      message: 'Proveedor creado exitosamente en Dolibarr',
      isNew: true
    });

  } catch (error) {
    console.error('❌ Error creando proveedor:', error);
    return NextResponse.json(
      { 
        error: 'Error creando proveedor en Dolibarr', 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
} 