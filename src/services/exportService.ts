
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
    if (items.length === 0) return;

    const zip = new JSZip();
    let successCount = 0;
    
    try {
      console.log(`Iniciando download de ${items.length} capas...`);
      
      for (const item of items) {
        if (item.poster_path) {
          try {
            const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
            console.log(`Baixando capa: ${imageUrl}`);
            
            const response = await fetch(imageUrl, {
              mode: 'cors',
              headers: {
                'Accept': 'image/*'
              }
            });
            
            if (response.ok) {
              const blob = await response.blob();
              console.log(`Capa baixada com sucesso: ${blob.size} bytes`);
              
              const filename = `${item.id}_${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
              zip.file(filename, blob);
              successCount++;
            } else {
              console.error(`Erro ao baixar ${imageUrl}: ${response.status}`);
            }
          } catch (error) {
            console.error(`Erro ao processar capa para ${item.title || item.name}:`, error);
          }
        } else {
          console.log(`Item ${item.title || item.name} não possui poster_path`);
        }
      }

      if (successCount === 0) {
        throw new Error('Nenhuma capa foi baixada com sucesso');
      }

      console.log(`${successCount} capas processadas com sucesso`);

      // Gerar e baixar o ZIP
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });
      
      console.log(`Arquivo ZIP gerado: ${content.size} bytes`);
      
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `capas_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Erro no download das capas:', error);
      throw error;
    }
  }

  async downloadCover(item: MovieData): Promise<void> {
    if (!item.poster_path) return;

    try {
      const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
      const response = await fetch(imageUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'image/*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar capa:', error);
      throw error;
    }
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }
}

export const exportService = new ExportService();
