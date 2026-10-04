import { Track } from '../types';
import { SearchService } from './searchService';

/**
 * MusicApi é uma camada de compatibilidade que redireciona para o SearchService,
 * garantindo que a HomeScreen, RecommendationEngine e outros módulos existentes
 * acessem o catálogo global profundo sem quebrar nenhuma interface.
 */
export class MusicApi {
  static async searchTracks(query: string): Promise<Track[]> {
    const result = await SearchService.searchTracks(query, 0, 30);
    return result.tracks;
  }

  static async getTrendingTracks(): Promise<Track[]> {
    return await SearchService.getTrendingTracks(30);
  }
}
