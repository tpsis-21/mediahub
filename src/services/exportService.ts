
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
  async exportSelectedItems(items: MovieData[], userEmail?: string): Promise<void> {
    const zip = new JSZip();
    
    // Criar JSON com metadados
    const exportData: ExportData = {
      movies: items.map(item => ({
        ...item,
        // Adicionar URLs completas das imagens
        poster_url: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
        backdrop_url: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : ''
      })),
      exportDate: new Date().toISOString(),
      metadata: {
        totalItems: items.length,
        exportedBy: userEmail || 'anonymous'
      }
    };

    zip.file('metadata.json', JSON.stringify(exportData, null, 2));

    // Baixar capas (simulado - em produção, fazer download real)
    const coversFolder = zip.folder('covers');
    
    for (const item of items) {
      if (item.poster_path) {
        try {
          // Em produção, fazer fetch da imagem real
          const filename = `${item.id}_${(item.title || item.name || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
          
          // Simulando adição de arquivo de imagem
          coversFolder?.file(filename, 'fake-image-data', { base64: true });
        } catch (error) {
          console.error(`Erro ao baixar capa para ${item.title || item.name}:`, error);
        }
      }
    }

    // Gerar e baixar o ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `movie_export_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  async downloadCover(item: MovieData): Promise<void> {
    if (!item.poster_path) return;

    try {
      const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
      const response = await fetch(imageUrl);
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
    }
  }

  async downloadSelectedCovers(items: MovieData[]): Promise<void> {
    const zip = new JSZip();
    
    for (const item of items) {
      if (item.poster_path) {
        try {
          const imageUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          const filename = `${(item.title || item.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
          zip.file(filename, blob);
        } catch (error) {
          console.error(`Erro ao baixar capa para ${item.title || item.name}:`, error);
        }
      }
    }

    // Gerar e baixar o ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `covers_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }
}

export const exportService = new ExportService();
