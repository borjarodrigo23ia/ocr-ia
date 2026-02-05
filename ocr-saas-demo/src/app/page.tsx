'use client';

import FileDropzone from '@/components/FileDropzone';
import { WandSparkles, HandCoins } from 'lucide-react';

export default function Home() {
  // Handler para abrir las facturas en una nueva pestaña
  const handleFacturasClick = () => {
    window.open('https://frontdemo.onnadigital.com/fourn/facture/list.php', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Banner superior con color corporativo y aún más alto */}
      <div className="w-full bg-[#6ABBD9] py-28 shadow-md">
        <div className="container mx-auto flex flex-col items-center justify-center">
          <h1
            className="text-5xl font-extrabold tracking-tight text-white drop-shadow-lg mb-3 transition-all duration-700 ease-out opacity-0 translate-y-6 animate-[fadeInDown_0.8s_ease-out_forwards]"
            style={{
              animationName: 'fadeInDown',
              animationDuration: '0.8s',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'forwards',
            }}
          >
            Doligestion OCR
          </h1>
          <p className="text-xl text-gray-700 max-w-2xl text-center mb-4 font-bold">
            Facturación con Inteligencia Artificial y OCR conectada a tu ERP.
          </p>
        </div>
      </div>

      {/* Menú selector tipo tabs con azul oscuro para el tab activo */}
      <div className="w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto max-w-6xl flex items-center justify-center">
          <nav className="flex space-x-2 mt-[-1.5rem]">
            <button
              className="px-6 py-3 rounded-t-lg font-semibold text-lg transition-all duration-200 focus:outline-none flex items-center gap-2 bg-[#082653] text-white shadow"
            >
              <WandSparkles className="w-5 h-5" />
              Procesamiento
            </button>
            <button
              className="px-6 py-3 rounded-t-lg font-semibold text-lg transition-all duration-200 focus:outline-none flex items-center gap-2 bg-gray-100 text-[#082653] hover:bg-white hover:text-[#082653] hover:shadow-[0_0_12px_2px_#045ADC55] hover:z-10"
              onClick={handleFacturasClick}
              type="button"
            >
              <HandCoins className="w-5 h-5" />
              Facturas
            </button>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-8 md:px-16 py-8 max-w-6xl">
        {/* Main Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <FileDropzone />
        </div>

        {/* Footer eliminado */}
      </div>
    </div>
  );
} 