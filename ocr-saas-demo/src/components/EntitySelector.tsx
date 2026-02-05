'use client';

import { useState, useEffect } from 'react';
import { Store, ChevronDown, Check, RefreshCw, CloudCog } from 'lucide-react';
import { DolibarrEntity } from '@/types';

interface EntitySelectorProps {
  selectedEntityId: string | null;
  onEntityChange: (entityId: string | null) => void;
  disabled?: boolean;
}

export default function EntitySelector({ selectedEntityId, onEntityChange, disabled = false }: EntitySelectorProps) {
  const [entities, setEntities] = useState<DolibarrEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/entities');
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setEntities(data.entities || []);
      
      // Auto-select first entity if none selected
      if (!selectedEntityId && data.entities && data.entities.length > 0) {
        onEntityChange(data.entities[0].id);
      }
    } catch (error) {
      console.error('Error fetching entities:', error);
      setError(error instanceof Error ? error.message : 'Error cargando entidades');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  const selectedEntity = entities.find(entity => entity.id === selectedEntityId);

  const handleEntitySelect = (entityId: string) => {
    onEntityChange(entityId);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-xl">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
        </div>
        <span className="text-sm font-medium text-slate-600">Cargando entidades...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between bg-red-50/50 border border-red-200/50 rounded-xl p-4">
        <div className="flex items-center space-x-3 text-red-700">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
            {/* <Building2 className="w-4 h-4 text-red-600" /> */}
          </div>
          <span className="text-sm font-medium">Error: {error}</span>
        </div>
        <button
          onClick={fetchEntities}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-105"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex items-center space-x-3 text-slate-500 bg-slate-50/50 border border-slate-200/50 rounded-xl p-4">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
          {/* <Building2 className="w-4 h-4 text-slate-400" /> */}
        </div>
        <span className="text-sm font-medium">No se encontraron entidades</span>
      </div>
    );
  }

  // Paleta de colores para los iconos de entidades
  const entityColors = [
    '#045ADC', // azul corporativo
    '#F59E42', // naranja
    '#10B981', // verde
    '#F43F5E', // rojo
    '#6366F1', // violeta
    '#EAB308', // amarillo
    '#0EA5E9', // azul claro
    '#A21CAF', // púrpura
    '#F472B6', // rosa
    '#64748B', // gris
  ];

  return (
    <div className="relative">
      {/* Solo dejar el encabezado con icono, título y subtítulo una vez */}
      <div className="flex items-center gap-3 mb-8">
        <CloudCog className="w-6 h-6 text-[#045ADC]" />
        <div>
          <span className="text-lg font-bold text-slate-800 leading-tight">Configuración de Entidad</span>
          <div className="text-sm text-slate-500 leading-tight">Selecciona la entidad de Dolibarr para procesar las facturas</div>
        </div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-left transition-all duration-200 ${
            disabled
              ? 'bg-slate-100 cursor-not-allowed'
              : 'hover:border-[#045ADC] focus:outline-none focus:ring-2 focus:ring-[#045ADC]/20 focus:border-[#045ADC]'
          }`}
        >
          <span className="flex items-center space-x-2">
            <Store className="w-4 h-4" style={{ color: entityColors[entities.findIndex(e => e.id === selectedEntityId) % entityColors.length] || '#045ADC' }} />
            {selectedEntity ? (
              <span className="font-medium text-slate-900">{selectedEntity.label}</span>
            ) : (
              <span className="text-slate-400">Seleccionar entidad...</span>
            )}
            {selectedEntity?.country_code && (
              <span className="text-xs text-slate-400 ml-2">{selectedEntity.country_code}</span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {entities.map((entity, idx) => (
              <button
                key={entity.id}
                onClick={() => handleEntitySelect(entity.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 transition-all duration-150 ${selectedEntityId === entity.id ? 'bg-blue-50' : ''}`}
              >
                <span className="flex items-center space-x-2">
                  <Store className="w-4 h-4" style={{ color: entityColors[idx % entityColors.length] }} />
                  <span className="font-medium text-slate-900">{entity.label}</span>
                  {entity.country_code && (
                    <span className="text-xs text-slate-400 ml-2">{entity.country_code}</span>
                  )}
                </span>
                {selectedEntityId === entity.id && (
                  <Check className="w-4 h-4 text-[#045ADC]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 