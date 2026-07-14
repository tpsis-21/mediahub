import { createCanvas } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildIndividualBannerTemplates,
  generateIndividualBanner,
} from '../bulk-individual-layout'
import {
  generateRankingBannerEmAlta,
  generateRankingBannerTop10Cartaz,
  type RankingLayoutOptions,
} from '../bulk-ranking-layout'
import {
  configureFootballLayoutLoaders,
  footballMatchKey,
  generateFootballBanner,
  parseClockTime,
} from '../football-layout'
import { drawRankBadgeSquare } from '../bulk-ranking'

const sampleMovie = (id: number, title: string) => ({
  id,
  title,
  name: '',
  release_date: '2024-01-15',
  first_air_date: '',
  overview: 'Sinopse de teste para smoke de layout.',
  poster_path: '',
  backdrop_path: '',
  vote_average: 8.2,
  genre_ids: [1],
  media_type: 'movie' as const,
})

const rankingOptions: RankingLayoutOptions = {
  colorVariant: 'classic',
  footerIncludePhone: false,
  footerIncludeWebsite: false,
  brand: { brandName: 'MediaHub Smoke' },
}

beforeAll(() => {
  const g = globalThis as typeof globalThis & {
    document?: { createElement: (tag: string) => unknown }
  }

  ;(g as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`createElement não suportado: ${tag}`)
      return createCanvas(1, 1)
    },
  }

  configureFootballLayoutLoaders({
    loadImage: async () => null,
    loadBrandLogoImage: async () => null,
    loadFootballCrestImage: async () => null,
    loadImageFirstAvailable: async () => null,
  })
})

describe('banner layouts smoke', () => {
  it('buildIndividualBannerTemplates inclui marca quando há cores', () => {
    const templates = buildIndividualBannerTemplates({ primary: '#112233', secondary: '#445566' })
    expect(templates[0]?.id).toBe(100)
    expect(templates.length).toBeGreaterThanOrEqual(4)
  })

  it('generateIndividualBanner gera PNG sem poster', async () => {
    const blob = await generateIndividualBanner(
      sampleMovie(1, 'Smoke Individual'),
      buildIndividualBannerTemplates()[0],
      { width: 1080, height: 1080, label: 'square' }
    )
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toMatch(/image\/png/)
  })

  it('generateRankingBannerEmAlta gera PNG', async () => {
    const items = Array.from({ length: 5 }, (_, i) => sampleMovie(i + 1, `Filme ${i + 1}`))
    const blob = await generateRankingBannerEmAlta({
      items,
      category: 'movie',
      format: { width: 1080, height: 1080 },
      rankOffset: 0,
      options: rankingOptions,
    })
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('generateRankingBannerTop10Cartaz gera PNG story', async () => {
    const items = Array.from({ length: 10 }, (_, i) => sampleMovie(i + 1, `Filme ${i + 1}`))
    const blob = await generateRankingBannerTop10Cartaz({
      items,
      category: 'all',
      format: { width: 1080, height: 1920 },
      rankOffset: 0,
      rangeLabel: '1–10',
      options: rankingOptions,
    })
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('generateFootballBanner gera PNG informativo', async () => {
    const blob = await generateFootballBanner({
      brandPrimary: '#2563eb',
      brandSecondary: '#7c3aed',
      brandName: 'MediaHub',
      date: '2026-07-12',
      matches: [
        {
          time: '21:00',
          home: 'Flamengo',
          away: 'Palmeiras',
          channels: ['Canal A'],
        },
        {
          time: '16:00',
          home: 'Corinthians',
          away: 'Santos',
          channels: ['Canal B'],
        },
      ],
      format: 'square',
      templateId: 'informativo',
      pageIndex: 0,
      pageCount: 1,
    })
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('helpers futebol / badge continuam estáveis', () => {
    expect(parseClockTime('21h05')).toBe('21:05')
    expect(
      footballMatchKey({ time: '21:05', home: 'Flamengo', away: 'Palmeiras' })
    ).toContain('flamengo')

    const canvas = createCanvas(80, 80)
    const ctx = canvas.getContext('2d')
    expect(() =>
      drawRankBadgeSquare({ ctx: ctx as unknown as CanvasRenderingContext2D, x: 4, y: 4, size: 40, text: '1º' })
    ).not.toThrow()
  })
})
