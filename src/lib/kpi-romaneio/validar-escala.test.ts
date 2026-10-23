import { describe, it, expect } from 'vitest'
import { conferirEscala, mensagemEscalaRecusada, dataImpressaDoTexto } from './validar-escala'

// F1-13 (ING-07, plano mestre 23/10): a escala nao passava por nenhuma
// checagem. Em 17/10 entrou a escala de 16/10 (84 cargas 1002xx) e o PDF da
// Porto Frio na caixa de escala da' 0 linhas e era aceito. Cargas reais lidas
// com parseEscala/parseRomaneioComData dos PDFs guardados no Storage.
const ESCALA_16_10 = '100208 100213 100211 100214 100203 100204 100202 100207 100206 100205 100243 100234 100235 100240 100244 100229 100239 100230 100228 100233 100232 100278 100242 100226 100236 100237 100241 100286 100287 100245 100248 100257 100283 100262 100267 100272 100271 100251 100284 100285 100288 100290 100289 100250 100247 100269 100268 100270 100282 100261 100258 100249 100246 100238 100264 100265 100266 100263 100254 100253 100252 100259 100260 100281 100293 100274 100275 100255 100276 100277 100279 100280 100221 100225 100219 100223 100224 100216 100215 100218 100217 100220 100222 100227'.split(' ')
const ESCALA_17_10 = '100299 100300 100302 100301 100307 100304 100305 100306 100297 100303 100327 100340 100347 100325 100334 100336 100326 100322 100328 100321 100338 100329 100331 100330 100332 100333 100343 100344 100345 100367 100366 100354 100350 100357 100356 100369 100368 100341 100342 100353 100359 100358 100365 100349 100346 100339 100335 100337 100355 100352 100351 100364 100363 100362 100361 100370 100371 100372 100373 100374 100360 100375 100376 100377 100378 100318 100315 100313 100314 100309 100308 100311 100310 100316 100319 100312 100298'.split(' ')
const ROMANEIO_17_10 = '100297 100299 100300 100301 100302 100303 100304 100305 100306 100307 100308 100309 100310 100311 100312 100313 100314 100315 100316 100318 100319 100321 100322 100325 100326 100327 100328 100329 100330 100331 100332 100333 100334 100335 100336 100337 100338 100339 100340 100341 100342 100343 100344 100345 100346 100347 100349 100350 100351 100352 100353 100354 100355 100356 100357 100358 100359 100360 100361 100362 100363 100364 100365 100366 100367 100368 100369 100370 100371 100372 100373 100374 100375 100376 100377 100378'.split(' ')
const esc = (cs: string[]) => cs.map(carga => ({ carga }))
const rom = (cs: string[]) => cs.flatMap(carga => [{ carga }, { carga }])

describe('conferirEscala (F1-13)', () => {
  it('PDF da Porto Frio na caixa de escala (0 cargas lidas): recusa como vazia', () => {
    expect(conferirEscala([], rom(ROMANEIO_17_10))).toEqual({ motivo: 'vazia' })
  })
  it('escala de 16/10 com o romaneio de 17/10: 0 de 84 cargas casam -> recusa', () => {
    expect(conferirEscala(esc(ESCALA_16_10), rom(ROMANEIO_17_10))).toEqual({ motivo: 'nao_casa', casam: 0, total: 84 })
  })
  it('escala certa de 17/10 (76 das 77 cargas no romaneio): aceita', () => {
    expect(conferirEscala(esc(ESCALA_17_10), rom(ROMANEIO_17_10))).toBeNull()
  })
  it('metade exata casando: aceita; menos da metade: recusa', () => {
    expect(conferirEscala(esc(['1', '2', '3', '4']), rom(['1', '2']))).toBeNull()
    expect(conferirEscala(esc(['1', '2', '3', '4']), rom(['1']))).toEqual({ motivo: 'nao_casa', casam: 1, total: 4 })
  })
  it('sem romaneio para comparar (lista vazia): so\' a regra de vazia vale', () => {
    expect(conferirEscala(esc(ESCALA_16_10), [])).toBeNull()
  })
})

describe('mensagemEscalaRecusada (mesma nas duas rotas)', () => {
  it('vazia: diz que nao parece a Escala de Rota da Nutry', () => {
    expect(mensagemEscalaRecusada({ motivo: 'vazia' }, null)).toMatch(/nenhuma carga.*Escala de Rota/i)
  })
  it('de outro dia: mostra quantas casam e a data impressa no PDF', () => {
    const m = mensagemEscalaRecusada({ motivo: 'nao_casa', casam: 0, total: 84 }, '2026-10-16')
    expect(m).toContain('0 de 84')
    expect(m).toContain('16/10/2026')
  })
  it('sem data impressa legivel: mensagem sem data', () => {
    expect(mensagemEscalaRecusada({ motivo: 'nao_casa', casam: 3, total: 80 }, null)).not.toMatch(/impressa/)
  })
})

describe('dataImpressaDoTexto', () => {
  it('cabecalho real da 8081 de 16/10 ("16/10/2026 05:44")', () => {
    expect(dataImpressaDoTexto(['16/10/2026 05:44', '8081 - Escala de Rota', 'CARGA', '100208'])).toBe('2026-10-16')
  })
  it('sem data: null', () => {
    expect(dataImpressaDoTexto(['8081 - Escala de Rota', 'CARGA'])).toBeNull()
  })
})
