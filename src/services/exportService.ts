
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
  // Múltiplas estratégias para contornar CORS
  private async tryDownloadImage(url: string): Promise<Blob> {
    const strategies = [
      // Estratégia 1: CORS Proxy público
      () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
      
      // Estratégia 2: Outro CORS Proxy
      () => fetch(`https://cors-anywhere.herokuapp.com/${url}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }),
      
      // Estratégia 3: Canvas com crossOrigin
      () => this.downloadWithCanvas(url),
      
      // Estratégia 4: Fetch direto (pode funcionar em alguns casos)
      () => fetch(url, { mode: 'no-cors' }).then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response;
      })
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`Tentando estratégia ${i + 1} para: ${url}`);
        const response = await strategies[i]();
        
        if (response instanceof Blob) {
          return response;
        }
        
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            console.log(`Estratégia ${i + 1} funcionou!`);
            return blob;
          }
        }
      } catch (error) {
        console.log(`Estratégia ${i + 1} falhou:`, error);
        if (i === strategies.length - 1) {
          throw new Error(`Todas as estratégias falharam para ${url}`);
        }
      }
    }

    throw new Error('Não foi possível baixar a imagem');
  }

  private downloadWithCanvas(imageUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas não disponível'));
        return;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao carregar imagem'));
      }, 15000);
      
      img.onload = () => {
        clearTimeout(timeout);
        try {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob((blob) => {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              reject(new Error('Erro ao gerar blob da imagem'));
            }
          }, 'image/jpeg', 0.9);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Erro ao carregar imagem no canvas'));
      };
      
      // Tentar diferentes tamanhos de imagem
      img.src = imageUrl;
    });
  }

  async downloadSelectedCovers(items: MovieData[]): Promise<void> {
    if (items.length === 0) {
      throw new Error('Nenhum item selecionado');
    }

    const zip = new JSZip();
    let successCount = 0;
    const errors: string[] = [];
    
    try {
      console.log(`Iniciando download de ${items.length} capas...`);
      
      for (const item of items) {
        if (item.poster_path) {
          try {
            // Tentar diferentes tamanhos/qualidades
            const imageSizes = ['w500', 'w342', 'w185'];
            let blob: Blob | null = null;
            
            for (const size of imageSizes) {
              try {
                const imageUrl = `https://image.tmdb.org/t/p/${size}${item.poster_path}`;
                blob = await this.tryDownloadImage(imageUrl);
                break; // Se funcionou, sair do loop
              } catch (error) {
                console.log(`Falha no tamanho ${size}, tentando próximo...`);
              }
            }
            
            if (blob) {
              const filename = `${item.id}_${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
              zip.file(filename, blob);
              successCount++;
              console.log(`✓ Capa baixada: ${item.title || item.name}`);
            } else {
              throw new Error('Todas as tentativas de download falharam');
            }
            
          } catch (error) {
            const errorMsg = `${item.title || item.name}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        } else {
          errors.push(`${item.title || item.name}: Sem imagem disponível`);
        }
      }

      if (successCount === 0) {
        throw new Error(`Nenhuma capa foi baixada com sucesso. Isso pode ser devido a bloqueios de CORS. Tente novamente ou entre em contato com o suporte.`);
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
      
      // Se houve alguns erros mas pelo menos uma capa foi baixada
      if (errors.length > 0) {
        console.warn(`${successCount} capas baixadas com sucesso. ${errors.length} falharam:`, errors);
      }
      
    } catch (error) {
      console.error('Erro no download das capas:', error);
      throw error;
    }
  }

  async downloadCover(item: MovieData): Promise<void> {
    if (!item.poster_path) {
      throw new Error('Esta capa não possui imagem disponível');
    }

    try {
      // Tentar diferentes tamanhos
      const imageSizes = ['w500', 'w342', 'w185'];
      let blob: Blob | null = null;
      
      for (const size of imageSizes) {
        try {
          const imageUrl = `https://image.tmdb.org/t/p/${size}${item.poster_path}`;
          blob = await this.tryDownloadImage(imageUrl);
          break;
        } catch (error) {
          console.log(`Falha no tamanho ${size} para capa individual, tentando próximo...`);
        }
      }
      
      if (!blob) {
        throw new Error('Não foi possível baixar a capa. Tente novamente ou verifique sua conexão.');
      }
      
      // Download direto
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`✓ Capa individual baixada: ${item.title || item.name}`);
      
    } catch (error) {
      console.error('Erro ao baixar capa individual:', error);
      throw new Error('Erro ao baixar capa. Este problema pode estar relacionado a restrições de CORS. Tente novamente.');
    }
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }
}

export const exportService = new ExportService();
