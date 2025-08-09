
import JSZip from 'jszip';
import { MovieData } from './tmdbService';

export interface ExportData {
  movies: MovieData[];
  exportDate: string;
  metadata: {
    totalItems: number;
    exportedBy: string;
  };
}

class ExportService {
  async downloadSelectedCovers(items: MovieData[]): Promise<void> {
    if (items.length === 0) {
      throw new Error('Nenhum item selecionado');
    }

    const zip = new JSZip();
    let successCount = 0;
    const errors: string[] = [];
    
    try {
      // console.log(`Iniciando download de ${items.length} capas...`);
      
      for (const item of items) {
        if (item.poster_path) {
          try {
            const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
            
            // Usar canvas para cada imagem
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              errors.push(`Canvas não disponível para ${item.title || item.name}`);
              continue;
            }
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                try {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0);
                  
                  canvas.toBlob((blob) => {
                    if (blob) {
                      const filename = `${item.id}_${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
                      zip.file(filename, blob);
                      successCount++;
                      resolve();
                    } else {
                      reject(new Error('Erro ao gerar blob'));
                    }
                  }, 'image/jpeg', 0.9);
                } catch (error) {
                  reject(error);
                }
              };
              
              img.onerror = () => {
                reject(new Error(`Erro ao carregar ${imageUrl}`));
              };
              
              img.src = imageUrl;
            });
            
          } catch (error) {
            // console.error(`Erro ao processar capa para ${item.title || item.name}:`, error);
            errors.push(`${item.title || item.name}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
          }
        } else {
          errors.push(`${item.title || item.name}: Sem imagem disponível`);
        }
      }

      if (successCount === 0) {
        throw new Error(`Nenhuma capa foi baixada com sucesso. Erros: ${errors.join(', ')}`);
      }

      // console.log(`${successCount} capas processadas com sucesso`);

      // Gerar e baixar o ZIP
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });
      
      // console.log(`Arquivo ZIP gerado: ${content.size} bytes`);
      
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `capas_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      // Se houve alguns erros mas pelo menos uma capa foi baixada
      if (errors.length > 0) {
        // console.warn('Alguns downloads falharam:', errors);
      }
      
    } catch (error) {
      // console.error('Erro no download das capas:', error);
      throw error;
    }
  }

  async downloadCover(item: MovieData): Promise<void> {
    if (!item.poster_path) {
      throw new Error('Esta capa não possui imagem disponível');
    }

    try {
      const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
      
      // Usar um canvas para contornar problemas de CORS
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas não disponível');
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                resolve();
              } else {
                reject(new Error('Erro ao gerar imagem'));
              }
            }, 'image/jpeg', 0.9);
          } catch (error) {
            reject(new Error('Erro ao processar imagem'));
          }
        };
        
        img.onerror = () => {
          reject(new Error('Erro ao carregar imagem. Tente novamente.'));
        };
        
        img.src = imageUrl;
      });
    } catch (error) {
      // console.error('Erro ao baixar capa:', error);
      throw new Error('Erro ao baixar capa. Verifique sua conexão.');
    }
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }
}

export const exportService = new ExportService();
