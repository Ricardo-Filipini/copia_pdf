import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import { FileUp, FileCheck, Download, AlertCircle } from 'lucide-react';

// Tipo personalizado para erros do processamento de PDF
type PDFProcessingError = Error & {
  code?: string;
  details?: string;
};

function App() {
  const [contentPdf, setContentPdf] = useState<File | null>(null);
  const [stylePdf, setStylePdf] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resultPdf, setResultPdf] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = (e: unknown) => {
    console.error('Erro detalhado:', e);
    if (e instanceof Error) {
      const pdfError = e as PDFProcessingError;
      setError(pdfError.message || 'Ocorreu um erro inesperado ao processar os PDFs.');
    } else if (typeof e === 'string') {
      setError(e);
    } else {
      setError('Ocorreu um erro inesperado ao processar os PDFs.');
    }
  };

  const onDropContent = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      try {
        const file = acceptedFiles[0];
        if (!file.type || file.type !== 'application/pdf') {
          throw new Error('O arquivo selecionado não é um PDF válido.');
        }
        setContentPdf(file);
        setError(null);
        setResultPdf(null);
      } catch (e) {
        handleError(e);
      }
    }
  }, []);

  const onDropStyle = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      try {
        const file = acceptedFiles[0];
        if (!file.type || file.type !== 'application/pdf') {
          throw new Error('O arquivo selecionado não é um PDF válido.');
        }
        setStylePdf(file);
        setError(null);
        setResultPdf(null);
      } catch (e) {
        handleError(e);
      }
    }
  }, []);

  const { getRootProps: getContentRootProps, getInputProps: getContentInputProps } = useDropzone({
    onDrop: onDropContent,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  });

  const { getRootProps: getStyleRootProps, getInputProps: getStyleInputProps } = useDropzone({
    onDrop: onDropStyle,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  });

  const processPdfs = async () => {
    if (!contentPdf || !stylePdf) {
      setError('Por favor, selecione ambos os arquivos PDF antes de processar.');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setResultPdf(null);
      
      // Validar tamanho dos arquivos
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      if (contentPdf.size > MAX_SIZE) {
        throw new Error('O PDF de conteúdo deve ter menos de 10MB.');
      }
      if (stylePdf.size > MAX_SIZE) {
        throw new Error('O PDF de estilo deve ter menos de 10MB.');
      }

      // Carregar os PDFs
      let contentArrayBuffer: ArrayBuffer;
      try {
        contentArrayBuffer = await contentPdf.arrayBuffer();
      } catch (e) {
        const error = new Error('Erro ao ler o PDF de conteúdo. O arquivo pode estar corrompido.') as PDFProcessingError;
        error.code = 'CONTENT_READ_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }

      let styleArrayBuffer: ArrayBuffer;
      try {
        styleArrayBuffer = await stylePdf.arrayBuffer();
      } catch (e) {
        const error = new Error('Erro ao ler o PDF de estilo. O arquivo pode estar corrompido.') as PDFProcessingError;
        error.code = 'STYLE_READ_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }
      
      // Criar documentos PDF a partir dos arquivos
      let contentPdfDoc;
      try {
        contentPdfDoc = await PDFDocument.load(contentArrayBuffer);
      } catch (e) {
        const error = new Error('O arquivo de conteúdo não é um PDF válido ou está corrompido.') as PDFProcessingError;
        error.code = 'CONTENT_PARSE_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }

      let stylePdfDoc;
      try {
        stylePdfDoc = await PDFDocument.load(styleArrayBuffer);
      } catch (e) {
        const error = new Error('O arquivo de estilo não é um PDF válido ou está corrompido.') as PDFProcessingError;
        error.code = 'STYLE_PARSE_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }
      
      // Validar se os PDFs têm páginas
      if (contentPdfDoc.getPageCount() === 0) {
        const error = new Error('O PDF de conteúdo está vazio.') as PDFProcessingError;
        error.code = 'CONTENT_EMPTY';
        throw error;
      }
      if (stylePdfDoc.getPageCount() === 0) {
        const error = new Error('O PDF de estilo está vazio.') as PDFProcessingError;
        error.code = 'STYLE_EMPTY';
        throw error;
      }
      
      // Criar um novo documento para o resultado
      const resultPdfDoc = await PDFDocument.create();
      
      // Copiar páginas do PDF de conteúdo
      const contentPages = contentPdfDoc.getPages();
      const stylePages = stylePdfDoc.getPages();
      
      // Obter dimensões da primeira página do PDF de estilo
      const stylePage = stylePages[0];
      const { width: styleWidth, height: styleHeight } = stylePage.getSize();
      
      try {
        // Copiar cada página do conteúdo e aplicar o estilo
        for (let i = 0; i < contentPages.length; i++) {
          const contentPage = contentPages[i];
          
          // Criar uma nova página com as dimensões do PDF de estilo
          const newPage = resultPdfDoc.addPage([styleWidth, styleHeight]);
          
          // Extrair o texto do conteúdo
          const { width: contentWidth, height: contentHeight } = contentPage.getSize();
          
          // Calcular a escala para ajustar o conteúdo à nova página
          const scaleX = styleWidth / contentWidth;
          const scaleY = styleHeight / contentHeight;
          const scale = Math.min(scaleX, scaleY);
          
          // Calcular posição central
          const scaledWidth = contentWidth * scale;
          const scaledHeight = contentHeight * scale;
          const x = (styleWidth - scaledWidth) / 2;
          const y = (styleHeight - scaledHeight) / 2;
          
          // Embed the content page
          const embeddedPage = await resultPdfDoc.embedPage(contentPage);

          // Draw the embedded page onto the new page with scaling and position
          newPage.drawPage(embeddedPage, {
            x,
            y,
            xScale: scale,
            yScale: scale,
          });
        }
      } catch (e) {
        const error = new Error('Erro ao processar as páginas do PDF. Por favor, verifique se os arquivos são válidos.') as PDFProcessingError;
        error.code = 'PAGE_PROCESSING_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }
      
      // Salvar o PDF resultante
      try {
        const pdfBytes = await resultPdfDoc.save();
        setResultPdf(pdfBytes);
      } catch (e) {
        const error = new Error('Erro ao gerar o PDF final. Por favor, tente novamente.') as PDFProcessingError;
        error.code = 'SAVE_ERROR';
        error.details = e instanceof Error ? e.message : 'Erro desconhecido';
        throw error;
      }
      
    } catch (error) {
      handleError(error);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultPdf) return;
    
    try {
      const blob = new Blob([resultPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resultado_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
          Transferência de Estilo PDF
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Dropzone para PDF de Conteúdo */}
          <div
            {...getContentRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
              contentPdf ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500'
            }`}
          >
            <input {...getContentInputProps()} />
            <div className="flex flex-col items-center">
              {contentPdf ? (
                <>
                  <FileCheck className="w-12 h-12 text-green-500 mb-2" />
                  <p className="text-green-600 text-center">{contentPdf.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(contentPdf.size / 1024 / 1024).toFixed(2)}MB
                  </p>
                </>
              ) : (
                <>
                  <FileUp className="w-12 h-12 text-gray-400 mb-2" />
                  <p className="text-gray-500 text-center">
                    Arraste ou clique para selecionar o PDF de conteúdo
                  </p>
                  <p className="text-sm text-gray-400 mt-1">Máximo: 10MB</p>
                </>
              )}
            </div>
          </div>

          {/* Dropzone para PDF de Estilo */}
          <div
            {...getStyleRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
              stylePdf ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500'
            }`}
          >
            <input {...getStyleInputProps()} />
            <div className="flex flex-col items-center">
              {stylePdf ? (
                <>
                  <FileCheck className="w-12 h-12 text-green-500 mb-2" />
                  <p className="text-green-600 text-center">{stylePdf.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(stylePdf.size / 1024 / 1024).toFixed(2)}MB
                  </p>
                </>
              ) : (
                <>
                  <FileUp className="w-12 h-12 text-gray-400 mb-2" />
                  <p className="text-gray-500 text-center">
                    Arraste ou clique para selecionar o PDF de estilo
                  </p>
                  <p className="text-sm text-gray-400 mt-1">Máximo: 10MB</p>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <button
            onClick={processPdfs}
            disabled={!contentPdf || !stylePdf || processing}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processando...
              </>
            ) : (
              'Processar PDFs'
            )}
          </button>

          {resultPdf && (
            <button
              onClick={downloadResult}
              className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Baixar Resultado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
