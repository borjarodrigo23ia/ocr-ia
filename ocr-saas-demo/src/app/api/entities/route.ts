import { NextRequest, NextResponse } from 'next/server';
import { dolibarrClient } from '@/lib/dolibarr';

export async function GET() {
  try {
    console.log('🏢 ENTIDADES - Obteniendo entidades de multicompany...');
    
    const entities = await dolibarrClient.getEntities();
    
    console.log('✅ ENTIDADES - Entidades obtenidas exitosamente:', {
      count: entities.length,
      entities: entities.map(e => ({ id: e.id, label: e.label }))
    });

    return NextResponse.json({
      success: true,
      entities: entities
    });
  } catch (error) {
    console.error('❌ ERROR - Error obteniendo entidades:', error);
    return NextResponse.json(
      { 
        error: 'Error obteniendo entidades de multicompany', 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🏢 ENTIDADES - Configurando entidad activa');
    
    const body = await request.json();
    const { entityId } = body;

    if (!entityId) {
      console.error('❌ ERROR - ID de entidad no proporcionado');
      return NextResponse.json(
        { error: 'ID de entidad requerido' },
        { status: 400 }
      );
    }

    // Set the current entity in the Dolibarr client
    dolibarrClient.setCurrentEntity(entityId);

    // Optionally verify the entity exists
    const entity = await dolibarrClient.getEntityById(entityId);
    
    if (!entity) {
      console.error('❌ ERROR - Entidad no encontrada:', entityId);
      return NextResponse.json(
        { error: 'Entidad no encontrada' },
        { status: 404 }
      );
    }

    console.log('✅ ENTIDADES - Entidad configurada exitosamente:', {
      id: entity.id,
      label: entity.label
    });

    return NextResponse.json({
      success: true,
      entity,
      message: `Entidad "${entity.label}" configurada correctamente`
    });

  } catch (error) {
    console.error('❌ ERROR - Error configurando entidad:', {
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Error configurando entidad', 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
} 