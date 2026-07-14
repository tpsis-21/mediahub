import { buildApiUrl } from '@/services/apiClient';

export const getPosterUrl = (args: { posterPath: string; size: string }) => {
  const params = new URLSearchParams();
  params.set('size', args.size);
  params.set('path', args.posterPath);
  return buildApiUrl(`/api/search/image?${params.toString()}`);
};
